import type { Session } from "@/shared/schema";
import { ForbiddenError } from "@/shared/server/errors";
import { BorrowerRoleSchema, type Loan, type MyLoan, type MyLoansResponse } from "../schema";
import type { BookCatalog, LoanRepository } from "./repository";

export interface MyLoansServiceDeps {
  loans: LoanRepository;
  books: BookCatalog;
}

export interface MyLoansService {
  /** Préstamos activos de la persona de la sesión, el que vence antes primero (spec F35, regla 2). */
  listActive(session: Session, now: Date): Promise<MyLoansResponse>;
}

/** El que vence antes, primero; a igual vencimiento, por identificador (regla 2.2). */
function compareByDue(left: Loan, right: Loan): number {
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

export function createMyLoansService(deps: MyLoansServiceDeps): MyLoansService {
  async function describe(loan: Loan, now: Date): Promise<MyLoan> {
    const book = await deps.books.findBook(loan.book_id);
    return {
      loan_id: loan.id,
      book_id: loan.book_id,
      book_title: book?.title ?? null,
      book_author: book?.author ?? null,
      loaned_at: loan.loaned_at,
      due_at: loan.due_at,
      overdue: now.getTime() > new Date(loan.due_at).getTime(),
    };
  }

  async function listActive(session: Session, now: Date): Promise<MyLoansResponse> {
    // Solo los prestatarios tienen préstamos propios (regla 1.3); la identidad sale de la sesión.
    if (!BorrowerRoleSchema.safeParse(session.role).success) {
      throw new ForbiddenError();
    }
    const active = await deps.loans.listActive(session.uid);
    const sorted = [...active].sort(compareByDue);
    return { loans: await Promise.all(sorted.map((loan) => describe(loan, now))) };
  }

  return { listActive };
}
