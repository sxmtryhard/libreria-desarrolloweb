import "server-only";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import type { Session } from "@/shared/schema";
import { UnauthenticatedError } from "@/shared/server/errors";
import {
  readSession,
  readSessionCookieValue,
  sessionService,
  writeSessionCookie,
} from "@/shared/server/session.firebase";
import { type AccountService, createAccountService } from "./accounts/server/account-service";
import { createRegisterAccountHandler } from "./accounts/server/register-account-handler";
import { createFirebaseAccountRepository } from "./accounts/server/repository.firebase";
import { createSelfRegisterHandler } from "./accounts/server/self-register-handler";
import { createSignInHandler, createSignOutHandler } from "./accounts/server/session-handlers";
import { type BookService, createBookService } from "./catalog/server/book-service";
import { createRegisterBookHandler } from "./catalog/server/register-book-handler";
import { createFirestoreBookRepository } from "./catalog/server/repository.firestore";
import { createSearchBooksHandler } from "./catalog/server/search-books-handler";
import { createLendBookHandler } from "./loans/server/lend-book-handler";
import { createLoanService, type LoanService } from "./loans/server/loan-service";
import { createMyLoansService, type MyLoansService } from "./loans/server/my-loans-service";
import { createOverdueLoansHandler } from "./loans/server/overdue-loans-handler";
import { createOverdueService, type OverdueService } from "./loans/server/overdue-service";
import {
  createFirestoreBookCatalog,
  createFirestoreBorrowerDirectory,
  createFirestoreLoanRepository,
} from "./loans/server/repository.firestore";
import { createReturnBookHandler } from "./loans/server/return-book-handler";

/** Raíz de composición: el único lugar que conecta servicios, repositorios reales y features entre sí. */

/** Hora actual para las páginas. Llámala después de leer la sesión (Cache Components). */
export function currentTime(): Date {
  return new Date();
}

export const bookService: BookService = createBookService({ books: createFirestoreBookRepository() });

export const registerBookHandler = createRegisterBookHandler({
  service: bookService,
  readSession: () => readSession(currentTime()),
  now: currentTime,
  rethrow: unstable_rethrow,
});

export const searchBooksHandler = createSearchBooksHandler({ service: bookService, rethrow: unstable_rethrow });

export const accountService: AccountService = createAccountService({ accounts: createFirebaseAccountRepository() });

export const registerAccountHandler = createRegisterAccountHandler({
  service: accountService,
  readSession: () => readSession(currentTime()),
  rethrow: unstable_rethrow,
});

export const loanService: LoanService = createLoanService({
  loans: createFirestoreLoanRepository(),
  borrowers: createFirestoreBorrowerDirectory(),
});

export const lendBookHandler = createLendBookHandler({
  service: loanService,
  readSession: () => readSession(currentTime()),
  now: currentTime,
  rethrow: unstable_rethrow,
});

export const returnBookHandler = createReturnBookHandler({
  service: loanService,
  readSession: () => readSession(currentTime()),
  now: currentTime,
  rethrow: unstable_rethrow,
});

export const overdueService: OverdueService = createOverdueService({
  loans: createFirestoreLoanRepository(),
  borrowers: createFirestoreBorrowerDirectory(),
  books: createFirestoreBookCatalog(),
});

export const overdueLoansHandler = createOverdueLoansHandler({
  service: overdueService,
  readSession: () => readSession(currentTime()),
  now: currentTime,
  rethrow: unstable_rethrow,
});

export const myLoansService: MyLoansService = createMyLoansService({
  loans: createFirestoreLoanRepository(),
  books: createFirestoreBookCatalog(),
});

export const selfRegisterHandler = createSelfRegisterHandler({ service: accountService, rethrow: unstable_rethrow });

export const signInHandler = createSignInHandler({
  sessions: sessionService,
  writeCookie: writeSessionCookie,
  now: currentTime,
  rethrow: unstable_rethrow,
});

export const signOutHandler = createSignOutHandler({
  sessions: sessionService,
  readCookieValue: readSessionCookieValue,
  writeCookie: writeSessionCookie,
  rethrow: unstable_rethrow,
});

/**
 * Sesión de la petición actual para las páginas, o `null` si nadie ha ingresado (spec F4, reglas 3 y 5).
 * Lee `cookies()`: quien la llame va dentro de `<Suspense>`.
 */
export const currentSession = cache(async function currentSession(): Promise<Session | null> {
  try {
    // Primero la petición y después la hora: Cache Components no deja leer la hora al prerenderizar.
    await connection();
    const cookieValue = await readSessionCookieValue();
    return await sessionService.verify(cookieValue, currentTime());
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof UnauthenticatedError) {
      return null;
    }
    throw error;
  }
});
