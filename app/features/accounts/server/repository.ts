import type { Account } from "@/shared/schema";
import type { NewTeacherRequest, TeacherRequest } from "../schema";

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
  latest(uid: string): Promise<TeacherRequest | null>;
}
