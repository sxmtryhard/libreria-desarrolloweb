import "server-only";
import { type App, cert, getApps, initializeApp } from "firebase-admin/app";
import { type Auth, getAuth } from "firebase-admin/auth";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import { readServerEnv } from "./env";

/** Cliente de administración de Firebase (spec F0, regla 4). Se inicializa una sola vez por proceso. */
function adminApp(): App {
  const existing = getApps()[0];
  if (existing !== undefined) {
    return existing;
  }
  const env = readServerEnv(process.env);
  return initializeApp({
    credential: cert({ projectId: env.projectId, clientEmail: env.clientEmail, privateKey: env.privateKey }),
  });
}

export function getAdminAuth(): Auth {
  return getAuth(adminApp());
}

export function getAdminFirestore(): Firestore {
  return getFirestore(adminApp());
}

export const ACCOUNTS_COLLECTION = "accounts";

/** Indica si un error lanzado por Firebase Authentication tiene el código dado (p. ej. `auth/user-not-found`). */
export function hasAuthErrorCode<T>(error: T, prefix: string): boolean {
  if (!(error instanceof Error) || !("code" in error)) {
    return false;
  }
  return typeof error.code === "string" && error.code.startsWith(prefix);
}
