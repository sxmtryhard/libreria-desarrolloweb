import type { Book } from "../schema";

/** Texto para comparar en la búsqueda (spec F2, regla 3): minúsculas, sin diacríticos y con espacios simples. */
export function normalizeSearchText(text: string): string {
  return text.normalize("NFD").replaceAll(/\p{M}/gu, "").toLowerCase().replaceAll(/\s+/g, " ").trim();
}

/** `wanted` ya normalizado. Vacío coincide con todo (regla 5); se busca como una sola frase (regla 4). */
export function matchesSearch(book: Book, wanted: string): boolean {
  if (wanted.length === 0) {
    return true;
  }
  return normalizeSearchText(book.title).includes(wanted) || normalizeSearchText(book.author).includes(wanted);
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

/** Orden de los resultados (regla 6): título normalizado, luego autor normalizado, luego `id`. */
export function compareForSearch(left: Book, right: Book): number {
  const byTitle = compareText(normalizeSearchText(left.title), normalizeSearchText(right.title));
  if (byTitle !== 0) {
    return byTitle;
  }
  const byAuthor = compareText(normalizeSearchText(left.author), normalizeSearchText(right.author));
  if (byAuthor !== 0) {
    return byAuthor;
  }
  return compareText(left.id, right.id);
}
