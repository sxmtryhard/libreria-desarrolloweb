import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../schema";

/** Textos de la pantalla «Cambiar contraseña» (spec F15, regla 4). Lógica pura. */
export const PASSWORD_MESSAGES = {
  missingCurrent: "Escribe tu contraseña actual.",
  newLength: "La contraseña nueva debe tener entre 8 y 128 caracteres.",
  mismatch: "Las contraseñas nuevas no coinciden.",
  sameAsCurrent: "La contraseña nueva debe ser distinta de la actual.",
  sessionEnded: "Tu sesión terminó. Vuelve a ingresar.",
  failed: "No se pudo cambiar la contraseña. Intenta de nuevo.",
  changed: "Tu contraseña cambió. Ingresa con la nueva.",
} as const;

/** Enlace de la cabecera, junto a «Cerrar sesión» (regla 4.3). */
export const CHANGE_PASSWORD_LINK = { href: "/cambiar-contrasena", label: "Cambiar contraseña" } as const;

/** Parámetro con el que se llega a `/ingresar` tras el cambio (regla 4.6). */
export const PASSWORD_CHANGED_PARAM = "contrasena";
const PASSWORD_CHANGED_VALUE = "cambiada";
export const AFTER_CHANGE_URL = `/ingresar?${PASSWORD_CHANGED_PARAM}=${PASSWORD_CHANGED_VALUE}`;

export interface PasswordForm {
  current: string;
  next: string;
  repeat: string;
}

/** Primer problema del formulario en el orden de la regla 4.4, o `null`. Nada se recorta. */
export function passwordProblem(form: PasswordForm): string | null {
  if (form.current.length === 0) {
    return PASSWORD_MESSAGES.missingCurrent;
  }
  if (form.next.length < PASSWORD_MIN_LENGTH || form.next.length > PASSWORD_MAX_LENGTH) {
    return PASSWORD_MESSAGES.newLength;
  }
  if (form.next !== form.repeat) {
    return PASSWORD_MESSAGES.mismatch;
  }
  if (form.next === form.current) {
    return PASSWORD_MESSAGES.sameAsCurrent;
  }
  return null;
}

/** Mensaje para una respuesta fallida (regla 4.5). `status` 0 = no hubo respuesta. */
export function passwordFailureMessage(status: number, serverMessage: string | null): string {
  if (status === 401) {
    return PASSWORD_MESSAGES.sessionEnded;
  }
  if ((status === 400 || status === 409) && serverMessage !== null) {
    return serverMessage;
  }
  return PASSWORD_MESSAGES.failed;
}

/** Aviso de `/ingresar`: solo con `?contrasena=cambiada` (regla 4.6). */
export function signInNotice(param: string | string[] | undefined): string | null {
  if (param === PASSWORD_CHANGED_VALUE) {
    return PASSWORD_MESSAGES.changed;
  }
  return null;
}
