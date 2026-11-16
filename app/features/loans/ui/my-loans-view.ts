import type { MyLoan } from "../schema";
import { formatDateTime } from "./desk-messages";

/** Textos y estados de «Mis préstamos» y «Mis vencidos» (spec F35). Lógica pura. */

export const MY_LOANS_MESSAGES = {
  noLoans: "No tienes libros prestados.",
  noOverdue: "No tienes préstamos vencidos.",
  overdueWarning: "Tienes préstamos vencidos.",
  returnAtDesk: "Devuelve los libros en el mostrador de la biblioteca.",
  staffOnly: "Esta pantalla es para quienes piden libros prestados.",
  withdrawnBook: "Libro retirado",
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const LIBRARY_TIME_ZONE = "America/Bogota";

/** Fecha y hora en hora de Colombia (regla 4.1). */
export function formatLibraryDateTime(iso: string): string {
  return formatDateTime(iso, LIBRARY_TIME_ZONE);
}

/** Estado de un préstamo activo (regla 2.4). */
export function loanStatusLabel(loan: Pick<MyLoan, "due_at">, now: Date): string {
  const remainingMs = new Date(loan.due_at).getTime() - now.getTime();
  if (remainingMs < 0) {
    return "Vencido";
  }
  if (remainingMs < DAY_MS) {
    return "Vence hoy";
  }
  const days = Math.floor(remainingMs / DAY_MS);
  if (days === 1) {
    return "Vence en 1 día";
  }
  return `Vence en ${days} días`;
}

export function loanCountLabel(count: number): string {
  if (count === 1) {
    return "Tienes 1 libro prestado.";
  }
  return `Tienes ${count} libros prestados.`;
}

export function daysLateLabel(days: number): string {
  if (days === 1) {
    return "1 día de retraso";
  }
  return `${days} días de retraso`;
}

export function showsOverdueWarning(loans: readonly Pick<MyLoan, "overdue">[]): boolean {
  return loans.some((loan) => loan.overdue);
}

export function myLoanTitle(loan: { book_title: string | null }): string {
  return loan.book_title ?? MY_LOANS_MESSAGES.withdrawnBook;
}
