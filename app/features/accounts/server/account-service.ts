import type { Account, Role, Session } from "@/shared/schema";
import { ConflictError } from "@/shared/server/errors";
import { requireRole } from "@/shared/server/session";
import type { RegisterAccountInput, RegisteredAccount, SelfRegisterInput } from "../schema";
import type { AccountRepository } from "./repository";

/** Roles que pueden registrar cuentas en el mostrador (spec F3, Autorización). */
const REGISTER_ROLES: readonly Role[] = ["BIBLIOTECARIO", "ADMINISTRADOR"];

/** Rol con el que queda quien se registra por su cuenta (spec F10, regla 2.1). */
const SELF_REGISTER_ROLE: Role = "EXTERNO";

export interface AccountServiceDeps {
  accounts: AccountRepository;
}

export interface AccountService {
  /** Lanza `ForbiddenError` si la sesión no puede registrar cuentas. La ruta la llama antes de leer el cuerpo. */
  assertCanRegister(session: Session): void;
  register(session: Session, input: RegisterAccountInput): Promise<RegisteredAccount>;
  /** Autorregistro público: la cuenta queda siempre como `EXTERNO` (spec F10). */
  selfRegister(input: SelfRegisterInput): Promise<RegisteredAccount>;
}

export function createAccountService(deps: AccountServiceDeps): AccountService {
  function assertCanRegister(session: Session): void {
    requireRole(session, REGISTER_ROLES);
  }

  /** Guarda el documento; si falla, elimina el usuario recién creado para no dejar una cuenta a medias (F3 regla 8). */
  async function saveOrUndo(uid: string, account: Account): Promise<void> {
    try {
      await deps.accounts.saveAccount(uid, account);
    } catch (error) {
      await deps.accounts.deleteUser(uid);
      throw error;
    }
  }

  /** Crea el usuario de Authentication y su documento. La contraseña solo viaja hacia Authentication. */
  async function create(account: Account, password: string): Promise<RegisteredAccount> {
    const uid = await deps.accounts.createUser(account.email, password, account.name);
    if (uid === null) {
      throw new ConflictError("Ya existe una cuenta con ese correo.");
    }
    await saveOrUndo(uid, account);
    return { uid, email: account.email, name: account.name, role: account.role };
  }

  // `async` a propósito: un rol sin permiso debe rechazar la promesa, no lanzar de forma síncrona.
  async function register(session: Session, input: RegisterAccountInput): Promise<RegisteredAccount> {
    assertCanRegister(session);
    return create({ email: input.email, name: input.name, role: input.role }, input.password);
  }

  function selfRegister(input: SelfRegisterInput): Promise<RegisteredAccount> {
    return create({ email: input.email, name: input.name, role: SELF_REGISTER_ROLE }, input.password);
  }

  return { assertCanRegister, register, selfRegister };
}
