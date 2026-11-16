import "server-only";
import { getAdminFirestore } from "@/shared/server/firebase-admin";
import { type Book, BookSchema, type NewBook, NewBookSchema } from "../schema";
import type { BookRepository } from "./repository";

const BOOKS_COLLECTION = "books";

/** Catálogo en Firestore (ADR-0003). Cada documento se valida con Zod antes de devolverlo. */
export function createFirestoreBookRepository(): BookRepository {
  function collection() {
    return getAdminFirestore().collection(BOOKS_COLLECTION);
  }

  return {
    insertUnique(book: NewBook): Promise<Book | null> {
      const books = collection();
      return getAdminFirestore().runTransaction(async (transaction) => {
        const existing = await transaction.get(books.where("isbn", "==", book.isbn).limit(1));
        if (!existing.empty) {
          return null;
        }
        const reference = books.doc();
        transaction.create(reference, NewBookSchema.parse(book));
        return { id: reference.id, ...book };
      });
    },

    async findByIsbn(isbn: string): Promise<Book | null> {
      const found = await collection().where("isbn", "==", isbn).limit(1).get();
      const document = found.docs[0];
      if (document === undefined) {
        return null;
      }
      return BookSchema.parse({ id: document.id, ...NewBookSchema.parse(document.data()) });
    },

    async count(): Promise<number> {
      const result = await collection().count().get();
      return result.data().count;
    },

    async listAll(): Promise<Book[]> {
      const snapshot = await collection().get();
      return snapshot.docs.map((document) =>
        BookSchema.parse({ id: document.id, ...NewBookSchema.parse(document.data()) }),
      );
    },
  };
}
