import type { Role, Session } from "@/shared/schema";
import { ConflictError } from "@/shared/server/errors";
import { requireRole } from "@/shared/server/session";
import type { RegisterAccountInput, RegisteredAccount } from "../schema";
import type { AccountRepository } from "./repository";

/** Roles que pueden registrar cuentas en el mostrador (spec F3, Autorización). */
const REGISTER_ROLES: readonly Role[] = ["BIBLIOTECARIO", "ADMINISTRADOR"];

export interface AccountServiceDeps {
  accounts: AccountRepository;
}

export interface AccountService {
  /** Lanza `ForbiddenError` si la sesión no puede registrar cuentas. La ruta la llama antes de leer el cuerpo. */
  assertCanRegister(session: Session): void;
  register(session: Session, input: RegisterAccountInput): Promise<RegisteredAccount>;
}

export function createAccountService(deps: AccountServiceDeps): AccountService {
  function assertCanRegister(session: Session): void {
    requireRole(session, REGISTER_ROLES);
  }

  /** Guarda el documento; si falla, elimina el usuario recién creado para no dejar una cuenta a medias (regla 8). */
  async function saveOrUndo(uid: string, input: RegisterAccountInput): Promise<void> {
    try {
      await deps.accounts.saveAccount(uid, { email: input.email, name: input.name, role: input.role });
    } catch (error) {
      await deps.accounts.deleteUser(uid);
      throw error;
    }
  }

  async function register(session: Session, input: RegisterAccountInput): Promise<RegisteredAccount> {
    assertCanRegister(session);
    const uid = await deps.accounts.createUser(input.email, input.password, input.name);
    if (uid === null) {
      throw new ConflictError("Ya existe una cuenta con ese correo.");
    }
    await saveOrUndo(uid, input);
    return { uid, email: input.email, name: input.name, role: input.role };
  }

  return { assertCanRegister, register };
}
