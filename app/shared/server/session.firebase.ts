import "server-only";
import { cookies } from "next/headers";
import { AccountSchema, isAccountActive, type Role, type Session } from "@/shared/schema";
import { ACCOUNTS_COLLECTION, getAdminAuth, getAdminFirestore, hasAuthErrorCode } from "./firebase-admin";
import {
  type AccountRolePort,
  createSessionService,
  SESSION_COOKIE_NAME,
  type SessionAuthPort,
  type SessionCookie,
  type SessionService,
  type VerifiedCookie,
} from "./session";

/** Conexión real de la sesión con Firebase Authentication, Firestore y las cookies de Next (spec F0, regla 3). */

const REJECTED_TOKEN_CODES = [
  "auth/invalid-id-token",
  "auth/id-token-expired",
  "auth/id-token-revoked",
  "auth/argument-error",
  "auth/user-disabled",
  "auth/user-not-found",
];

const firebaseSessionAuth: SessionAuthPort = {
  async createCookie(idToken: string, durationMs: number): Promise<string | null> {
    const auth = getAdminAuth();
    try {
      return await auth.createSessionCookie(idToken, { expiresIn: durationMs });
    } catch (error) {
      // Token de ingreso inválido, vencido o de un usuario deshabilitado. Otros fallos (red, configuración) no se ocultan.
      if (REJECTED_TOKEN_CODES.some((code) => hasAuthErrorCode(error, code))) {
        return null;
      }
      throw error;
    }
  },

  async verifyCookie(cookie: string): Promise<VerifiedCookie | null> {
    const auth = getAdminAuth();
    try {
      const decoded = await auth.verifySessionCookie(cookie, true);
      if (decoded.email === undefined) {
        return null;
      }
      return { uid: decoded.uid, email: decoded.email, issuedAt: new Date(decoded.iat * 1000) };
    } catch (error) {
      // Cookie inválida, vencida o revocada. Cualquier otro fallo (red, configuración) no se oculta.
      if (hasAuthErrorCode(error, "auth/")) {
        return null;
      }
      throw error;
    }
  },

  revoke(uid: string): Promise<void> {
    return getAdminAuth().revokeRefreshTokens(uid);
  },
};

const firestoreAccountRoles: AccountRolePort = {
  async findRole(uid: string): Promise<Role | null> {
    const snapshot = await getAdminFirestore().collection(ACCOUNTS_COLLECTION).doc(uid).get();
    if (!snapshot.exists) {
      return null;
    }
    const account = AccountSchema.safeParse(snapshot.data());
    // Una cuenta desactivada no tiene sesión aunque su cookie siga vigente (spec F14, regla 3.1).
    if (!account.success || !isAccountActive(account.data)) {
      return null;
    }
    return account.data.role;
  },
};

export const sessionService: SessionService = createSessionService({
  auth: firebaseSessionAuth,
  accounts: firestoreAccountRoles,
  isProduction: process.env.NODE_ENV === "production",
});

/**
 * Sesión de la petición actual. Lanza `UnauthenticatedError` si no hay sesión válida.
 * Lee `cookies()`: en una página va dentro de `<Suspense>`, y en un `catch` que la envuelva
 * se llama primero a `unstable_rethrow(error)` (docs/architecture.md → Cache Components).
 */
export async function readSession(now: Date): Promise<Session> {
  const store = await cookies();
  return sessionService.verify(store.get(SESSION_COOKIE_NAME)?.value, now);
}

/** Valor crudo de la cookie de sesión de la petición actual (para cerrar sesión). */
export async function readSessionCookieValue(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE_NAME)?.value;
}

/** Escribe la cookie devuelta por `sessionService.create` o `sessionService.close`. Solo en rutas y Server Functions. */
export async function writeSessionCookie(cookie: SessionCookie): Promise<void> {
  const store = await cookies();
  store.set(cookie.name, cookie.value, cookie.options);
}
