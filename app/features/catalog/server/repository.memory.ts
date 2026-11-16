import type { Book, NewBook } from "../schema";
import type { BookRepository } from "./repository";

/** Catálogo en memoria, para las pruebas. */
export function createMemoryBookRepository(): BookRepository {
  const byIsbn = new Map<string, Book>();

  return {
    insertUnique(book: NewBook): Promise<Book | null> {
      if (byIsbn.has(book.isbn)) {
        return Promise.resolve(null);
      }
      const created: Book = { id: `book-${byIsbn.size + 1}`, ...book };
      byIsbn.set(book.isbn, created);
      return Promise.resolve(created);
    },
    findByIsbn(isbn: string): Promise<Book | null> {
      return Promise.resolve(byIsbn.get(isbn) ?? null);
    },
    count(): Promise<number> {
      return Promise.resolve(byIsbn.size);
    },
    listAll(): Promise<Book[]> {
      return Promise.resolve([...byIsbn.values()]);
    },
  };
}
