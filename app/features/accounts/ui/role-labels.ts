import type { Role, Session } from "@/shared/schema";

/** Nombre de cada rol en español, para mostrarlo en pantalla. */
export const ROLE_LABELS: Record<Role, string> = {
  EXTERNO: "Externo",
  ESTUDIANTE: "Estudiante",
  DOCENTE: "Docente",
  BIBLIOTECARIO: "Bibliotecario",
  ADMINISTRADOR: "Administrador",
};

/** Cómo se identifica a la persona en la cabecera: «correo · Rol» (spec F33, regla 1.6). */
export function sessionLabel(session: Session): string {
  return `${session.email} · ${ROLE_LABELS[session.role]}`;
}
