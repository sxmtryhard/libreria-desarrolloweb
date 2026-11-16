import { assertSameOrigin, errorToResponse, readJsonBody } from "@/shared/server/http";
import type { SessionCookie, SessionService } from "@/shared/server/session";
import { SignInInputSchema } from "../schema";

interface CommonDeps {
  sessions: SessionService;
  /** Escribe la cookie en la respuesta de la petición actual. */
  writeCookie(cookie: SessionCookie): Promise<void>;
  /** `unstable_rethrow` de Next: deja pasar sus errores internos antes de traducir (docs/architecture.md). */
  rethrow<T>(error: T): void;
}

export interface SignInHandlerDeps extends CommonDeps {
  now(): Date;
}

export interface SignOutHandlerDeps extends CommonDeps {
  /** Valor crudo de la cookie de sesión de la petición actual. */
  readCookieValue(): Promise<string | undefined>;
}

/**
 * Manejador de `POST /api/session` (spec F4, regla 1). Orden: origen → cuerpo → token.
 * La cookie solo se escribe si el token es válido y la cuenta tiene documento (regla 1.5).
 */
export function createSignInHandler(deps: SignInHandlerDeps): (request: Request) => Promise<Response> {
  return async function handle(request: Request): Promise<Response> {
    try {
      assertSameOrigin(request);
      const input = await readJsonBody(request, SignInInputSchema);
      const cookie = await deps.sessions.create(input.id_token);
      const session = await deps.sessions.verify(cookie.value, deps.now());
      await deps.writeCookie(cookie);
      return Response.json(session, { status: 200 });
    } catch (error) {
      deps.rethrow(error);
      return errorToResponse(error);
    }
  };
}

/**
 * Manejador de `DELETE /api/session` (spec F4, regla 4). Orden: origen → cerrar.
 * Sin cookie o con una cookie inválida igual responde 204. Si falla la revocación, la cookie no se borra.
 */
export function createSignOutHandler(deps: SignOutHandlerDeps): (request: Request) => Promise<Response> {
  return async function handle(request: Request): Promise<Response> {
    try {
      assertSameOrigin(request);
      const cleared = await deps.sessions.close(await deps.readCookieValue());
      await deps.writeCookie(cleared);
      return new Response(null, { status: 204 });
    } catch (error) {
      deps.rethrow(error);
      return errorToResponse(error);
    }
  };
}
