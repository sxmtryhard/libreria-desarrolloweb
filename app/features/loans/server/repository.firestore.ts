import "server-only";
import { z } from "zod";
import { AccountSchema, isAccountActive } from "@/shared/schema";
import { ACCOUNTS_COLLECTION, getAdminFirestore } from "@/shared/server/firebase-admin";
import { type Loan, LoanSchema, type NewLoan, NewLoanSchema } from "../schema";
import type {
  BookCatalog,
  BookInfo,
  Borrower,
  BorrowerDirectory,
  LendState,
  LoanRepository,
  ReturnOutcome,
} from "./repository";

const LOANS_COLLECTION = "loans";
/** Misma colección que usa el catálogo. Préstamos solo lee y cambia `available_copies`. */
const BOOKS_COLLECTION = "books";

/** Lo único que préstamos necesita de un documento de libro. */
const BookCopiesSchema = z.object({ available_copies: z.number().int().min(0) });

/** Lo que préstamos muestra de un libro (spec F8, regla 2.1). */
const BookInfoSchema = z.object({ title: z.string(), author: z.string() });

/** Catálogo en Firestore, visto desde préstamos: solo título y autor. */
export function createFirestoreBookCatalog(): BookCatalog {
  return {
    async findBook(bookId: string): Promise<BookInfo | null> {
      const snapshot = await getAdminFirestore().collection(BOOKS_COLLECTION).doc(bookId).get();
      if (!snapshot.exists) {
        return null;
      }
      const book = BookInfoSchema.parse(snapshot.data());
      return { title: book.title, author: book.author };
    },
  };
}

/** Cuentas en Firestore, vistas desde préstamos (spec F5, reglas 1.3–1.5). */
export function createFirestoreBorrowerDirectory(): BorrowerDirectory {
  return {
    async findByEmail(email: string): Promise<Borrower | null> {
      const found = await getAdminFirestore()
        .collection(ACCOUNTS_COLLECTION)
        .where("email", "==", email)
        .limit(1)
        .get();
      const document = found.docs[0];
      if (document === undefined) {
        return null;
      }
      const account = AccountSchema.parse(document.data());
      return { uid: document.id, role: account.role, active: isAccountActive(account) };
    },
  };
}

/** Préstamos en Firestore (ADR-0003). Prestar ocurre dentro de una transacción (spec F5, regla 4.2). */
export function createFirestoreLoanRepository(): LoanRepository {
  return {
    lend(bookId: string, borrowerUid: string, decide: (state: LendState) => NewLoan): Promise<Loan> {
      const firestore = getAdminFirestore();
      const loans = firestore.collection(LOANS_COLLECTION);
      const bookReference = firestore.collection(BOOKS_COLLECTION).doc(bookId);
      const activeQuery = loans.where("borrower_uid", "==", borrowerUid).where("returned_at", "==", null);

      return firestore.runTransaction(async (transaction) => {
        const bookSnapshot = await transaction.get(bookReference);
        const activeSnapshot = await transaction.get(activeQuery);
        const state: LendState = { availableCopies: null, activeLoans: [] };
        if (bookSnapshot.exists) {
          state.availableCopies = BookCopiesSchema.parse(bookSnapshot.data()).available_copies;
        }
        state.activeLoans = activeSnapshot.docs.map((document) =>
          LoanSchema.parse({ id: document.id, ...NewLoanSchema.parse(document.data()) }),
        );
        const loan = decide(state);
        const loanReference = loans.doc();
        transaction.create(loanReference, NewLoanSchema.parse(loan));
        transaction.update(bookReference, { available_copies: (state.availableCopies ?? 0) - 1 });
        return { id: loanReference.id, ...loan };
      });
    },

    returnLoan(bookId: string, borrowerUid: string, returnedAt: string): Promise<ReturnOutcome> {
      const firestore = getAdminFirestore();
      const bookReference = firestore.collection(BOOKS_COLLECTION).doc(bookId);
      const activeQuery = firestore
        .collection(LOANS_COLLECTION)
        .where("borrower_uid", "==", borrowerUid)
        .where("book_id", "==", bookId)
        .where("returned_at", "==", null)
        .limit(1);

      return firestore.runTransaction(async (transaction): Promise<ReturnOutcome> => {
        const bookSnapshot = await transaction.get(bookReference);
        const activeSnapshot = await transaction.get(activeQuery);
        if (!bookSnapshot.exists) {
          return { kind: "no_book" };
        }
        const document = activeSnapshot.docs[0];
        if (document === undefined) {
          return { kind: "no_active_loan" };
        }
        const active = NewLoanSchema.parse(document.data());
        const available = BookCopiesSchema.parse(bookSnapshot.data()).available_copies;
        transaction.update(document.ref, { returned_at: returnedAt });
        transaction.update(bookReference, { available_copies: available + 1 });
        return { kind: "returned", loan: LoanSchema.parse({ ...active, id: document.id, returned_at: returnedAt }) };
      });
    },

    async listActive(borrowerUid: string): Promise<Loan[]> {
      const snapshot = await getAdminFirestore()
        .collection(LOANS_COLLECTION)
        .where("borrower_uid", "==", borrowerUid)
        .where("returned_at", "==", null)
        .get();
      return snapshot.docs.map((document) =>
        LoanSchema.parse({ ...NewLoanSchema.parse(document.data()), id: document.id }),
      );
    },
  };
}
