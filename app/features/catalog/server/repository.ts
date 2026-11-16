import type { Book, NewBook } from "../schema";

/** Puerto de persistencia del catálogo. Solo guarda y consulta; las reglas viven en el servicio. */
export interface BookRepository {
  /**
   * Crea el libro solo si no existe otro con el mismo ISBN, de forma atómica (spec F1, regla 8).
   * Devuelve `null` si el ISBN ya existía.
   */
  insertUnique(book: NewBook): Promise<Book | null>;
  findByIsbn(isbn: string): Promise<Book | null>;
  count(): Promise<number>;
  /** Todos los libros, sin orden garantizado. El filtro y el orden de la búsqueda son del servicio (spec F2). */
  listAll(): Promise<Book[]>;
}
