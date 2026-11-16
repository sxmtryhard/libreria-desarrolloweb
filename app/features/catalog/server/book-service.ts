import type { Role, Session } from "@/shared/schema";
import { ConflictError } from "@/shared/server/errors";
import { requireRole } from "@/shared/server/session";
import { type Book, type RegisterBookInput, SEARCH_MAX_RESULTS, type SearchBooksQuery } from "../schema";
import type { BookRepository } from "./repository";
import { compareForSearch, matchesSearch, normalizeSearchText } from "./search-text";

/** Roles que pueden registrar libros (spec F1, Autorización). */
const REGISTER_ROLES: readonly Role[] = ["BIBLIOTECARIO", "ADMINISTRADOR"];

export interface BookServiceDeps {
  books: BookRepository;
}

export interface BookService {
  /** Lanza `ForbiddenError` si la sesión no puede registrar libros. La ruta la llama antes de leer el cuerpo. */
  assertCanRegister(session: Session): void;
  register(session: Session, input: RegisterBookInput, now: Date): Promise<Book>;
  /** Búsqueda pública por título o autor (spec F2). No requiere sesión. */
  search(query: SearchBooksQuery): Promise<Book[]>;
}

export function createBookService(deps: BookServiceDeps): BookService {
  function assertCanRegister(session: Session): void {
    requireRole(session, REGISTER_ROLES);
  }

  async function register(session: Session, input: RegisterBookInput, now: Date): Promise<Book> {
    assertCanRegister(session);
    const created = await deps.books.insertUnique({
      title: input.title,
      author: input.author,
      isbn: input.isbn,
      total_copies: input.total_copies,
      available_copies: input.total_copies,
      created_at: now.toISOString(),
    });
    if (created === null) {
      throw new ConflictError("Ya existe un libro con ese ISBN.");
    }
    return created;
  }

  async function search(query: SearchBooksQuery): Promise<Book[]> {
    const wanted = normalizeSearchText(query.q);
    const all = await deps.books.listAll();
    return all
      .filter((book) => matchesSearch(book, wanted))
      .sort(compareForSearch)
      .slice(0, SEARCH_MAX_RESULTS);
  }

  return { assertCanRegister, register, search };
}
