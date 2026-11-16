import { errorToResponse } from "@/shared/server/http";
import { SearchBooksQuerySchema, type SearchBooksResponse } from "../schema";
import type { BookService } from "./book-service";

export interface SearchBooksHandlerDeps {
  service: BookService;
  /** `unstable_rethrow` de Next: deja pasar sus errores internos antes de traducir (docs/architecture.md). */
  rethrow<T>(error: T): void;
}

/**
 * Manejador de `GET /api/books?q=` (spec F2). Es público: no lee la sesión ni comprueba el origen.
 * Si `q` llega repetido se usa el primero.
 */
export function createSearchBooksHandler(deps: SearchBooksHandlerDeps): (request: Request) => Promise<Response> {
  return async function handle(request: Request): Promise<Response> {
    try {
      const params = new URL(request.url).searchParams;
      const query = SearchBooksQuerySchema.parse({ q: params.get("q") ?? undefined });
      const body: SearchBooksResponse = { books: await deps.service.search(query) };
      return Response.json(body);
    } catch (error) {
      deps.rethrow(error);
      return errorToResponse(error);
    }
  };
}
