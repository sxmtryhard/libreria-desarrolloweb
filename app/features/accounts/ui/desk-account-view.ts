import {
  DESK_ROLES,
  type DeskRole,
  DeskRoleSchema,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  type RegisteredAccount,
} from "../schema";
import { ROLE_LABELS } from "./role-labels";

/** Textos y revisiones del formulario de cuenta del mostrador (spec F36, regla 3). Lógica pura. */

export const DESK_ACCOUNT_MESSAGES = {
  missingName: "Escribe el nombre.",
  missingEmail: "Escribe el correo.",
  missingRole: "Elige el rol.",
  passwordLength: "La contraseña debe tener entre 8 y 128 caracteres.",
  passwordMismatch: "Las contraseñas no coinciden.",
} as const;

/** Opciones de «Rol» (regla 3.1), en el orden de F3. */
export const DESK_ACCOUNT_ROLE_OPTIONS: readonly { value: DeskRole; label: string }[] = DESK_ROLES.map((role) => ({
  value: role,
  label: ROLE_LABELS[role],
}));

export interface DeskAccountForm {
  name: string;
  email: string;
  /** `""` mientras no se elige. */
  role: string;
  password: string;
  repeat: string;
}

/** El primer problema del formulario, o `null` si no hay (regla 3.2). */
export function deskAccountProblem(form: DeskAccountForm): string | null {
  if (form.name.trim().length === 0) {
    return DESK_ACCOUNT_MESSAGES.missingName;
  }
  if (form.email.trim().length === 0) {
    return DESK_ACCOUNT_MESSAGES.missingEmail;
  }
  if (!DeskRoleSchema.safeParse(form.role).success) {
    return DESK_ACCOUNT_MESSAGES.missingRole;
  }
  if (form.password.length < PASSWORD_MIN_LENGTH || form.password.length > PASSWORD_MAX_LENGTH) {
    return DESK_ACCOUNT_MESSAGES.passwordLength;
  }
  if (form.password !== form.repeat) {
    return DESK_ACCOUNT_MESSAGES.passwordMismatch;
  }
  return null;
}

/** Cuerpo de `POST /api/accounts`, sin la repetición (regla 3.3). */
export function toRegisterAccountBody(form: DeskAccountForm) {
  return { name: form.name, email: form.email, role: form.role, password: form.password };
}

/** «Cuenta creada: <nombre> (<correo>) · <Rol>.» (regla 3.4). */
export function deskAccountSuccessMessage(account: RegisteredAccount): string {
  return `Cuenta creada: ${account.name} (${account.email}) · ${ROLE_LABELS[account.role]}.`;
}
