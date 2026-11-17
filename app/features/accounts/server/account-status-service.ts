import { type Account, isAccountActive, type Role, type Session } from "@/shared/schema";
import { ConflictError, ForbiddenError, NotFoundError } from "@/shared/server/errors";
import { requireRole } from "@/shared/server/session";
import type { AccountStatus, DeactivateAccountInput, ReactivateAccountInput } from "../schema";
import type { AccountStatusRepository, StatusRecord } from "./repository";

/** Roles que pueden desactivar y reactivar (spec F14, regla 1.2). */
const STATUS_ROLES: readonly Role[] = ["BIBLIOTECARIO", "ADMINISTRADOR"];

/** Sobre qué cuentas puede actuar cada rol (regla 1.1). Nadie actúa sobre un administrador. */
const MANAGEABLE_ROLES: Record<Role, readonly Role[]> = {
  BIBLIOTECARIO: ["EXTERNO", "ESTUDIANTE", "DOCENTE"],
  ADMINISTRADOR: ["EXTERNO", "ESTUDIANTE", "DOCENTE", "BIBLIOTECARIO"],
  EXTERNO: [],
  ESTUDIANTE: [],
  DOCENTE: [],
};

const NOT_FOUND_MESSAGE = "No existe una cuenta con ese correo.";

export interface AccountStatusServiceDeps {
  accounts: AccountStatusRepository;
}

export interface AccountStatusService {
  /** Lanza `ForbiddenError` si la sesión no es del personal. La ruta la llama antes de leer el cuerpo. */
  assertCanChangeStatus(session: Session): void;
  deactivate(session: Session, input: DeactivateAccountInput, now: Date): Promise<AccountStatus>;
  reactivate(session: Session, input: ReactivateAccountInput, now: Date): Promise<AccountStatus>;
}

/** Regla 1.1: nadie sobre sí mismo, y cada rol solo sobre los de `MANAGEABLE_ROLES`. */
function assertCanManage(session: Session, uid: string, account: Account): void {
  if (uid === session.uid || !MANAGEABLE_ROLES[session.role].includes(account.role)) {
    throw new ForbiddenError();
  }
}

export function createAccountStatusService(deps: AccountStatusServiceDeps): AccountStatusService {
  function assertCanChangeStatus(session: Session): void {
    requireRole(session, STATUS_ROLES);
  }

  /** Orden de la regla 1.3 tras el cuerpo: cuenta buscada (404) → permiso sobre ella (403) → cambio (409). */
  async function change(
    session: Session,
    email: string,
    record: (account: Account) => StatusRecord,
  ): Promise<AccountStatus> {
    assertCanChangeStatus(session);
    const uid = await deps.accounts.findUidByEmail(email);
    if (uid === null) {
      throw new NotFoundError(NOT_FOUND_MESSAGE);
    }
    const account = await deps.accounts.changeStatus(uid, (current) => {
      if (current === null) {
        throw new NotFoundError(NOT_FOUND_MESSAGE);
      }
      assertCanManage(session, uid, current);
      return record(current);
    });
    return { uid, email: account.email, name: account.name, role: account.role, active: isAccountActive(account) };
  }

  function deactivate(session: Session, input: DeactivateAccountInput, now: Date): Promise<AccountStatus> {
    return change(session, input.email, (current) => {
      if (!isAccountActive(current)) {
        throw new ConflictError("La cuenta ya está desactivada.");
      }
      return {
        active: false,
        deactivated_at: now.toISOString(),
        deactivated_by_uid: session.uid,
        deactivation_reason: input.reason,
      };
    });
  }

  function reactivate(session: Session, input: ReactivateAccountInput, now: Date): Promise<AccountStatus> {
    return change(session, input.email, (current) => {
      if (isAccountActive(current)) {
        throw new ConflictError("La cuenta ya está activa.");
      }
      return { active: true, reactivated_at: now.toISOString(), reactivated_by_uid: session.uid };
    });
  }

  return { assertCanChangeStatus, deactivate, reactivate };
}
