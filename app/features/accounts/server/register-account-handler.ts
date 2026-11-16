import type { Session } from "@/shared/schema";
import { assertSameOrigin, errorToResponse, readJsonBody } from "@/shared/server/http";
import { RegisterAccountInputSchema } from "../schema";
import type { AccountService } from "./account-service";

export interface RegisterAccountHandlerDeps {
  service: AccountService;
  /** Sesión de la petición actual; lanza `UnauthenticatedError` si no hay. */
  readSession(): Promise<Session>;
  /** `unstable_rethrow` de Next: deja pasar sus errores internos antes de traducir (docs/architecture.md). */
  rethrow<T>(error: T): void;
}

/**
 * Manejador de `POST /api/accounts` (spec F3). El orden es parte de la regla:
 * origen → sesión → rol → cuerpo, para no revelar nada a quien no tiene permiso.
 */
export function createRegisterAccountHandler(
  deps: RegisterAccountHandlerDeps,
): (request: Request) => Promise<Response> {
  return async function handle(request: Request): Promise<Response> {
    try {
      assertSameOrigin(request);
      const session = await deps.readSession();
      deps.service.assertCanRegister(session);
      const input = await readJsonBody(request, RegisterAccountInputSchema);
      const account = await deps.service.register(session, input);
      return Response.json(account, { status: 201 });
    } catch (error) {
      deps.rethrow(error);
      return errorToResponse(error);
    }
  };
}
