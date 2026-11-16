import type { Account } from "@/shared/schema";
import type { AccountRepository } from "./repository";

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
