import type { z } from "zod";
import { type Book, SearchBooksResponseSchema } from "@/features/catalog/schema";
import { ErrorResponseSchema } from "@/shared/schema";
import {
  type LendBookInput,
  type Loan,
  LoanSchema,
  type OverdueLoansResponse,
  OverdueLoansResponseSchema,
  type ReturnedLoan,
  ReturnedLoanSchema,
} from "../schema";
import { failureMessage } from "./desk-messages";

/** Llamadas de la pantalla del mostrador a las rutas de F2, F5, F6 y F8. Cada respuesta se valida con Zod. */

export type DeskResult<T> = { ok: true; data: T } | { ok: false; message: string };

async function serverMessageOf(response: Response): Promise<string | null> {
  try {
    return ErrorResponseSchema.parse(await response.json()).error.message;
  } catch {
    return null;
  }
}

async function call<S extends z.ZodType>(url: string, init: RequestInit, schema: S): Promise<DeskResult<z.output<S>>> {
  try {
    const response = await fetch(url, init);
    if (!response.ok) {
      return { ok: false, message: failureMessage(response.status, await serverMessageOf(response)) };
    }
    return { ok: true, data: schema.parse(await response.json()) };
  } catch {
    return { ok: false, message: failureMessage(0, null) };
  }
}

function post(input: LendBookInput): RequestInit {
  return { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) };
}

export async function searchBooks(query: string): Promise<DeskResult<Book[]>> {
  const result = await call(`/api/books?q=${encodeURIComponent(query)}`, {}, SearchBooksResponseSchema);
  if (!result.ok) {
    return result;
  }
  return { ok: true, data: result.data.books };
}

export function lendBook(input: LendBookInput): Promise<DeskResult<Loan>> {
  return call("/api/loans", post(input), LoanSchema);
}

export function returnBook(input: LendBookInput): Promise<DeskResult<ReturnedLoan>> {
  return call("/api/loans/return", post(input), ReturnedLoanSchema);
}

export function listOverdue(email: string): Promise<DeskResult<OverdueLoansResponse>> {
  return call(`/api/loans/overdue?borrower_email=${encodeURIComponent(email)}`, {}, OverdueLoansResponseSchema);
}
