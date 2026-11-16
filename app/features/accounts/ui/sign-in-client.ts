import { FirebaseError } from "firebase/app";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getClientAuth } from "@/shared/ui/firebase-client";
import { type Credentials, messageForAuthCode, messageForStatus, SIGN_IN_MESSAGES } from "./sign-in-messages";

function messageForError<T>(error: T): string {
  if (error instanceof FirebaseError) {
    return messageForAuthCode(error.code);
  }
  return SIGN_IN_MESSAGES.failed;
}

/**
 * Ingresa desde el navegador (spec F4, regla 1): Firebase comprueba la contraseña, el servidor cambia el token
 * por la cookie y el cliente de Firebase se cierra. Devuelve `null` si salió bien o el mensaje que hay que mostrar.
 * La usan el formulario de ingreso (F4) y el de autorregistro (F10).
 */
export async function signInWithPassword(credentials: Credentials): Promise<string | null> {
  const auth = getClientAuth();
  try {
    const result = await signInWithEmailAndPassword(auth, credentials.email, credentials.password);
    const idToken = await result.user.getIdToken();
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id_token: idToken }),
    });
    await signOut(auth);
    if (!response.ok) {
      return messageForStatus(response.status);
    }
    return null;
  } catch (error) {
    return messageForError(error);
  }
}
