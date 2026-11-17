import "server-only";
import { type DocumentSnapshot, FieldValue, type Transaction } from "firebase-admin/firestore";
import { z } from "zod";
import { type Account, AccountSchema, type Role } from "@/shared/schema";
import { ACCOUNTS_COLLECTION, getAdminAuth, getAdminFirestore, hasAuthErrorCode } from "@/shared/server/firebase-admin";
import {
  type MyTeacherRequest,
  type NewTeacherRequest,
  NewTeacherRequestSchema,
  type PendingTeacherRequest,
  type TeacherRequest,
} from "../schema";
import type {
  AccountDirectory,
  AccountRepository,
  AccountStatusRepository,
  DecisionChange,
  DecisionState,
  PasswordCheck,
  PasswordRepository,
  StatusRecord,
  TeacherRequestRepository,
} from "./repository";
import { latestOf, oldestPending, type StoredTeacherRequest, toTeacherRequest } from "./teacher-requests";

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

  function parse(document: DocumentSnapshot): StoredTeacherRequest {
    return { id: document.id, ...NewTeacherRequestSchema.parse(document.data()) };
  }

  function accountReference(uid: string) {
    return getAdminFirestore().collection(ACCOUNTS_COLLECTION).doc(uid);
  }

  /** Lee la solicitud y el rol de su cuenta dentro de la transacción. Un id con «/» no es un documento: no existe. */
  async function readDecisionState(transaction: Transaction, requestId: string): Promise<DecisionState> {
    if (requestId.includes("/")) {
      return { request: null, accountRole: null };
    }
    const snapshot = await transaction.get(collection().doc(requestId));
    if (!snapshot.exists) {
      return { request: null, accountRole: null };
    }
    const request = parse(snapshot);
    const account = await transaction.get(accountReference(request.uid));
    let accountRole: Role | null = null;
    if (account.exists) {
      accountRole = AccountSchema.parse(account.data()).role;
    }
    return { request, accountRole };
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

    async latest(uid: string): Promise<MyTeacherRequest | null> {
      const found = await byUid(uid).get();
      return latestOf(found.docs.map(parse));
    },

    // Solo se filtra por `status` (índice simple); el orden y el límite se aplican aquí (spec F12, regla 2.1).
    async listPending(limit: number): Promise<PendingTeacherRequest[]> {
      const found = await collection().where("status", "==", "PENDIENTE").get();
      return oldestPending(found.docs.map(parse), limit);
    },

    // La solicitud y el rol cambian en la misma transacción: o las dos cosas o ninguna (spec F12, regla 4.1).
    decide(requestId: string, decide: (state: DecisionState) => DecisionChange): Promise<StoredTeacherRequest> {
      return getAdminFirestore().runTransaction(async (transaction) => {
        const state = await readDecisionState(transaction, requestId);
        const change = decide(state);
        if (state.request === null) {
          throw new Error("No hay solicitud que actualizar.");
        }
        const decision = {
          status: change.status,
          decided_at: change.decided_at,
          decided_by_uid: change.decided_by_uid,
          note: change.note,
        };
        transaction.update(collection().doc(state.request.id), decision);
        if (change.newRole !== null) {
          transaction.update(accountReference(state.request.uid), { role: change.newRole });
        }
        return { ...state.request, ...decision };
      });
    },
  };
}

/** Valores anteriores de los campos que F14 cambia, para deshacer si Authentication falla. */
const PreviousStatusSchema = z.object({
  active: z.boolean().optional(),
  deactivated_at: z.string().optional(),
  deactivated_by_uid: z.string().optional(),
  deactivation_reason: z.string().optional(),
  reactivated_at: z.string().optional(),
  reactivated_by_uid: z.string().optional(),
});

type StatusField = string | boolean | FieldValue;

/** Para cada campo que cambió: su valor anterior, o borrarlo si antes no estaba. */
function undoOf(record: StatusRecord, previous: z.infer<typeof PreviousStatusSchema>): Record<string, StatusField> {
  const before = new Map(Object.entries(previous));
  const undo: Record<string, StatusField> = {};
  for (const key of Object.keys(record)) {
    const value = before.get(key);
    if (value === undefined) {
      undo[key] = FieldValue.delete();
    } else {
      undo[key] = value;
    }
  }
  return undo;
}

