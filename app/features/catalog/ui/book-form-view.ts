import { IsbnSchema, MAX_COPIES, MIN_COPIES, normalizeIsbn } from "../schema";

/** Textos y revisiones del formulario de libro (spec F36, regla 2). Lógica pura. */

export const BOOK_FORM_MESSAGES = {
  missingTitle: "Escribe el título.",
  missingAuthor: "Escribe el autor.",
  badIsbn: "El ISBN debe tener 13 dígitos, o 10 (el último puede ser X).",
  badCopies: "Los ejemplares deben ser un número entero de 1 a 100.",
} as const;

/** Valor de «Ejemplares» al abrir y tras registrar (regla 2.1). */
export const INITIAL_COPIES = "1";

export interface BookForm {
  title: string;
  author: string;
  isbn: string;
  copies: string;
}

/** Ejemplares como número entero de 1 a 100, o `null` si no lo son. */
function copiesOf(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) {
    return null;
  }
  const copies = Number(text);
  if (copies < MIN_COPIES || copies > MAX_COPIES) {
    return null;
  }
  return copies;
}

/** El primer problema del formulario, o `null` si no hay (regla 2.2). */
export function bookProblem(form: BookForm): string | null {
  if (form.title.trim().length === 0) {
    return BOOK_FORM_MESSAGES.missingTitle;
  }
  if (form.author.trim().length === 0) {
    return BOOK_FORM_MESSAGES.missingAuthor;
  }
  if (!IsbnSchema.safeParse(normalizeIsbn(form.isbn)).success) {
    return BOOK_FORM_MESSAGES.badIsbn;
  }
  if (copiesOf(form.copies) === null) {
    return BOOK_FORM_MESSAGES.badCopies;
  }
  return null;
}

/** Cuerpo de `POST /api/books` (regla 2.3). Llamar solo si `bookProblem` devolvió `null`. */
export function toRegisterBookBody(form: BookForm) {
  return { title: form.title, author: form.author, isbn: form.isbn, total_copies: copiesOf(form.copies) ?? MIN_COPIES };
}

/** «Libro registrado: <título> (<n> ejemplares).» (regla 2.4). */
export function bookSuccessMessage(title: string, copies: number): string {
  if (copies === 1) {
    return `Libro registrado: ${title} (1 ejemplar).`;
  }
  return `Libro registrado: ${title} (${copies} ejemplares).`;
}
