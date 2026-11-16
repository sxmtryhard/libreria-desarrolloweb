import type { Session } from "@/shared/schema";
import { assertSameOrigin, errorToResponse, readJsonBody } from "@/shared/server/http";
import { RegisterBookInputSchema } from "../schema";
import type { BookService } from "./book-service";

export interface RegisterBookHandlerDeps {
  service: BookService;
  /** Sesión de la petición actual; lanza `UnauthenticatedError` si no hay. */
  readSession(): Promise<Session>;
  now(): Date;
  /** `unstable_rethrow` de Next: deja pasar sus errores internos antes de traducir (docs/architecture.md). */
  rethrow<T>(error: T): void;
}

/**
 * Manejador de `POST /api/books` (spec F1). El orden es parte de la regla:
 * origen → sesión → rol → cuerpo, para no revelar nada a quien no tiene permiso.
 */
export function createRegisterBookHandler(deps: RegisterBookHandlerDeps): (request: Request) => Promise<Response> {
  return async function handle(request: Request): Promise<Response> {
    try {
      assertSameOrigin(request);
      const session = await deps.readSession();
      deps.service.assertCanRegister(session);
      const input = await readJsonBody(request, RegisterBookInputSchema);
      const book = await deps.service.register(session, input, deps.now());
      return Response.json(book, { status: 201 });
    } catch (error) {
      deps.rethrow(error);
      return errorToResponse(error);
    }
  };
}
