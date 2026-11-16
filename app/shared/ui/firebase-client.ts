import { type FirebaseApp, getApps, initializeApp } from "firebase/app";
import { type Auth, getAuth } from "firebase/auth";

/**
 * Cliente de Firebase para el navegador (spec F0, regla 4.4). Solo se usa para Authentication (ADR-0003).
 * Las variables `NEXT_PUBLIC_*` no son secretos y Next las incrusta al compilar: hay que nombrarlas enteras.
 */
function clientApp(): FirebaseApp {
  const existing = getApps()[0];
  if (existing !== undefined) {
    return existing;
  }
  return initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  });
}

export function getClientAuth(): Auth {
  return getAuth(clientApp());
}
