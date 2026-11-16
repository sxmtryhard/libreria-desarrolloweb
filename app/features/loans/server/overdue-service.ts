import type { Role, Session } from "@/shared/schema";
import { ForbiddenError, NotFoundError } from "@/shared/server/errors";
import {
  type Loan,
  type OverdueLoan,
  type OverdueLoansResponse,
  type OverdueQuery,
  StaffOverdueQuerySchema,
} from "../schema";
import { calculateFine } from "./fine";
import type { BookCatalog, BorrowerDirectory, LoanRepository } from "./repository";

/** Roles que pueden consultar los vencidos de cualquier persona (spec F8, regla 4.4). */
const STAFF_ROLES: readonly Role[] = ["BIBLIOTECARIO", "ADMINISTRADOR"];

export interface OverdueServiceDeps {
  loans: LoanRepository;
  borrowers: BorrowerDirectory;
  books: BookCatalog;
}

export interface OverdueService {
  /** Vencidos de una persona, con su multa hasta `now` (spec F8). */
  list(session: Session, query: OverdueQuery, now: Date): Promise<OverdueLoansResponse>;
}

/** Más atrasado primero; a igual vencimiento, por identificador (regla 1.3). */
function compareOverdue(left: Loan, right: Loan): number {
  const byDue = new Date(left.due_at).getTime() - new Date(right.due_at).getTime();
  if (byDue !== 0) {
    return byDue;
  }
  if (left.id < right.id) {
    return -1;
  }
  if (left.id > right.id) {
    return 1;
  }
  return 0;
}

export function createOverdueService(deps: OverdueServiceDeps): OverdueService {
  /** De quién se listan los vencidos, según quién pregunta (regla 4). */
  async function borrowerUidFor(session: Session, query: OverdueQuery): Promise<string> {
    if (!STAFF_ROLES.includes(session.role)) {
      if (query.borrower_email !== undefined && query.borrower_email !== session.email.trim().toLowerCase()) {
        throw new ForbiddenError();
      }
      return session.uid;
    }
    const required = StaffOverdueQuerySchema.parse(query);
    const borrower = await deps.borrowers.findByEmail(required.borrower_email);
    if (borrower === null) {
      throw new NotFoundError("No existe una cuenta con ese correo.");
    }
    return borrower.uid;
  }

  async function describe(loan: Loan, now: Date): Promise<OverdueLoan> {
    const book = await deps.books.findBook(loan.book_id);
    const fine = calculateFine(loan, now);
    return {
      loan_id: loan.id,
      book_id: loan.book_id,
      book_title: book?.title ?? null,
      book_author: book?.author ?? null,
      loaned_at: loan.loaned_at,
      due_at: loan.due_at,
      days_late: fine.days_late,
      fine_amount: fine.fine_amount,
    };
  }

  async function list(session: Session, query: OverdueQuery, now: Date): Promise<OverdueLoansResponse> {
    const borrowerUid = await borrowerUidFor(session, query);
    const active = await deps.loans.listActive(borrowerUid);
    const overdue = active.filter((loan) => calculateFine(loan, now).days_late > 0).sort(compareOverdue);
    const described = await Promise.all(overdue.map((loan) => describe(loan, now)));
    return {
      borrower_uid: borrowerUid,
      overdue_loans: described,
      total_fine_amount: described.reduce((sum, loan) => sum + loan.fine_amount, 0),
    };
  }

  return { list };
}
