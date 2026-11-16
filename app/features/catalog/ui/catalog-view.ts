import { type Book, SEARCH_MAX_RESULTS, SEARCH_QUERY_MAX_LENGTH } from "../schema";

/** Textos y lectura de la búsqueda de la pantalla de catálogo (spec F33, regla 4). Lógica pura. */

export const CATALOG_MESSAGES = {
  empty: "No se encontraron libros.",
  limit: "Se muestran los primeros 50. Escribe algo más específico.",
  tooLong: "La búsqueda no puede tener más de 100 caracteres.",
} as const;

export interface CatalogQuery {
  q: string;
  /** El texto supera el límite de F2: no se busca (regla 4.8). */
  tooLong: boolean;
}

function firstOf(raw: string | string[] | undefined): string {
  if (raw === undefined) {
    return "";
  }
  if (typeof raw === "string") {
    return raw;
  }
  return raw[0] ?? "";
}

/** Lee `q` de la URL: recorta, toma el primero si se repite y marca si es demasiado largo. */
export function readCatalogQuery(raw: string | string[] | undefined): CatalogQuery {
  const q = firstOf(raw).trim();
  return { q, tooLong: q.length > SEARCH_QUERY_MAX_LENGTH };
}

export function countLabel(count: number): string {
  if (count === 1) {
    return "1 libro";
  }
  return `${count} libros`;
}

/** Con el máximo de resultados puede haber más libros que no se muestran (regla 4.7). */
export function showsLimitNote(count: number): boolean {
  return count >= SEARCH_MAX_RESULTS;
}

export function availabilityLabel(book: Book): string {
  return `${book.available_copies} de ${book.total_copies} disponibles`;
}
