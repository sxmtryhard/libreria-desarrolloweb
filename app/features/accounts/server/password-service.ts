import type { Session } from "@/shared/schema";
import { ConflictError, ValidationError } from "@/shared/server/errors";
import type { ChangePasswordInput } from "../schema";
import type { PasswordRepository } from "./repository";

export interface PasswordServiceDeps {
  passwords: PasswordRepository;
}

export interface PasswordService {
  /** Cambia la contraseña de la cuenta de la sesión y cierra todas sus sesiones (spec F15). */
  changePassword(session: Session, input: ChangePasswordInput): Promise<void>;
}

export function createPasswordService(deps: PasswordServiceDeps): PasswordService {
  /** Orden de la regla 1.3 tras el cuerpo: nueva distinta → actual correcta → cambio. */
  async function changePassword(session: Session, input: ChangePasswordInput): Promise<void> {
    if (input.new_password === input.current_password) {
      throw new ValidationError("La contraseña nueva debe ser distinta de la actual.");
    }
    const check = await deps.passwords.checkPassword(session.email, input.current_password);
    if (check === "BLOQUEADA") {
      throw new ConflictError("Demasiados intentos. Espera unos minutos.");
    }
    if (check === "INCORRECTA") {
      throw new ValidationError("La contraseña actual no es correcta.");
    }
    await deps.passwords.changePassword(session.uid, input.new_password);
  }

  return { changePassword };
}
