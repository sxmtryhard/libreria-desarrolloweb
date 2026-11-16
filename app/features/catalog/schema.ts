import { z } from "zod";

/** Contrato del catálogo (F1, F2). Solo el orquestador lo cambia. Claves del cable en snake_case. */

export const TITLE_MAX_LENGTH = 200;
export const AUTHOR_MAX_LENGTH = 120;
export const MIN_COPIES = 1;
export const MAX_COPIES = 100;
export const SEARCH_QUERY_MAX_LENGTH = 100;
export const SEARCH_MAX_RESULTS = 50;

/** ISBN ya normalizado: 13 dígitos, o 9 dígitos y un dígito o `X` (spec F1, regla 4). */
const NORMALIZED_ISBN = /^(\d{13}|\d{9}[\dX])$/;

/** Quita guiones y espacios y pasa a mayúscula la `x` final de un ISBN-10. */
export function normalizeIsbn(raw: string): string {
  return raw.replaceAll(/[-\s]/g, "").toUpperCase();
}

export const IsbnSchema = z.string().regex(NORMALIZED_ISBN);

/** Cuerpo de `POST /api/books` (spec F1, reglas 1–6). Los campos extra se ignoran. */
export const RegisterBookInputSchema = z.object({
  title: z.string().trim().min(1).max(TITLE_MAX_LENGTH),
  author: z.string().trim().min(1).max(AUTHOR_MAX_LENGTH),
  isbn: z.string().transform(normalizeIsbn).pipe(IsbnSchema),
  total_copies: z.number().int().min(MIN_COPIES).max(MAX_COPIES),
});
export type RegisterBookInput = z.infer<typeof RegisterBookInputSchema>;

/** Libro del catálogo, tal como viaja por el cable y se guarda. */
export const BookSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(TITLE_MAX_LENGTH),
  author: z.string().min(1).max(AUTHOR_MAX_LENGTH),
  isbn: IsbnSchema,
  total_copies: z.number().int().min(0),
  available_copies: z.number().int().min(0),
  created_at: z.iso.datetime(),
});
export type Book = z.infer<typeof BookSchema>;

/** Datos de un libro antes de tener identificador. */
export const NewBookSchema = BookSchema.omit({ id: true });
export type NewBook = z.infer<typeof NewBookSchema>;

/** Parámetros de `GET /api/books` (spec F2, reglas 1, 5 y 8). Sin `q` equivale a búsqueda vacía. */
export const SearchBooksQuerySchema = z.object({
  q: z.string().trim().max(SEARCH_QUERY_MAX_LENGTH).default(""),
});
export type SearchBooksQuery = z.infer<typeof SearchBooksQuerySchema>;

/** Respuesta de `GET /api/books` (spec F2). */
export const SearchBooksResponseSchema = z.object({ books: z.array(BookSchema) });
export type SearchBooksResponse = z.infer<typeof SearchBooksResponseSchema>;
