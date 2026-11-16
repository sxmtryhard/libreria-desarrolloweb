import type { Session } from "@/shared/schema";
import { assertSameOrigin, errorToResponse, readJsonBody } from "@/shared/server/http";
import { DecideTeacherRequestInputSchema } from "../schema";
import type { TeacherRequestService } from "./teacher-request-service";

export interface TeacherDecisionHandlerDeps {
  service: TeacherRequestService;
  /** Sesión de la petición actual; lanza `UnauthenticatedError` si no hay. */
  readSession(): Promise<Session>;
  now(): Date;
  /** `unstable_rethrow` de Next: deja pasar sus errores internos antes de traducir (docs/architecture.md). */
  rethrow<T>(error: T): void;
}

/** Manejador de `GET /api/teacher-requests/pending` (spec F12, regla 2). Es una consulta: no valida el origen. */
export function createPendingTeacherRequestsHandler(
  deps: TeacherDecisionHandlerDeps,
): (request: Request) => Promise<Response> {
  return async function handle(): Promise<Response> {
    try {
      const session = await deps.readSession();
      return Response.json(await deps.service.listPending(session));
    } catch (error) {
      deps.rethrow(error);
      return errorToResponse(error);
    }
  };
}

/** Manejador de `POST /api/teacher-requests/decision` (spec F12, regla 3.2): origen → sesión → rol → cuerpo → decisión. */
export function createTeacherDecisionHandler(
  deps: TeacherDecisionHandlerDeps,
): (request: Request) => Promise<Response> {
  return async function handle(request: Request): Promise<Response> {
    try {
      assertSameOrigin(request);
      const session = await deps.readSession();
      deps.service.assertCanDecide(session);
      const input = await readJsonBody(request, DecideTeacherRequestInputSchema);
      return Response.json(await deps.service.decide(session, input, deps.now()));
    } catch (error) {
      deps.rethrow(error);
      return errorToResponse(error);
    }
  };
}
