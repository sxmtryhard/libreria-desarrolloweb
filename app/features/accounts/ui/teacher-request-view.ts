import type { Role } from "@/shared/schema";
import {
  REASON_MAX_LENGTH,
  REASON_MIN_LENGTH,
  type TeacherRequest,
  TeacherRequesterRoleSchema,
  type TeacherRequestStatus,
} from "../schema";

/** Textos y estados de «Solicitar docente» (spec F11, regla 5). Lógica pura. */

export const TEACHER_REQUEST_MESSAGES = {
  alreadyTeacher: "Ya tienes el rol de docente.",
  staffOnly: "Esta pantalla es para quienes piden libros prestados.",
  sent: "Solicitud enviada.",
  reasonTooShort: "Escribe un motivo de al menos 10 caracteres.",
  reasonTooLong: "El motivo puede tener como máximo 500 caracteres.",
  checkReason: "Revisa el motivo.",
  failed: "No se pudo enviar la solicitud. Intenta de nuevo.",
} as const;

const LATEST_MESSAGES: Record<TeacherRequestStatus, string> = {
  PENDIENTE: "Tu solicitud está pendiente.",
  RECHAZADA: "Tu última solicitud fue rechazada.",
  APROBADA: "Tu última solicitud fue aprobada.",
};

export type TeacherRequestScreen =
  | { kind: "teacher" }
  | { kind: "staff" }
  | { kind: "borrower"; latest: TeacherRequest | null; showForm: boolean };

/** Qué ve cada quien (reglas 5.2–5.4). */
export function teacherRequestScreen(role: Role, latest: TeacherRequest | null): TeacherRequestScreen {
  if (role === "DOCENTE") {
    return { kind: "teacher" };
  }
  if (!TeacherRequesterRoleSchema.safeParse(role).success) {
    return { kind: "staff" };
  }
  let showForm = true;
  if (latest !== null && latest.status === "PENDIENTE") {
    showForm = false;
  }
  return { kind: "borrower", latest, showForm };
}

export function latestRequestMessage(status: TeacherRequestStatus): string {
  return LATEST_MESSAGES[status];
}

/** Revisión antes de enviar, sobre el texto recortado (regla 5.5). `null` = sin problemas. */
export function reasonProblem(reason: string): string | null {
  const length = reason.trim().length;
  if (length < REASON_MIN_LENGTH) {
    return TEACHER_REQUEST_MESSAGES.reasonTooShort;
  }
  if (length > REASON_MAX_LENGTH) {
    return TEACHER_REQUEST_MESSAGES.reasonTooLong;
  }
  return null;
}

/** Mensaje para un fallo del servidor (regla 5.6). */
export function teacherRequestFailureMessage(status: number, serverMessage: string | null): string {
  if ((status === 409 || status === 403) && serverMessage !== null) {
    return serverMessage;
  }
  if (status === 400) {
    return TEACHER_REQUEST_MESSAGES.checkReason;
  }
  return TEACHER_REQUEST_MESSAGES.failed;
}
