import type { Session } from "@/shared/schema";
import { assertSameOrigin, errorToResponse, readJsonBody } from "@/shared/server/http";
import { ReturnBookInputSchema } from "../schema";
import type { LoanService } from "./loan-service";

export interface ReturnBookHandlerDeps {
  service: LoanService;
  /** Sesión de la petición actual; lanza `UnauthenticatedError` si no hay. */
  readSession(): Promise<Session>;
  now(): Date;
  /** `unstable_rethrow` de Next: deja pasar sus errores internos antes de traducir (docs/architecture.md). */
  rethrow<T>(error: T): void;
}

/**
 * Manejador de `POST /api/loans/return` (spec F6). El orden es parte de la regla:
 * origen → sesión → rol → cuerpo, para no revelar nada a quien no tiene permiso.
 */
export function createReturnBookHandler(deps: ReturnBookHandlerDeps): (request: Request) => Promise<Response> {
  return async function handle(request: Request): Promise<Response> {
    try {
      assertSameOrigin(request);
      const session = await deps.readSession();
      deps.service.assertCanReturn(session);
      const input = await readJsonBody(request, ReturnBookInputSchema);
      const returned = await deps.service.returnBook(session, input, deps.now());
      return Response.json(returned, { status: 200 });
    } catch (error) {
      deps.rethrow(error);
      return errorToResponse(error);
    }
  };
}
