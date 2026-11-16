import type { Role } from "@/shared/schema";
import type { Loan, NewLoan } from "../schema";

/** Cuenta que puede recibir un préstamo, vista desde préstamos. */
export interface Borrower {
  uid: string;
  role: Role;
}

/** Puerto propio hacia las cuentas: préstamos no importa el `server/` de `accounts`. */
export interface BorrowerDirectory {
  /** Busca por correo ya normalizado (sin espacios, en minúsculas). */
  findByEmail(email: string): Promise<Borrower | null>;
}

/** Datos de un libro que préstamos muestra junto a un préstamo (spec F8, regla 2.1). */
export interface BookInfo {
  title: string;
  author: string;
}

/** Puerto propio hacia el catálogo: préstamos no importa el `server/` de `catalog`. */
export interface BookCatalog {
  /** Devuelve `null` si el libro no existe. */
  findBook(bookId: string): Promise<BookInfo | null>;
}

/** Lo que el servicio necesita ver para decidir un préstamo (spec F5, regla 3). */
export interface LendState {
  /** Ejemplares disponibles del libro, o `null` si el libro no existe. */
  availableCopies: number | null;
  /** Préstamos activos (sin devolver) de la persona. */
  activeLoans: Loan[];
}

/** Resultado de intentar una devolución (spec F6, reglas 1.5 y 1.6). El servicio lo traduce a errores. */
export type ReturnOutcome = { kind: "returned"; loan: Loan } | { kind: "no_book" } | { kind: "no_active_loan" };

/** Puerto de persistencia de préstamos. Solo guarda y consulta; las reglas viven en el servicio. */
export interface LoanRepository {
  /**
   * Presta de forma atómica (spec F5, regla 4.2): lee el estado, llama a `decide` y, si devuelve un préstamo,
   * lo guarda y baja en 1 los disponibles del libro. Si `decide` lanza, no se guarda nada.
   * `decide` puede ejecutarse más de una vez si hay reintentos: debe ser pura.
   */
  lend(bookId: string, borrowerUid: string, decide: (state: LendState) => NewLoan): Promise<Loan>;
  /**
   * Devuelve de forma atómica (spec F6, regla 2.3): si la persona tiene un préstamo activo de ese libro,
   * le pone `returned_at` y sube en 1 los disponibles. Si no hay libro o préstamo activo, no cambia nada.
   */
  returnLoan(bookId: string, borrowerUid: string, returnedAt: string): Promise<ReturnOutcome>;
  /** Préstamos activos (sin devolver) de una persona, sin orden garantizado (spec F8). */
  listActive(borrowerUid: string): Promise<Loan[]>;
}
