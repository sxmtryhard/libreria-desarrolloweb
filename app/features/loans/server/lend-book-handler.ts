import type { Session } from "@/shared/schema";
import { assertSameOrigin, errorToResponse, readJsonBody } from "@/shared/server/http";
import { LendBookInputSchema } from "../schema";
import type { LoanService } from "./loan-service";

export interface LendBookHandlerDeps {
  service: LoanService;
  /** Sesión de la petición actual; lanza `UnauthenticatedError` si no hay. */
  readSession(): Promise<Session>;
  now(): Date;
  /** `unstable_rethrow` de Next: deja pasar sus errores internos antes de traducir (docs/architecture.md). */
  rethrow<T>(error: T): void;
}

/**
 * Manejador de `POST /api/loans` (spec F5). El orden es parte de la regla:
 * origen → sesión → rol → cuerpo, para no revelar nada a quien no tiene permiso.
 */
export function createLendBookHandler(deps: LendBookHandlerDeps): (request: Request) => Promise<Response> {
  return async function handle(request: Request): Promise<Response> {
    try {
      assertSameOrigin(request);
      const session = await deps.readSession();
      deps.service.assertCanLend(session);
      const input = await readJsonBody(request, LendBookInputSchema);
      const loan = await deps.service.lend(session, input, deps.now());
      return Response.json(loan, { status: 201 });
    } catch (error) {
      deps.rethrow(error);
      return errorToResponse(error);
    }
  };
}
