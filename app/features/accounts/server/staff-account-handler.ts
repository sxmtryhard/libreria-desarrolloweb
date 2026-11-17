import type { Session } from "@/shared/schema";
import { assertSameOrigin, errorToResponse, readJsonBody } from "@/shared/server/http";
import { StaffAccountInputSchema } from "../schema";
import type { AccountService } from "./account-service";

export interface StaffAccountHandlerDeps {
  service: AccountService;
  /** Sesión de la petición actual; lanza `UnauthenticatedError` si no hay. */
  readSession(): Promise<Session>;
  /** `unstable_rethrow` de Next: deja pasar sus errores internos antes de traducir (docs/architecture.md). */
  rethrow<T>(error: T): void;
}

/**
 * Manejador de `POST /api/accounts/staff` (spec F13). El orden es parte de la regla 1.2:
 * origen → sesión → rol → cuerpo → creación, para no revelar nada a quien no tiene permiso.
 */
export function createStaffAccountHandler(deps: StaffAccountHandlerDeps): (request: Request) => Promise<Response> {
  return async function handle(request: Request): Promise<Response> {
    try {
      assertSameOrigin(request);
      const session = await deps.readSession();
      deps.service.assertCanCreateLibrarian(session);
      const input = await readJsonBody(request, StaffAccountInputSchema);
      const account = await deps.service.createLibrarian(session, input);
      return Response.json(account, { status: 201 });
    } catch (error) {
      deps.rethrow(error);
      return errorToResponse(error);
    }
  };
}
