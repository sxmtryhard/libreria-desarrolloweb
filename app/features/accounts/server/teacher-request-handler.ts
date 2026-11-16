import type { Session } from "@/shared/schema";
import { assertSameOrigin, errorToResponse, readJsonBody } from "@/shared/server/http";
import { TeacherRequestInputSchema } from "../schema";
import type { TeacherRequestService } from "./teacher-request-service";

export interface TeacherRequestHandlerDeps {
  service: TeacherRequestService;
  /** Sesión de la petición actual; lanza `UnauthenticatedError` si no hay. */
  readSession(): Promise<Session>;
  now(): Date;
  /** `unstable_rethrow` de Next: deja pasar sus errores internos antes de traducir (docs/architecture.md). */
  rethrow<T>(error: T): void;
}

/** Manejador de `POST /api/teacher-requests` (spec F11). Orden: origen → sesión → rol → cuerpo → creación. */
export function createTeacherRequestHandler(deps: TeacherRequestHandlerDeps): (request: Request) => Promise<Response> {
  return async function handle(request: Request): Promise<Response> {
    try {
      assertSameOrigin(request);
      const session = await deps.readSession();
      deps.service.assertCanRequest(session);
      const input = await readJsonBody(request, TeacherRequestInputSchema);
      const created = await deps.service.request(session, input, deps.now());
      return Response.json(created, { status: 201 });
    } catch (error) {
      deps.rethrow(error);
      return errorToResponse(error);
    }
  };
}
