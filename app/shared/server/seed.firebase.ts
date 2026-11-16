import "server-only";
import type { Account } from "@/shared/schema";
import { ACCOUNTS_COLLECTION, getAdminAuth, getAdminFirestore, hasAuthErrorCode } from "./firebase-admin";
import type { SeedAccountsPort } from "./seed";

/** Puerto real del seed: Firebase Authentication y la colección `accounts` (spec F0, regla 6.2). */
export const firebaseSeedAccounts: SeedAccountsPort = {
  async findUidByEmail(email: string): Promise<string | null> {
    const auth = getAdminAuth();
    try {
      const user = await auth.getUserByEmail(email);
      return user.uid;
    } catch (error) {
      if (hasAuthErrorCode(error, "auth/user-not-found")) {
        return null;
      }
      throw error;
    }
  },

  async createUser(email: string, password: string, name: string): Promise<string> {
    const user = await getAdminAuth().createUser({ email, password, displayName: name });
    return user.uid;
  },

  async saveAccount(uid: string, account: Account): Promise<void> {
    await getAdminFirestore().collection(ACCOUNTS_COLLECTION).doc(uid).set(account);
  },
};
