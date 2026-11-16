import type { Loan, LoanFine } from "../schema";

/** Multa por retraso (spec F7). Función pura: no guarda nada ni cambia el préstamo. */

/** Pesos por cada día de retraso, igual para todos los roles (regla 1.3). */
const FINE_PER_DAY = 1000;
/** Días que se cobran como máximo por préstamo (regla 1.4). */
const MAX_FINED_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Momento de corte: la devolución si ya se devolvió; si no, el momento actual (regla 1.1). */
function cutoffOf(loan: Loan, now: Date): number {
  if (loan.returned_at !== null) {
    return new Date(loan.returned_at).getTime();
  }
  return now.getTime();
}

/** Días de retraso: cada día de 24 horas empezado cuenta (regla 1.2). */
function daysLateOf(loan: Loan, now: Date): number {
  const lateMs = cutoffOf(loan, now) - new Date(loan.due_at).getTime();
  if (lateMs <= 0) {
    return 0;
  }
  return Math.ceil(lateMs / DAY_MS);
}

export function calculateFine(loan: Loan, now: Date): LoanFine {
  const daysLate = daysLateOf(loan, now);
  return { days_late: daysLate, fine_amount: Math.min(daysLate, MAX_FINED_DAYS) * FINE_PER_DAY };
}
