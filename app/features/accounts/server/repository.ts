import type { Account } from "@/shared/schema";

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
