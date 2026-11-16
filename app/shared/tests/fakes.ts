import type { Account, Role } from "@/shared/schema";
import type { SeedAccountsPort } from "@/shared/server/seed";
import type { AccountRolePort, SessionAuthPort, VerifiedCookie } from "@/shared/server/session";

/** Implementaciones en memoria de los puertos de F0: las pruebas no tocan la red (spec F0, regla 7.1). */

export interface FakeSessionAuth extends SessionAuthPort {
  cookies: Map<string, VerifiedCookie>;
  revoked: string[];
  requestedDurations: number[];
}

export function createFakeSessionAuth(): FakeSessionAuth {
  const cookies = new Map<string, VerifiedCookie>();
  const revoked: string[] = [];
  const requestedDurations: number[] = [];
  return {
    cookies,
    revoked,
    requestedDurations,
    createCookie(idToken: string, durationMs: number): Promise<string> {
      requestedDurations.push(durationMs);
      return Promise.resolve(`cookie-de-${idToken}`);
    },
    verifyCookie(cookie: string): Promise<VerifiedCookie | null> {
      return Promise.resolve(cookies.get(cookie) ?? null);
    },
    revoke(uid: string): Promise<void> {
      revoked.push(uid);
      return Promise.resolve();
    },
  };
}

export interface FakeAccountRoles extends AccountRolePort {
  roles: Map<string, Role>;
}

export function createFakeAccountRoles(): FakeAccountRoles {
  const roles = new Map<string, Role>();
  return {
    roles,
    findRole(uid: string): Promise<Role | null> {
      return Promise.resolve(roles.get(uid) ?? null);
    },
  };
}

export interface FakeSeedAccounts extends SeedAccountsPort {
  users: Map<string, { uid: string; password: string; name: string }>;
  documents: Map<string, Account>;
}

export function createFakeSeedAccounts(): FakeSeedAccounts {
  const users = new Map<string, { uid: string; password: string; name: string }>();
  const documents = new Map<string, Account>();
  return {
    users,
    documents,
    findUidByEmail(email: string): Promise<string | null> {
      return Promise.resolve(users.get(email)?.uid ?? null);
    },
    createUser(email: string, password: string, name: string): Promise<string> {
      const uid = `uid-${users.size + 1}`;
      users.set(email, { uid, password, name });
      return Promise.resolve(uid);
    },
    saveAccount(uid: string, account: Account): Promise<void> {
      documents.set(uid, account);
      return Promise.resolve();
    },
  };
}
