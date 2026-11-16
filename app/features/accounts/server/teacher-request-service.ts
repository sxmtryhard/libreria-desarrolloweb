import type { Role, Session } from "@/shared/schema";
import { ConflictError, ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/server/errors";
import { requireRole } from "@/shared/server/session";
import {
  type DecidedTeacherRequest,
  type DecideTeacherRequestInput,
  type MyTeacherRequest,
  PENDING_LIST_LIMIT,
  type PendingTeacherRequestsResponse,
  type TeacherRequest,
  type TeacherRequestInput,
  TeacherRequesterRoleSchema,
} from "../schema";
import type { AccountDirectory, DecisionChange, DecisionState, TeacherRequestRepository } from "./repository";

const FORBIDDEN_MESSAGE = "Solo un externo o un estudiante puede pedir el rol de docente.";
const PENDING_MESSAGE = "Ya tienes una solicitud pendiente.";
const NOT_FOUND_MESSAGE = "No existe esa solicitud.";
const DECIDED_MESSAGE = "La solicitud ya fue decidida.";
const ACCOUNT_MESSAGE = "La cuenta ya no puede recibir el rol de docente.";

/** Roles que deciden las solicitudes (spec F12, regla 1.1). */
const DECIDER_ROLES: readonly Role[] = ["BIBLIOTECARIO", "ADMINISTRADOR"];

export interface TeacherRequestServiceDeps {
  requests: TeacherRequestRepository;
  accounts: AccountDirectory;
}

export interface TeacherRequestService {
  /** Lanza `ForbiddenError` si el rol no puede pedir. La ruta la llama antes de leer el cuerpo (F11, regla 4.2). */
  assertCanRequest(session: Session): void;
  request(session: Session, input: TeacherRequestInput, now: Date): Promise<TeacherRequest>;
  /** La última solicitud de quien tiene la sesión, con la nota del personal (F11 5.4, F12 5.3). */
  latest(session: Session): Promise<MyTeacherRequest | null>;
  /** Lanza `ForbiddenError` si el rol no puede decidir (F12, regla 1.1). */
  assertCanDecide(session: Session): void;
  listPending(session: Session): Promise<PendingTeacherRequestsResponse>;
  decide(session: Session, input: DecideTeacherRequestInput, now: Date): Promise<DecidedTeacherRequest>;
}

/** Nota recortada, o `null` si está vacía o ausente (F12, regla 5.2). El esquema ya la recortó. */
function noteOf(note: string | undefined): string | null {
  if (note === undefined || note.length === 0) {
    return null;
  }
  return note;
}

/** Reglas de la decisión (F12, reglas 3.3, 4.2, 4.4 y 5). Lanza si no se puede decidir. */
function decisionChange(state: DecisionState, input: DecideTeacherRequestInput, by: string, now: Date): DecisionChange {
  if (state.request === null) {
    throw new NotFoundError(NOT_FOUND_MESSAGE);
  }
  if (state.request.status !== "PENDIENTE") {
    throw new ConflictError(DECIDED_MESSAGE);
  }
  const decided = { decided_at: now.toISOString(), decided_by_uid: by };
  if (input.decision === "RECHAZADA") {
    return { status: "RECHAZADA", ...decided, note: noteOf(input.note), newRole: null };
  }
  if (!TeacherRequesterRoleSchema.safeParse(state.accountRole).success) {
    throw new ConflictError(ACCOUNT_MESSAGE);
  }
  return { status: "APROBADA", ...decided, note: null, newRole: "DOCENTE" };
}

export function createTeacherRequestService(deps: TeacherRequestServiceDeps): TeacherRequestService {
  function assertCanRequest(session: Session): void {
    if (!TeacherRequesterRoleSchema.safeParse(session.role).success) {
      throw new ForbiddenError(FORBIDDEN_MESSAGE);
    }
  }

  async function request(session: Session, input: TeacherRequestInput, now: Date): Promise<TeacherRequest> {
    assertCanRequest(session);
    // El nombre sale de `accounts/{uid}`; sin documento no hay sesión válida (F0).
    const account = await deps.accounts.findAccount(session.uid);
    if (account === null) {
      throw new UnauthenticatedError();
    }
    const created = await deps.requests.createIfNonePending({
      uid: session.uid,
      email: session.email,
      name: account.name,
      reason: input.reason,
      status: "PENDIENTE",
      requested_at: now.toISOString(),
    });
    if (created === null) {
      throw new ConflictError(PENDING_MESSAGE);
    }
    return created;
  }

  function latest(session: Session): Promise<MyTeacherRequest | null> {
    return deps.requests.latest(session.uid);
  }

  function assertCanDecide(session: Session): void {
    requireRole(session, DECIDER_ROLES);
  }

  // `async` a propósito: un rol sin permiso debe rechazar la promesa, no lanzar de forma síncrona.
  async function listPending(session: Session): Promise<PendingTeacherRequestsResponse> {
    assertCanDecide(session);
    return { requests: await deps.requests.listPending(PENDING_LIST_LIMIT) };
  }

  async function decide(session: Session, input: DecideTeacherRequestInput, now: Date): Promise<DecidedTeacherRequest> {
    assertCanDecide(session);
    const saved = await deps.requests.decide(input.request_id, (state) =>
      decisionChange(state, input, session.uid, now),
    );
    return { id: saved.id, status: input.decision, decided_at: now.toISOString(), note: saved.note ?? null };
  }

  return { assertCanRequest, request, latest, assertCanDecide, listPending, decide };
}
