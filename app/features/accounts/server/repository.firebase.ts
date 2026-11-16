import "server-only";
import { type Account, AccountSchema } from "@/shared/schema";
import { ACCOUNTS_COLLECTION, getAdminAuth, getAdminFirestore, hasAuthErrorCode } from "@/shared/server/firebase-admin";
import type { AccountRepository } from "./repository";

/** Cuentas en Firebase Authentication y en la colección `accounts` (ADR-0003). */
export function createFirebaseAccountRepository(): AccountRepository {
  return {
    async createUser(email: string, password: string, name: string): Promise<string | null> {
      try {
        const user = await getAdminAuth().createUser({ email, password, displayName: name });
        return user.uid;
      } catch (error) {
        if (hasAuthErrorCode(error, "auth/email-already-exists")) {
          return null;
        }
        throw error;
      }
    },

    async deleteUser(uid: string): Promise<void> {
      await getAdminAuth().deleteUser(uid);
    },

    async saveAccount(uid: string, account: Account): Promise<void> {
      await getAdminFirestore().collection(ACCOUNTS_COLLECTION).doc(uid).set(AccountSchema.parse(account));
    },
  };
}
