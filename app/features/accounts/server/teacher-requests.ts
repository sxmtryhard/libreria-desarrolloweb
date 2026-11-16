import type { NewTeacherRequest, TeacherRequest } from "../schema";

/** Solicitud tal como se guarda, con su identificador. */
export type StoredTeacherRequest = NewTeacherRequest & { id: string };

/** Lo que se devuelve de una solicitud: sin los datos de la cuenta (spec F11, regla 4.3). */
export function toTeacherRequest(stored: StoredTeacherRequest): TeacherRequest {
  return { id: stored.id, reason: stored.reason, status: stored.status, requested_at: stored.requested_at };
}

/** La más reciente por `requested_at`, o `null` si no hay ninguna (regla 5.4). */
export function latestOf(requests: readonly StoredTeacherRequest[]): TeacherRequest | null {
  let newest: StoredTeacherRequest | null = null;
  for (const request of requests) {
    if (newest === null || request.requested_at >= newest.requested_at) {
      newest = request;
    }
  }
  if (newest === null) {
    return null;
  }
  return toTeacherRequest(newest);
}
