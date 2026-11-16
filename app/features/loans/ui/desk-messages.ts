import type { LendBookInput, Loan, OverdueLoan, ReturnedLoan } from "../schema";

/** Textos y formato de la pantalla de préstamos y devoluciones (spec F34). Lógica pura. */

export const DESK_MESSAGES = {
  forbiddenScreen: "No tienes permiso para ver esta pantalla.",
  noOverdue: "No tiene préstamos vencidos.",
  missingEmail: "Escribe el correo de la persona.",
  noBooks: "No se encontraron libros.",
  missingData: "Escribe el correo de la persona y elige un libro.",
  returnedOnTime: "Devolución registrada a tiempo.",
  checkEmail: "Revisa el correo de la persona.",
  sessionEnded: "Tu sesión terminó. Vuelve a ingresar.",
  forbidden: "No tienes permiso para hacer esto.",
  failed: "No se pudo completar la operación. Intenta de nuevo.",
  withdrawnBook: "Libro retirado",
} as const;

/** Fecha y hora en español; sin `timeZone` usa la del navegador (regla 5.1). */
export function formatDateTime(iso: string, timeZone?: string): string {
  // La fecha y la hora se formatean por separado: la unión («,» o «a las») cambia de un navegador a otro.
  const moment = new Date(iso);
  const date = new Intl.DateTimeFormat("es", { dateStyle: "long", timeZone }).format(moment);
  const time = new Intl.DateTimeFormat("es", { timeStyle: "short", timeZone }).format(moment);
  return `${date}, ${time}`;
}

/** Pesos enteros con punto como separador de miles (regla 5.2). */
export function formatPesos(amount: number): string {
  return `${String(amount).replaceAll(/\B(?=(\d{3})+(?!\d))/g, ".")} pesos`;
}

function daysLabel(days: number): string {
  if (days === 1) {
    return "1 día";
  }
  return `${days} días`;
}

export function lendSuccessMessage(loan: Loan, timeZone?: string): string {
  return `Préstamo registrado. Vence el ${formatDateTime(loan.due_at, timeZone)}.`;
}

export function returnSuccessMessage(returned: ReturnedLoan): string {
  if (returned.days_late === 0) {
    return DESK_MESSAGES.returnedOnTime;
  }
  return `Devolución registrada con ${daysLabel(returned.days_late)} de retraso. Multa: ${formatPesos(returned.fine_amount)}.`;
}

const STATUS_MESSAGES = new Map<number, string>([
  [400, DESK_MESSAGES.checkEmail],
  [401, DESK_MESSAGES.sessionEnded],
  [403, DESK_MESSAGES.forbidden],
]);

/** Mensaje para una respuesta de error. Con 404 y 409 vale el mensaje del servidor (reglas 4.5 y 4.6). */
export function failureMessage(status: number, serverMessage: string | null): string {
  if ((status === 404 || status === 409) && serverMessage !== null) {
    return serverMessage;
  }
  return STATUS_MESSAGES.get(status) ?? DESK_MESSAGES.failed;
}

/** Datos listos para prestar o devolver, o `null` si falta el correo o el libro (regla 4.2). */
export function readyToAct(email: string, bookId: string | null): LendBookInput | null {
  const trimmed = email.trim();
  if (trimmed.length === 0 || bookId === null) {
    return null;
  }
  return { book_id: bookId, borrower_email: trimmed };
}

export function overdueBookTitle(loan: OverdueLoan): string {
  return loan.book_title ?? DESK_MESSAGES.withdrawnBook;
}
