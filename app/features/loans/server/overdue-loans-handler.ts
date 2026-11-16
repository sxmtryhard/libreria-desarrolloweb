import type { Session } from "@/shared/schema";
import { errorToResponse } from "@/shared/server/http";
import { OverdueQuerySchema } from "../schema";
import type { OverdueService } from "./overdue-service";

export interface OverdueLoansHandlerDeps {
  service: OverdueService;
  /** Sesión de la petición actual; lanza `UnauthenticatedError` si no hay. */
  readSession(): Promise<Session>;
  now(): Date;
  /** `unstable_rethrow` de Next: deja pasar sus errores internos antes de traducir (docs/architecture.md). */
  rethrow<T>(error: T): void;
}

/**
 * Manejador de `GET /api/loans/overdue` (spec F8). Orden: sesión → parámetros → permiso → búsqueda.
 * Es una consulta: no valida el origen. Si `borrower_email` se repite, vale el primero.
 */
export function createOverdueLoansHandler(deps: OverdueLoansHandlerDeps): (request: Request) => Promise<Response> {
  return async function handle(request: Request): Promise<Response> {
    try {
      const session = await deps.readSession();
      const params = new URL(request.url).searchParams;
      const query = OverdueQuerySchema.parse({ borrower_email: params.get("borrower_email") ?? undefined });
      return Response.json(await deps.service.list(session, query, deps.now()));
    } catch (error) {
      deps.rethrow(error);
      return errorToResponse(error);
    }
  };
}
