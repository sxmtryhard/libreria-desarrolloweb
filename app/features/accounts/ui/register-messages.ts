import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../schema";

/** Textos y comprobaciones del formulario de autorregistro (spec F10, reglas 4.2–4.5). Lógica pura. */

export const REGISTER_MESSAGES = {
  missingName: "Escribe tu nombre.",
  missingEmail: "Escribe tu correo.",
  passwordLength: "La contraseña debe tener entre 8 y 128 caracteres.",
  mismatch: "Las contraseñas no coinciden.",
  checkForm: "Revisa los datos del formulario.",
  failed: "No se pudo crear la cuenta. Intenta de nuevo.",
  createdButNoSession: "Tu cuenta se creó. Ingresa con tu correo y tu contraseña.",
} as const;

export interface RegisterForm {
  name: string;
  email: string;
  password: string;
  repeat: string;
}

/** Primer problema del formulario, en el orden de la regla 4.2, o `null` si se puede enviar. */
export function registrationProblem(form: RegisterForm): string | null {
  if (form.name.trim().length === 0) {
    return REGISTER_MESSAGES.missingName;
  }
  if (form.email.trim().length === 0) {
    return REGISTER_MESSAGES.missingEmail;
  }
  if (form.password.length < PASSWORD_MIN_LENGTH || form.password.length > PASSWORD_MAX_LENGTH) {
    return REGISTER_MESSAGES.passwordLength;
  }
  if (form.password !== form.repeat) {
    return REGISTER_MESSAGES.mismatch;
  }
  return null;
}

/** Mensaje para una respuesta de error de `POST /api/accounts/register` (regla 4.3). */
export function registerFailureMessage(status: number, serverMessage: string | null): string {
  if (status === 409 && serverMessage !== null) {
    return serverMessage;
  }
  if (status === 400) {
    return REGISTER_MESSAGES.checkForm;
  }
  return REGISTER_MESSAGES.failed;
}
