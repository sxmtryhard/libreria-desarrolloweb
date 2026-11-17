import type { Session } from "@/shared/schema";
import { assertSameOrigin, errorToResponse, readJsonBody } from "@/shared/server/http";
import { ChangePasswordInputSchema } from "../schema";
import type { PasswordService } from "./password-service";

export interface ChangePasswordHandlerDeps {
  service: PasswordService;
  /** Sesión de la petición actual; lanza `UnauthenticatedError` si no hay. */
  readSession(): Promise<Session>;
  /** Borra la cookie de sesión en la respuesta de la petición actual. */
  clearSessionCookie(): Promise<void>;
  /** `unstable_rethrow` de Next: deja pasar sus errores internos antes de traducir (docs/architecture.md). */
  rethrow<T>(error: T): void;
}

/** Manejador de `POST /api/accounts/password` (spec F15). Orden de la regla 1.3: origen → sesión → cuerpo → cambio. */
export function createChangePasswordHandler(deps: ChangePasswordHandlerDeps): (request: Request) => Promise<Response> {
  return async function handle(request: Request): Promise<Response> {
    try {
      assertSameOrigin(request);
      const session = await deps.readSession();
      const input = await readJsonBody(request, ChangePasswordInputSchema);
      await deps.service.changePassword(session, input);
      await deps.clearSessionCookie();
      return new Response(null, { status: 204 });
    } catch (error) {
      deps.rethrow(error);
      return errorToResponse(error);
    }
  };
}
