import type { Role } from "@/shared/schema";
import type { Loan, NewLoan } from "../schema";
import type {
  BookCatalog,
  BookInfo,
  Borrower,
  BorrowerDirectory,
  LendState,
  LoanRepository,
  ReturnOutcome,
} from "./repository";

export interface MemoryBorrowerDirectory extends BorrowerDirectory {
  add(uid: string, email: string, role: Role): void;
}

/** Cuentas en memoria, para las pruebas. */
export function createMemoryBorrowerDirectory(): MemoryBorrowerDirectory {
  const byEmail = new Map<string, Borrower>();
  return {
    add(uid: string, email: string, role: Role): void {
      byEmail.set(email, { uid, role });
    },
    findByEmail(email: string): Promise<Borrower | null> {
      return Promise.resolve(byEmail.get(email) ?? null);
    },
  };
}

export interface MemoryBookCatalog extends BookCatalog {
  add(bookId: string, title: string, author: string): void;
}

/** Títulos y autores en memoria, para las pruebas. */
export function createMemoryBookCatalog(): MemoryBookCatalog {
  const byId = new Map<string, BookInfo>();
  return {
    add(bookId: string, title: string, author: string): void {
      byId.set(bookId, { title, author });
    },
    findBook(bookId: string): Promise<BookInfo | null> {
      return Promise.resolve(byId.get(bookId) ?? null);
    },
  };
}

export interface MemoryLoanRepository extends LoanRepository {
  /** Crea o cambia un libro con sus ejemplares disponibles. */
  setBook(bookId: string, availableCopies: number): void;
  availableCopies(bookId: string): number | null;
  /** Añade un préstamo ya existente sin tocar los disponibles. */
  seedLoan(loan: NewLoan): Loan;
  all(): Loan[];
}

/** Préstamos en memoria, para las pruebas. `lend` es síncrono por dentro, así que es atómico. */
export function createMemoryLoanRepository(): MemoryLoanRepository {
  const copies = new Map<string, number>();
  const loans: Loan[] = [];

  function store(loan: NewLoan): Loan {
    const created: Loan = { ...loan, id: `loan-${loans.length + 1}` };
    loans.push(created);
    return created;
  }

  function lendNow(bookId: string, borrowerUid: string, decide: (state: LendState) => NewLoan): Loan {
    const available = copies.get(bookId) ?? null;
    const activeLoans = loans.filter((loan) => loan.borrower_uid === borrowerUid && loan.returned_at === null);
    const created = store(decide({ availableCopies: available, activeLoans }));
    copies.set(bookId, (available ?? 0) - 1);
    return created;
  }

  function returnNow(bookId: string, borrowerUid: string, returnedAt: string): ReturnOutcome {
    const available = copies.get(bookId);
    if (available === undefined) {
      return { kind: "no_book" };
    }
    const index = loans.findIndex(
      (loan) => loan.book_id === bookId && loan.borrower_uid === borrowerUid && loan.returned_at === null,
    );
    const active = loans[index];
    if (active === undefined) {
      return { kind: "no_active_loan" };
    }
    const returned: Loan = { ...active, returned_at: returnedAt };
    loans[index] = returned;
    copies.set(bookId, available + 1);
    return { kind: "returned", loan: returned };
  }

  return {
    setBook(bookId: string, availableCopies: number): void {
      copies.set(bookId, availableCopies);
    },
    availableCopies(bookId: string): number | null {
      return copies.get(bookId) ?? null;
    },
    seedLoan: store,
    all(): Loan[] {
      return [...loans];
    },
    lend(bookId: string, borrowerUid: string, decide: (state: LendState) => NewLoan): Promise<Loan> {
      try {
        return Promise.resolve(lendNow(bookId, borrowerUid, decide));
      } catch (error) {
        return Promise.reject(error);
      }
    },
    returnLoan(bookId: string, borrowerUid: string, returnedAt: string): Promise<ReturnOutcome> {
      return Promise.resolve(returnNow(bookId, borrowerUid, returnedAt));
    },
    listActive(borrowerUid: string): Promise<Loan[]> {
      return Promise.resolve(loans.filter((loan) => loan.borrower_uid === borrowerUid && loan.returned_at === null));
    },
  };
}
