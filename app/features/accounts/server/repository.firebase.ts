import "server-only";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { type Account, AccountSchema } from "@/shared/schema";
import { ACCOUNTS_COLLECTION, getAdminAuth, getAdminFirestore, hasAuthErrorCode } from "@/shared/server/firebase-admin";
import { type NewTeacherRequest, NewTeacherRequestSchema, type TeacherRequest } from "../schema";
import type { AccountDirectory, AccountRepository, TeacherRequestRepository } from "./repository";
import { latestOf, type StoredTeacherRequest, toTeacherRequest } from "./teacher-requests";

const TEACHER_REQUESTS_COLLECTION = "teacher_requests";

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

/** Lectura de `accounts/{uid}` en Firestore. */
export function createFirestoreAccountDirectory(): AccountDirectory {
  return {
    async findAccount(uid: string): Promise<Account | null> {
      const snapshot = await getAdminFirestore().collection(ACCOUNTS_COLLECTION).doc(uid).get();
      if (!snapshot.exists) {
        return null;
      }
      return AccountSchema.parse(snapshot.data());
    },
  };
}

/** Solicitudes de docente en la colección `teacher_requests` (spec F11). */
export function createFirestoreTeacherRequestRepository(): TeacherRequestRepository {
  function collection() {
    return getAdminFirestore().collection(TEACHER_REQUESTS_COLLECTION);
  }

  // Solo se filtra por `uid` (índice simple): el estado y el orden se resuelven aquí, sin índice compuesto.
  function byUid(uid: string) {
    return collection().where("uid", "==", uid);
  }

  function parse(document: QueryDocumentSnapshot): StoredTeacherRequest {
    return { id: document.id, ...NewTeacherRequestSchema.parse(document.data()) };
  }

  return {
    // Transacción como en F1: dos envíos simultáneos de la misma persona → uno se crea y el otro ve la pendiente (regla 3.3).
    createIfNonePending(request: NewTeacherRequest): Promise<TeacherRequest | null> {
      return getAdminFirestore().runTransaction(async (transaction) => {
        const existing = await transaction.get(byUid(request.uid));
        const pending = existing.docs.some((document) => parse(document).status === "PENDIENTE");
        if (pending) {
          return null;
        }
        const reference = collection().doc();
        const saved = NewTeacherRequestSchema.parse(request);
        transaction.create(reference, saved);
        return toTeacherRequest({ id: reference.id, ...saved });
      });
    },

    async latest(uid: string): Promise<TeacherRequest | null> {
      const found = await byUid(uid).get();
      return latestOf(found.docs.map(parse));
    },
  };
}
