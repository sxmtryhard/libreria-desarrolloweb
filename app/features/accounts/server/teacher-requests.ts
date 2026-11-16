import type { MyTeacherRequest, NewTeacherRequest, PendingTeacherRequest, TeacherRequest } from "../schema";

/** Solicitud tal como se guarda, con su identificador. */
export type StoredTeacherRequest = NewTeacherRequest & { id: string };

/** Lo que se devuelve al crear una solicitud: sin los datos de la cuenta (spec F11, regla 4.3). */
export function toTeacherRequest(stored: StoredTeacherRequest): TeacherRequest {
  return { id: stored.id, reason: stored.reason, status: stored.status, requested_at: stored.requested_at };
}

/** Lo que ve el personal de una pendiente (spec F12, regla 2.2). */
export function toPendingTeacherRequest(stored: StoredTeacherRequest): PendingTeacherRequest {
  return {
    id: stored.id,
    uid: stored.uid,
    email: stored.email,
    name: stored.name,
    reason: stored.reason,
    requested_at: stored.requested_at,
  };
}

/** La más reciente por `requested_at`, con la nota del personal, o `null` si no hay ninguna (F11 5.4, F12 5.3). */
export function latestOf(requests: readonly StoredTeacherRequest[]): MyTeacherRequest | null {
  let newest: StoredTeacherRequest | null = null;
  for (const request of requests) {
    if (newest === null || request.requested_at >= newest.requested_at) {
      newest = request;
    }
  }
  if (newest === null) {
    return null;
  }
  return { ...toTeacherRequest(newest), note: newest.note ?? null };
}

/** Las pendientes, la más antigua primero, como máximo `limit` (spec F12, regla 2.1). */
export function oldestPending(requests: readonly StoredTeacherRequest[], limit: number): PendingTeacherRequest[] {
  return requests
    .filter((request) => request.status === "PENDIENTE")
    .sort((first, second) => first.requested_at.localeCompare(second.requested_at))
    .slice(0, limit)
    .map(toPendingTeacherRequest);
}
