import type { Account, Role } from "@/shared/schema";
import type {
  DeactivationRecord,
  MyTeacherRequest,
  NewTeacherRequest,
  PendingTeacherRequest,
  ReactivationRecord,
  TeacherRequest,
} from "../schema";
import type {
  AccountRepository,
  AccountStatusRepository,
  DecisionChange,
  DecisionState,
  StatusRecord,
  TeacherRequestRepository,
} from "./repository";
import { latestOf, oldestPending, type StoredTeacherRequest, toTeacherRequest } from "./teacher-requests";

export interface MemoryUser {
  uid: string;
  email: string;
  name: string;
  password: string;
}

/** Cuentas en memoria, para las pruebas. Añade consultas que el puerto real no necesita. */
export interface MemoryAccountRepository extends AccountRepository {
  findUser(email: string): MemoryUser | null;
  findAccount(uid: string): Account | null;
  userCount(): number;
}

export function createMemoryAccountRepository(): MemoryAccountRepository {
  const usersByEmail = new Map<string, MemoryUser>();
  const accountsByUid = new Map<string, Account>();
  let nextId = 1;

  return {
    createUser(email: string, password: string, name: string): Promise<string | null> {
      if (usersByEmail.has(email)) {
        return Promise.resolve(null);
      }
      const uid = `user-${nextId}`;
      nextId += 1;
      usersByEmail.set(email, { uid, email, name, password });
      return Promise.resolve(uid);
    },
    deleteUser(uid: string): Promise<void> {
      for (const [email, user] of usersByEmail) {
        if (user.uid === uid) {
          usersByEmail.delete(email);
        }
      }
      accountsByUid.delete(uid);
      return Promise.resolve();
    },
    saveAccount(uid: string, account: Account): Promise<void> {
      accountsByUid.set(uid, account);
      return Promise.resolve();
    },
    findUser(email: string): MemoryUser | null {
      return usersByEmail.get(email) ?? null;
    },
    findAccount(uid: string): Account | null {
      return accountsByUid.get(uid) ?? null;
    },
    userCount(): number {
      return usersByEmail.size;
    },
  };
}

/** Solicitudes de docente en memoria, para las pruebas. Lleva también el rol de cada cuenta (spec F12, regla 4.1). */
export interface MemoryTeacherRequestRepository extends TeacherRequestRepository {
  seed(request: NewTeacherRequest): StoredTeacherRequest;
  all(): StoredTeacherRequest[];
  setAccountRole(uid: string, role: Role): void;
  accountRole(uid: string): Role | null;
  /** Desde ahora, guardar un rol nuevo falla; la decisión no debe quedar a medias. */
  failRoleUpdates(): void;
}

