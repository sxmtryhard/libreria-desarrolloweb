import type { Role, Session } from "@/shared/schema";
import { ConflictError, NotFoundError } from "@/shared/server/errors";
import { requireRole } from "@/shared/server/session";
import {
  type BorrowerRole,
  BorrowerRoleSchema,
  type LendBookInput,
  type Loan,
  type NewLoan,
  type ReturnBookInput,
  type ReturnedLoan,
} from "../schema";
import { calculateFine } from "./fine";
import type { BorrowerDirectory, LendState, LoanRepository, ReturnOutcome } from "./repository";

/** Roles que pueden prestar y recibir devoluciones (specs F5 y F6, Autorización). */
const LEND_ROLES: readonly Role[] = ["BIBLIOTECARIO", "ADMINISTRADOR"];

/** Días de préstamo según el rol del prestatario (spec F5, regla 2.1). */
const LOAN_DAYS: Record<BorrowerRole, number> = { EXTERNO: 7, ESTUDIANTE: 14, DOCENTE: 30 };

/** Préstamos activos a la vez según el rol (spec F5, regla 3.3). */
const MAX_ACTIVE_LOANS: Record<BorrowerRole, number> = { EXTERNO: 1, ESTUDIANTE: 3, DOCENTE: 5 };

const DAY_MS = 24 * 60 * 60 * 1000;

export interface LoanServiceDeps {
  loans: LoanRepository;
  borrowers: BorrowerDirectory;
}

export interface LoanService {
  /** Lanza `ForbiddenError` si la sesión no puede prestar. La ruta la llama antes de leer el cuerpo. */
  assertCanLend(session: Session): void;
  lend(session: Session, input: LendBookInput, now: Date): Promise<Loan>;
  /** Lanza `ForbiddenError` si la sesión no puede registrar devoluciones (spec F6). */
  assertCanReturn(session: Session): void;
  returnBook(session: Session, input: ReturnBookInput, now: Date): Promise<ReturnedLoan>;
}

/** Traduce el resultado del repositorio a errores (spec F6, reglas 1.5 y 1.6). */
function returnedLoanOf(outcome: ReturnOutcome): Loan {
  if (outcome.kind === "no_book") {
    throw new NotFoundError("No existe ese libro.");
  }
  if (outcome.kind === "no_active_loan") {
    throw new NotFoundError("La persona no tiene prestado este libro.");
  }
  return outcome.loan;
}

/** Un préstamo activo está vencido cuando el momento actual es posterior a `due_at` (spec F5, regla 2.4). */
function isOverdue(loan: Loan, now: Date): boolean {
  return now.getTime() > new Date(loan.due_at).getTime();
}

function borrowerRoleOf(role: Role): BorrowerRole {
  const parsed = BorrowerRoleSchema.safeParse(role);
  if (!parsed.success) {
    throw new ConflictError("El personal no puede recibir préstamos.");
  }
  return parsed.data;
}

/** Comprueba los rechazos en el orden de la regla 3.5. Función pura: el repositorio puede reintentarla. */
function assertCanBorrow(state: LendState, bookId: string, role: BorrowerRole, now: Date): void {
  if (state.availableCopies === null) {
    throw new NotFoundError("No existe ese libro.");
  }
  if (state.activeLoans.some((loan) => isOverdue(loan, now))) {
    throw new ConflictError("La persona tiene préstamos vencidos.");
  }
  if (state.activeLoans.some((loan) => loan.book_id === bookId)) {
    throw new ConflictError("La persona ya tiene prestado este libro.");
  }
  if (state.activeLoans.length >= MAX_ACTIVE_LOANS[role]) {
    throw new ConflictError("La persona ya alcanzó su límite de préstamos.");
  }
  if (state.availableCopies < 1) {
    throw new ConflictError("No hay ejemplares disponibles de este libro.");
  }
}

export function createLoanService(deps: LoanServiceDeps): LoanService {
  function assertCanLend(session: Session): void {
    requireRole(session, LEND_ROLES);
  }

  async function lend(session: Session, input: LendBookInput, now: Date): Promise<Loan> {
    assertCanLend(session);
    const borrower = await deps.borrowers.findByEmail(input.borrower_email);
    if (borrower === null) {
      throw new NotFoundError("No existe una cuenta con ese correo.");
    }
    if (!borrower.active) {
      throw new ConflictError("La cuenta está desactivada.");
    }
    const role = borrowerRoleOf(borrower.role);
    const loan: NewLoan = {
      book_id: input.book_id,
      borrower_uid: borrower.uid,
      lent_by_uid: session.uid,
      loaned_at: now.toISOString(),
      due_at: new Date(now.getTime() + LOAN_DAYS[role] * DAY_MS).toISOString(),
      returned_at: null,
    };
    return deps.loans.lend(input.book_id, borrower.uid, (state) => {
      assertCanBorrow(state, input.book_id, role, now);
      return loan;
    });
  }

  function assertCanReturn(session: Session): void {
    requireRole(session, LEND_ROLES);
  }

  async function returnBook(session: Session, input: ReturnBookInput, now: Date): Promise<ReturnedLoan> {
    assertCanReturn(session);
    const borrower = await deps.borrowers.findByEmail(input.borrower_email);
    if (borrower === null) {
      throw new NotFoundError("No existe una cuenta con ese correo.");
    }
    const outcome = await deps.loans.returnLoan(input.book_id, borrower.uid, now.toISOString());
    const loan = returnedLoanOf(outcome);
    const fine = calculateFine(loan, now);
    return { loan, returned_late: fine.days_late > 0, days_late: fine.days_late, fine_amount: fine.fine_amount };
  }

  return { assertCanLend, lend, assertCanReturn, returnBook };
}
