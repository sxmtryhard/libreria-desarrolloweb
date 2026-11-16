import type { Session } from "@/shared/schema";
import { ConflictError, ForbiddenError, UnauthenticatedError } from "@/shared/server/errors";
import { type TeacherRequest, type TeacherRequestInput, TeacherRequesterRoleSchema } from "../schema";
import type { AccountDirectory, TeacherRequestRepository } from "./repository";

const FORBIDDEN_MESSAGE = "Solo un externo o un estudiante puede pedir el rol de docente.";
const PENDING_MESSAGE = "Ya tienes una solicitud pendiente.";

export interface TeacherRequestServiceDeps {
  requests: TeacherRequestRepository;
  accounts: AccountDirectory;
}

export interface TeacherRequestService {
  /** Lanza `ForbiddenError` si el rol no puede pedir. La ruta la llama antes de leer el cuerpo (regla 4.2). */
  assertCanRequest(session: Session): void;
  request(session: Session, input: TeacherRequestInput, now: Date): Promise<TeacherRequest>;
  /** La última solicitud de quien tiene la sesión (regla 5.4). */
  latest(session: Session): Promise<TeacherRequest | null>;
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

  function latest(session: Session): Promise<TeacherRequest | null> {
    return deps.requests.latest(session.uid);
  }

  return { assertCanRequest, request, latest };
}
