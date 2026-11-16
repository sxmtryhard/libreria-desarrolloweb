import type { Account } from "@/shared/schema";
import type { NewTeacherRequest, TeacherRequest } from "../schema";
import type { AccountRepository, TeacherRequestRepository } from "./repository";
import { latestOf, type StoredTeacherRequest, toTeacherRequest } from "./teacher-requests";

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

/** Solicitudes de docente en memoria, para las pruebas. Añade `seed` y `all`. */
export interface MemoryTeacherRequestRepository extends TeacherRequestRepository {
  seed(request: NewTeacherRequest): StoredTeacherRequest;
  all(): StoredTeacherRequest[];
}

export function createMemoryTeacherRequestRepository(): MemoryTeacherRequestRepository {
  const stored: StoredTeacherRequest[] = [];
  let nextId = 1;

  function seed(request: NewTeacherRequest): StoredTeacherRequest {
    const saved = { id: `request-${nextId}`, ...request };
    nextId += 1;
    stored.push(saved);
    return saved;
  }

  return {
    // Sin `await` entre la consulta y el alta: en memoria esto ya es atómico (regla 3.3).
    createIfNonePending(request: NewTeacherRequest): Promise<TeacherRequest | null> {
      const pending = stored.some((saved) => saved.uid === request.uid && saved.status === "PENDIENTE");
      if (pending) {
        return Promise.resolve(null);
      }
      return Promise.resolve(toTeacherRequest(seed(request)));
    },
    latest(uid: string): Promise<TeacherRequest | null> {
      return Promise.resolve(latestOf(stored.filter((saved) => saved.uid === uid)));
    },
    seed,
    all(): StoredTeacherRequest[] {
      return stored.map((saved) => ({ ...saved }));
    },
  };
}