/** Desactivar deshabilita el usuario y cierra sus sesiones; reactivar lo habilita (spec F14, reglas 3.1 y 4.1). */
async function applyToAuthentication(uid: string, active: boolean): Promise<void> {
  await getAdminAuth().updateUser(uid, { disabled: !active });
  if (!active) {
    await getAdminAuth().revokeRefreshTokens(uid);
  }
}

/** Estado de las cuentas en `accounts` y en Firebase Authentication (spec F14). */
export function createFirebaseAccountStatusRepository(): AccountStatusRepository {
  function collection() {
    return getAdminFirestore().collection(ACCOUNTS_COLLECTION);
  }

  /** Si Authentication falla, se intenta dejar todo como estaba y se lanza el error original. */
  async function undo(
    uid: string,
    record: StatusRecord,
    previous: z.infer<typeof PreviousStatusSchema>,
  ): Promise<void> {
    try {
      await collection().doc(uid).update(undoOf(record, previous));
      await getAdminAuth().updateUser(uid, { disabled: previous.active === false });
    } catch (undoError) {
      console.error("F14: no se pudo deshacer el cambio de estado", uid, undoError);
    }
  }

  return {
    async findUidByEmail(email: string): Promise<string | null> {
      const found = await collection().where("email", "==", email).limit(1).get();
      const document = found.docs[0];
      if (document === undefined) {
        return null;
      }
      return document.id;
    },

    async changeStatus(uid: string, decide: (account: Account | null) => StatusRecord): Promise<Account> {
      const reference = collection().doc(uid);
      const outcome = await getAdminFirestore().runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) {
          decide(null);
          throw new Error("decide aceptó una cuenta inexistente");
        }
        const current = AccountSchema.parse(snapshot.data());
        const previous = PreviousStatusSchema.parse(snapshot.data());
        const record = decide(current);
        transaction.update(reference, record);
        return { account: { ...current, active: record.active }, record, previous };
      });
      try {
        await applyToAuthentication(uid, outcome.record.active);
      } catch (error) {
        await undo(uid, outcome.record, outcome.previous);
        throw error;
      }
      return outcome.account;
    },
  };
}

const SIGN_IN_URL = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword";

/** Respuesta de Firebase Authentication al comprobar una contraseña. Solo se lee el código de error. */
const PasswordCheckResponseSchema = z.object({
  error: z.object({ message: z.string() }).optional(),
});

/** Códigos de Firebase que significan «contraseña incorrecta» y «demasiados intentos» (spec F15, reglas 2.4 y 2.5). */
const WRONG_PASSWORD_CODES = ["INVALID_PASSWORD", "INVALID_LOGIN_CREDENTIALS", "EMAIL_NOT_FOUND", "USER_DISABLED"];
const BLOCKED_CODE = "TOO_MANY_ATTEMPTS_TRY_LATER";

function checkFromCode(code: string): PasswordCheck {
  if (code.startsWith(BLOCKED_CODE)) {
    return "BLOQUEADA";
  }
  if (WRONG_PASSWORD_CODES.some((wrong) => code.startsWith(wrong))) {
    return "INCORRECTA";
  }
  throw new Error(`Firebase Authentication respondió ${code} al comprobar la contraseña`);
}

/**
 * Contraseñas en Firebase Authentication (spec F15). La actual se comprueba con la API REST de Authentication
 * (la misma clave pública del navegador); el cambio y el cierre de sesiones, con el SDK de administración.
 */
export function createFirebasePasswordRepository(apiKey: string): PasswordRepository {
  return {
    async checkPassword(email: string, password: string): Promise<PasswordCheck> {
      const response = await fetch(`${SIGN_IN_URL}?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: false }),
      });
      const body = PasswordCheckResponseSchema.parse(await response.json());
      if (response.ok) {
        return "CORRECTA";
      }
      return checkFromCode(body.error?.message ?? `HTTP_${response.status}`);
    },

    async changePassword(uid: string, newPassword: string): Promise<void> {
      await getAdminAuth().updateUser(uid, { password: newPassword });
      await getAdminAuth().revokeRefreshTokens(uid);
    },
  };
}
