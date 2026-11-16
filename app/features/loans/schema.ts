import { z } from "zod";

/** Contrato de préstamos (F5, F6, F7, F8 y F35). Solo el orquestador lo cambia. Claves del cable en snake_case. */

export const BOOK_ID_MAX_LENGTH = 128;
export const BORROWER_EMAIL_MAX_LENGTH = 254;

/** Roles que pueden recibir préstamos (spec F5, regla 1.5). */
export const BORROWER_ROLES = ["EXTERNO", "ESTUDIANTE", "DOCENTE"] as const;
export const BorrowerRoleSchema = z.enum(BORROWER_ROLES);
export type BorrowerRole = z.infer<typeof BorrowerRoleSchema>;

/** Cuerpo de `POST /api/loans` (spec F5, reglas 1.2 y 1.3). Los campos extra se ignoran. */
export const LendBookInputSchema = z.object({
  book_id: z.string().trim().min(1).max(BOOK_ID_MAX_LENGTH),
  borrower_email: z.string().trim().toLowerCase().max(BORROWER_EMAIL_MAX_LENGTH).pipe(z.email()),
});
export type LendBookInput = z.infer<typeof LendBookInputSchema>;

/** Préstamo de un ejemplar físico, tal como viaja por el cable y se guarda. Activo mientras `returned_at` sea `null`. */
export const LoanSchema = z.object({
  id: z.string().min(1),
  book_id: z.string().min(1),
  borrower_uid: z.string().min(1),
  lent_by_uid: z.string().min(1),
  loaned_at: z.iso.datetime(),
  due_at: z.iso.datetime(),
  returned_at: z.iso.datetime().nullable(),
});
export type Loan = z.infer<typeof LoanSchema>;

/** Datos de un préstamo antes de tener identificador. */
export const NewLoanSchema = LoanSchema.omit({ id: true });
export type NewLoan = z.infer<typeof NewLoanSchema>;

/** Cuerpo de `POST /api/loans/return` (spec F6, reglas 1.2 y 1.3). Los campos extra se ignoran. */
export const ReturnBookInputSchema = z.object({
  book_id: z.string().trim().min(1).max(BOOK_ID_MAX_LENGTH),
  borrower_email: z.string().trim().toLowerCase().max(BORROWER_EMAIL_MAX_LENGTH).pipe(z.email()),
});
export type ReturnBookInput = z.infer<typeof ReturnBookInputSchema>;

export const MAX_FINE_AMOUNT = 30_000;

/** Multa por retraso de un préstamo, en pesos enteros (spec F7, regla 1). */
export const LoanFineSchema = z.object({
  days_late: z.number().int().min(0),
  fine_amount: z.number().int().min(0).max(MAX_FINE_AMOUNT),
});
export type LoanFine = z.infer<typeof LoanFineSchema>;

/** Respuesta de una devolución: el préstamo ya devuelto, si llegó tarde y su multa (specs F6 3.2 y F7 2.1). */
export const ReturnedLoanSchema = z.object({
  loan: LoanSchema,
  returned_late: z.boolean(),
  days_late: LoanFineSchema.shape.days_late,
  fine_amount: LoanFineSchema.shape.fine_amount,
});
export type ReturnedLoan = z.infer<typeof ReturnedLoanSchema>;

const BorrowerEmailSchema = z.string().trim().toLowerCase().max(BORROWER_EMAIL_MAX_LENGTH).pipe(z.email());

/** Parámetros de `GET /api/loans/overdue` (spec F8). Un prestatario puede omitir el correo. */
export const OverdueQuerySchema = z.object({ borrower_email: BorrowerEmailSchema.optional() });
export type OverdueQuery = z.infer<typeof OverdueQuerySchema>;

/** Lo mismo cuando pregunta el personal: el correo es obligatorio (spec F8, regla 4.4). */
export const StaffOverdueQuerySchema = z.object({ borrower_email: BorrowerEmailSchema });

/** Un préstamo vencido de la lista (spec F8, regla 2). Título y autor van en `null` si el libro ya no existe. */
export const OverdueLoanSchema = z.object({
  loan_id: z.string().min(1),
  book_id: z.string().min(1),
  book_title: z.string().nullable(),
  book_author: z.string().nullable(),
  loaned_at: z.iso.datetime(),
  due_at: z.iso.datetime(),
  days_late: LoanFineSchema.shape.days_late,
  fine_amount: LoanFineSchema.shape.fine_amount,
});
export type OverdueLoan = z.infer<typeof OverdueLoanSchema>;

/** Respuesta de `GET /api/loans/overdue` (spec F8, reglas 1–3). */
export const OverdueLoansResponseSchema = z.object({
  borrower_uid: z.string().min(1),
  overdue_loans: z.array(OverdueLoanSchema),
  total_fine_amount: z.number().int().min(0),
});
export type OverdueLoansResponse = z.infer<typeof OverdueLoansResponseSchema>;

/** Un préstamo activo de la propia persona (spec F35, regla 2). Título y autor van en `null` si el libro ya no existe. */
export const MyLoanSchema = z.object({
  loan_id: z.string().min(1),
  book_id: z.string().min(1),
  book_title: z.string().nullable(),
  book_author: z.string().nullable(),
  loaned_at: z.iso.datetime(),
  due_at: z.iso.datetime(),
  overdue: z.boolean(),
});
export type MyLoan = z.infer<typeof MyLoanSchema>;

/** Lista de «mis préstamos»: contrato entre el servicio y la pantalla (spec F35). */
export const MyLoansResponseSchema = z.object({ loans: z.array(MyLoanSchema) });
export type MyLoansResponse = z.infer<typeof MyLoansResponseSchema>;
