/** Textos comunes de los formularios del personal (spec F36, regla 4). Lógica pura. */

export const FORM_MESSAGES = {
  forbiddenScreen: "No tienes permiso para ver esta pantalla.",
  checkData: "Revisa los datos del formulario.",
  sessionEnded: "Tu sesión terminó. Vuelve a ingresar.",
  forbidden: "No tienes permiso para hacer esto.",
  failed: "No se pudo registrar. Intenta de nuevo.",
  pending: "Registrando…",
} as const;

const STATUS_MESSAGES: Record<number, string> = {
  400: FORM_MESSAGES.checkData,
  401: FORM_MESSAGES.sessionEnded,
  403: FORM_MESSAGES.forbidden,
};

/** Mensaje para un fallo del servidor (regla 4.1–4.2). Con 409 se muestra el del servidor. */
export function formFailureMessage(status: number, serverMessage: string | null): string {
  if (status === 409 && serverMessage !== null) {
    return serverMessage;
  }
  return STATUS_MESSAGES[status] ?? FORM_MESSAGES.failed;
}
