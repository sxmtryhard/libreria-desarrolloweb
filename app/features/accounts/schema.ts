import { z } from "zod";
import { RoleSchema, SessionSchema } from "@/shared/schema";

/** Contrato de cuentas (F3, F4 y F10). Solo el orquestador lo cambia. Claves del cable en snake_case. */

export const NAME_MAX_LENGTH = 120;
export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Roles que se pueden asignar al registrar en el mostrador (spec F3, regla 4). */
export const DESK_ROLES = ["EXTERNO", "ESTUDIANTE", "DOCENTE"] as const;
export const DeskRoleSchema = z.enum(DESK_ROLES);
export type DeskRole = z.infer<typeof DeskRoleSchema>;

/** Cuerpo de `POST /api/accounts` (spec F3, reglas 1–5). Los campos extra se ignoran. */
export const RegisterAccountInputSchema = z.object({
  name: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  email: z.string().trim().toLowerCase().max(EMAIL_MAX_LENGTH).pipe(z.email()),
  role: DeskRoleSchema,
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
});
export type RegisterAccountInput = z.infer<typeof RegisterAccountInputSchema>;

/** Cuerpo de `POST /api/accounts/register` (spec F10, regla 1). No lleva rol: siempre queda `EXTERNO`. */
export const SelfRegisterInputSchema = z.object({
  name: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  email: z.string().trim().toLowerCase().max(EMAIL_MAX_LENGTH).pipe(z.email()),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
});
export type SelfRegisterInput = z.infer<typeof SelfRegisterInputSchema>;

/** Cuenta creada, tal como se devuelve. Nunca incluye la contraseña (regla 6). */
export const RegisteredAccountSchema = z.object({
  uid: z.string().min(1),
  email: z.email(),
  name: z.string().min(1).max(NAME_MAX_LENGTH),
  role: RoleSchema,
});
export type RegisteredAccount = z.infer<typeof RegisteredAccountSchema>;

export const ID_TOKEN_MAX_LENGTH = 4096;

/** Cuerpo de `POST /api/session` (spec F4, reglas 1.3 y 2.1). La contraseña nunca viaja al servidor de la app. */
export const SignInInputSchema = z.object({
  id_token: z.string().min(1).max(ID_TOKEN_MAX_LENGTH),
});
export type SignInInput = z.infer<typeof SignInInputSchema>;

/** Respuesta de `POST /api/session` (spec F4, regla 1.4). */
export const SignedInSchema = SessionSchema;
export type SignedIn = z.infer<typeof SignedInSchema>;
