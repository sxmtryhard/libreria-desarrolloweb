import { assertSameOrigin, errorToResponse, readJsonBody } from "@/shared/server/http";
import { SelfRegisterInputSchema } from "../schema";
import type { AccountService } from "./account-service";

export interface SelfRegisterHandlerDeps {
  service: AccountService;
  /** `unstable_rethrow` de Next: deja pasar sus errores internos antes de traducir (docs/architecture.md). */
  rethrow<T>(error: T): void;
}

/**
 * Manejador de `POST /api/accounts/register` (spec F10). Es público: no lee ninguna sesión.
 * Orden: origen → cuerpo → creación.
 */
export function createSelfRegisterHandler(deps: SelfRegisterHandlerDeps): (request: Request) => Promise<Response> {
  return async function handle(request: Request): Promise<Response> {
    try {
      assertSameOrigin(request);
      const input = await readJsonBody(request, SelfRegisterInputSchema);
      const account = await deps.service.selfRegister(input);
      return Response.json(account, { status: 201 });
    } catch (error) {
      deps.rethrow(error);
      return errorToResponse(error);
    }
  };
}
