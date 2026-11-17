import type { Account, Role } from "@/shared/schema";
import type {
  DeactivationRecord,
  MyTeacherRequest,
  NewTeacherRequest,
  PendingTeacherRequest,
  ReactivationRecord,
  TeacherRequest,
  TeacherRequestDecision,
} from "../schema";
import type { StoredTeacherRequest } from "./teacher-requests";

/** Puerto de persistencia de cuentas. Solo guarda y consulta; las reglas viven en el servicio. */
export interface AccountRepository {
  /**
   * Crea el usuario en Authentication solo si el correo no existe, de forma atómica (spec F3, regla 7).
   * Devuelve su `uid`, o `null` si el correo ya tenía cuenta.
   */
  createUser(email: string, password: string, name: string): Promise<string | null>;
  /** Elimina un usuario de Authentication. Se usa para deshacer un registro a medias (regla 8). */
  deleteUser(uid: string): Promise<void>;
  /** Escribe el documento `accounts/{uid}`. */
  saveAccount(uid: string, account: Account): Promise<void>;
}

/** Lectura de `accounts/{uid}` (spec F11, regla 2.2: el nombre de quien pide). */
export interface AccountDirectory {
  findAccount(uid: string): Promise<Account | null>;
}

/** Puerto de `teacher_requests` (spec F11). */
export interface TeacherRequestRepository {
  /**
   * Guarda la solicitud solo si la persona no tiene otra `PENDIENTE`, de forma atómica (regla 3).
   * Devuelve la solicitud creada, o `null` si ya tenía una pendiente.
   */
  createIfNonePending(request: NewTeacherRequest): Promise<TeacherRequest | null>;
  /** La solicitud más reciente de la persona, o `null` si nunca pidió (regla 5.4). */
  latest(uid: string): Promise<MyTeacherRequest | null>;
  /** Las pendientes de todas las personas, la más antigua primero, como máximo `limit` (spec F12, regla 2.1). */
  listPending(limit: number): Promise<PendingTeacherRequest[]>;
  /**
   * Decide dentro de una transacción (spec F12, reglas 3.5 y 4.1): lee la solicitud y el rol de su cuenta,
   * `decide` aplica las reglas (y lanza si no se puede) y se guardan la decisión y, si hay, el rol nuevo.
   */
  decide(requestId: string, decide: (state: DecisionState) => DecisionChange): Promise<StoredTeacherRequest>;
}

/** Lo que se lee antes de decidir. `accountRole` es `null` si la cuenta no existe o no hay solicitud. */
export interface DecisionState {
  request: StoredTeacherRequest | null;
  accountRole: Role | null;
}

/** Lo que se guarda al decidir. `newRole` es el rol nuevo de la cuenta, o `null` si no cambia. */
export interface DecisionChange {
  status: TeacherRequestDecision;
  decided_at: string;
  decided_by_uid: string;
  note: string | null;
  newRole: Role | null;
}

/** Lo que F14 escribe en `accounts/{uid}` al cambiar el estado. */
export type StatusRecord = DeactivationRecord | ReactivationRecord;

/** Puerto del estado de una cuenta (spec F14). */
export interface AccountStatusRepository {
  /** El `uid` de la cuenta con ese correo ya normalizado, o `null` si no hay. */
  findUidByEmail(email: string): Promise<string | null>;
  /**
   * Cambia el estado dentro de una transacción (regla 5.2): lee `accounts/{uid}` (`null` si no existe),
   * `decide` aplica las reglas (y lanza si no se puede) y se guarda lo que devuelve. Después se refleja en
   * Authentication: desactivar deshabilita el usuario y cierra sus sesiones; reactivar lo habilita.
   * Si Authentication falla, se deshace el cambio del documento y se lanza el error. Devuelve la cuenta nueva.
   */
  changeStatus(uid: string, decide: (account: Account | null) => StatusRecord): Promise<Account>;
}
