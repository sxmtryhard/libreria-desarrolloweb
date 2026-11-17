import type { z } from "zod";
import type { Session } from "@/shared/schema";
import { assertSameOrigin, errorToResponse, readJsonBody } from "@/shared/server/http";
import { type AccountStatus, DeactivateAccountInputSchema, ReactivateAccountInputSchema } from "../schema";
import type { AccountStatusService } from "./account-status-service";

export interface AccountStatusHandlerDeps {
  service: AccountStatusService;
  /** Sesión de la petición actual; lanza `UnauthenticatedError` si no hay. */
  readSession(): Promise<Session>;
  now(): Date;
  /** `unstable_rethrow` de Next: deja pasar sus errores internos antes de traducir (docs/architecture.md). */
  rethrow<T>(error: T): void;
}

/** Orden de la regla 1.3 de F14: origen → sesión → rol → cuerpo → cambio. */
function createStatusHandler<S extends z.ZodType>(
  deps: AccountStatusHandlerDeps,
  schema: S,
  apply: (session: Session, input: z.output<S>, now: Date) => Promise<AccountStatus>,
): (request: Request) => Promise<Response> {
  return async function handle(request: Request): Promise<Response> {
    try {
      assertSameOrigin(request);
      const session = await deps.readSession();
      deps.service.assertCanChangeStatus(session);
      const input = await readJsonBody(request, schema);
      return Response.json(await apply(session, input, deps.now()));
    } catch (error) {
      deps.rethrow(error);
      return errorToResponse(error);
    }
  };
}

/** Manejador de `POST /api/accounts/deactivate` (spec F14). */
export function createDeactivateAccountHandler(
  deps: AccountStatusHandlerDeps,
): (request: Request) => Promise<Response> {
  return createStatusHandler(deps, DeactivateAccountInputSchema, deps.service.deactivate);
}

/** Manejador de `POST /api/accounts/reactivate` (spec F14). */
export function createReactivateAccountHandler(
  deps: AccountStatusHandlerDeps,
): (request: Request) => Promise<Response> {
  return createStatusHandler(deps, ReactivateAccountInputSchema, deps.service.reactivate);
}