export function createMemoryTeacherRequestRepository(): MemoryTeacherRequestRepository {
  const stored: StoredTeacherRequest[] = [];
  const roles = new Map<string, Role>();
  let nextId = 1;
  let roleUpdatesFail = false;

  function seed(request: NewTeacherRequest): StoredTeacherRequest {
    const saved = { id: `request-${nextId}`, ...request };
    nextId += 1;
    stored.push(saved);
    return saved;
  }

  // Todo es síncrono entre la lectura y la escritura: en memoria esto ya es atómico (F12, regla 3.5).
  function decideNow(requestId: string, decide: (state: DecisionState) => DecisionChange): StoredTeacherRequest {
    const index = stored.findIndex((saved) => saved.id === requestId);
    const request = stored[index] ?? null;
    let accountRole: Role | null = null;
    if (request !== null) {
      accountRole = roles.get(request.uid) ?? null;
    }
    const change = decide({ request, accountRole });
    if (request === null) {
      throw new Error("No hay solicitud que actualizar.");
    }
    if (change.newRole !== null && roleUpdatesFail) {
      throw new Error("Falló guardar el rol.");
    }
    const updated: StoredTeacherRequest = {
      ...request,
      status: change.status,
      decided_at: change.decided_at,
      decided_by_uid: change.decided_by_uid,
      note: change.note,
    };
    stored[index] = updated;
    if (change.newRole !== null) {
      roles.set(request.uid, change.newRole);
    }
    return { ...updated };
  }

  return {
    createIfNonePending(request: NewTeacherRequest): Promise<TeacherRequest | null> {
      const pending = stored.some((saved) => saved.uid === request.uid && saved.status === "PENDIENTE");
      if (pending) {
        return Promise.resolve(null);
      }
      return Promise.resolve(toTeacherRequest(seed(request)));
    },
    latest(uid: string): Promise<MyTeacherRequest | null> {
      return Promise.resolve(latestOf(stored.filter((saved) => saved.uid === uid)));
    },
    listPending(limit: number): Promise<PendingTeacherRequest[]> {
      return Promise.resolve(oldestPending(stored, limit));
    },
    decide(requestId: string, decide: (state: DecisionState) => DecisionChange): Promise<StoredTeacherRequest> {
      try {
        return Promise.resolve(decideNow(requestId, decide));
      } catch (error) {
        return Promise.reject(error);
      }
    },
    seed,
    all(): StoredTeacherRequest[] {
      return stored.map((saved) => ({ ...saved }));
    },
    setAccountRole(uid: string, role: Role): void {
      roles.set(uid, role);
    },
    accountRole(uid: string): Role | null {
      return roles.get(uid) ?? null;
    },
    failRoleUpdates(): void {
      roleUpdatesFail = true;
    },
  };
}

/** Documento `accounts/{uid}` con los campos que guarda F14. */
export type StoredStatusAccount = Account &
  Partial<Omit<DeactivationRecord, "active">> &
  Partial<Omit<ReactivationRecord, "active">>;

/** Estado de cuentas en memoria (spec F14), para las pruebas. */
export interface MemoryAccountStatusRepository extends AccountStatusRepository {
  seed(uid: string, account: Account): void;
  /** El documento guardado, con los campos de F14, o `null`. */
  stored(uid: string): StoredStatusAccount | null;
  /** `true` si el usuario está deshabilitado en Authentication. */
  authDisabled(uid: string): boolean;
  /** Veces que se cerraron las sesiones del usuario. */
  revocations(uid: string): number;
  /** Hace fallar Authentication en los siguientes cambios. */
  failAuth(): void;
}

export function createMemoryAccountStatusRepository(): MemoryAccountStatusRepository {
  const documents = new Map<string, StoredStatusAccount>();
  const disabled = new Set<string>();
  const revoked = new Map<string, number>();
  let authFails = false;

  // Sin `await` antes de `decide`: leer, decidir y guardar ocurre de una vez, como en una transacción.
  function changeStatus(uid: string, decide: (account: Account | null) => StatusRecord): Promise<Account> {
    try {
      const current = documents.get(uid) ?? null;
      const record = decide(current);
      if (current === null) {
        return Promise.reject(new Error("decide aceptó una cuenta inexistente"));
      }
      if (authFails) {
        return Promise.reject(new Error("authentication caído en users.ts:7"));
      }
      const next: StoredStatusAccount = { ...current, ...record };
      documents.set(uid, next);
      if (record.active) {
        disabled.delete(uid);
      } else {
        disabled.add(uid);
        revoked.set(uid, (revoked.get(uid) ?? 0) + 1);
      }
      return Promise.resolve(next);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  return {
    seed(uid: string, account: Account): void {
      documents.set(uid, { ...account });
      if (account.active === false) {
        disabled.add(uid);
      }
    },
    stored: (uid) => documents.get(uid) ?? null,
    authDisabled: (uid) => disabled.has(uid),
    revocations: (uid) => revoked.get(uid) ?? 0,
    failAuth(): void {
      authFails = true;
    },
    findUidByEmail(email: string): Promise<string | null> {
      const found = [...documents.entries()].find(([, account]) => account.email === email);
      if (found === undefined) {
        return Promise.resolve(null);
      }
      return Promise.resolve(found[0]);
    },
    changeStatus,
  };
}
