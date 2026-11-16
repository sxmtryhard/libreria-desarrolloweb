/** Textos y validación del formulario de ingreso (spec F4, regla 2). Lógica pura, sin Firebase. */

export const SIGN_IN_MESSAGES = {
  missing: "Escribe tu correo y tu contraseña.",
  invalid: "Correo o contraseña incorrectos.",
  tooMany: "Demasiados intentos. Intenta de nuevo más tarde.",
  failed: "No se pudo ingresar. Intenta de nuevo.",
} as const;

export interface Credentials {
  email: string;
  password: string;
}

/** Devuelve las credenciales listas para enviar, o `null` si falta alguna (reglas 2.2 y 2.3). */
export function prepareCredentials(email: string, password: string): Credentials | null {
  const trimmedEmail = email.trim();
  if (trimmedEmail.length === 0 || password.length === 0) {
    return null;
  }
  return { email: trimmedEmail, password };
}

/** Códigos de Firebase que significan «credenciales malas»: todos muestran lo mismo (regla 2.4). */
const INVALID_CREDENTIAL_CODES = new Set([
  "auth/invalid-credential",
  "auth/user-not-found",
  "auth/wrong-password",
  "auth/invalid-email",
]);

export function messageForAuthCode(code: string): string {
  if (INVALID_CREDENTIAL_CODES.has(code)) {
    return SIGN_IN_MESSAGES.invalid;
  }
  if (code === "auth/too-many-requests") {
    return SIGN_IN_MESSAGES.tooMany;
  }
  return SIGN_IN_MESSAGES.failed;
}

/** Mensaje para una respuesta de error de `POST /api/session` (reglas 2.5 y 2.7). */
export function messageForStatus(status: number): string {
  if (status === 401) {
    return SIGN_IN_MESSAGES.invalid;
  }
  return SIGN_IN_MESSAGES.failed;
}
