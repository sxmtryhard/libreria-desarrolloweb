import type { Role, Session } from "@/shared/schema";
import { ForbiddenError, UnauthenticatedError } from "./errors";

/** Sesión (spec F0, regla 3). Lógica pura: Firebase y Firestore entran por los puertos. */

export const SESSION_COOKIE_NAME = "session";
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_SECONDS * 1000;

export interface VerifiedCookie {
  uid: string;
  email: string;
  issuedAt: Date;
}

/** Puerto hacia Firebase Authentication. */
export interface SessionAuthPort {
  /** Devuelve `null` si Firebase rechaza el token de ingreso (inválido o vencido). */
  createCookie(idToken: string, durationMs: number): Promise<string | null>;
  /** Devuelve `null` si la cookie es inválida, venció o fue revocada. */
  verifyCookie(cookie: string): Promise<VerifiedCookie | null>;
  revoke(uid: string): Promise<void>;
}

/** Puerto hacia el documento `accounts/{uid}`. */
export interface AccountRolePort {
  findRole(uid: string): Promise<Role | null>;
}

export interface SessionCookie {
  name: string;
  value: string;
  options: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: "lax";
    path: string;
    maxAge: number;
  };
}

export interface SessionDeps {
  auth: SessionAuthPort;
  accounts: AccountRolePort;
  isProduction: boolean;
}

export interface SessionService {
  create(idToken: string): Promise<SessionCookie>;
  verify(cookieValue: string | undefined, now: Date): Promise<Session>;
  close(cookieValue: string | undefined): Promise<SessionCookie>;
}

function hasValue(cookieValue: string | undefined): cookieValue is string {
  return cookieValue !== undefined && cookieValue.length > 0;
}

export function createSessionService(deps: SessionDeps): SessionService {
  function cookie(value: string, maxAge: number): SessionCookie {
    return {
      name: SESSION_COOKIE_NAME,
      value,
      options: { httpOnly: true, secure: deps.isProduction, sameSite: "lax", path: "/", maxAge },
    };
  }

  async function create(idToken: string): Promise<SessionCookie> {
    const value = await deps.auth.createCookie(idToken, SESSION_MAX_AGE_MS);
    if (value === null) {
      throw new UnauthenticatedError();
    }
    return cookie(value, SESSION_MAX_AGE_SECONDS);
  }

  async function verify(cookieValue: string | undefined, now: Date): Promise<Session> {
    if (!hasValue(cookieValue)) {
      throw new UnauthenticatedError();
    }
    const verified = await deps.auth.verifyCookie(cookieValue);
    if (verified === null) {
      throw new UnauthenticatedError();
    }
    if (now.getTime() - verified.issuedAt.getTime() >= SESSION_MAX_AGE_MS) {
      throw new UnauthenticatedError();
    }
    const role = await deps.accounts.findRole(verified.uid);
    if (role === null) {
      throw new UnauthenticatedError();
    }
    return { uid: verified.uid, email: verified.email, role };
  }

  async function close(cookieValue: string | undefined): Promise<SessionCookie> {
    if (hasValue(cookieValue)) {
      const verified = await deps.auth.verifyCookie(cookieValue);
      if (verified !== null) {
        await deps.auth.revoke(verified.uid);
      }
    }
    return cookie("", 0);
  }

  return { create, verify, close };
}

/** Lanza `ForbiddenError` si el rol de la sesión no está en la lista (regla 3.7). */
export function requireRole(session: Session, roles: readonly Role[]): void {
  if (!roles.includes(session.role)) {
    throw new ForbiddenError();
  }
}
