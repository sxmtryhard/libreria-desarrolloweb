import { z } from "zod";

/** Contrato común (F0). Solo el orquestador lo cambia. Todas las claves del cable van en snake_case. */

export const ROLES = ["EXTERNO", "ESTUDIANTE", "DOCENTE", "BIBLIOTECARIO", "ADMINISTRADOR"] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;

/** Sesión verificada en el servidor (spec F0, regla 3.4). */
export const SessionSchema = z.object({
  uid: z.string().min(1),
  email: z.email(),
  role: RoleSchema,
});
export type Session = z.infer<typeof SessionSchema>;

/** Documento `accounts/{uid}` de Firestore (spec F0, regla 6.2). */
export const AccountSchema = z.object({
  email: z.email(),
  name: z.string().min(1),
  role: RoleSchema,
  /** `false` si el personal la desactivó (spec F14). Sin el campo, la cuenta está activa. */
  active: z.boolean().optional(),
});
export type Account = z.infer<typeof AccountSchema>;

/** Una cuenta está activa salvo que tenga `active: false` (spec F14, regla 3). */
export function isAccountActive(account: Account): boolean {
  return account.active !== false;
}

export const ERROR_CODES = [
  "VALIDACION",
  "NO_AUTENTICADO",
  "NO_AUTORIZADO",
  "NO_ENCONTRADO",
  "CONFLICTO",
  "ERROR_INTERNO",
] as const;
export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ErrorFieldSchema = z.object({
  path: z.string(),
  message: z.string(),
});
export type ErrorField = z.infer<typeof ErrorFieldSchema>;

/** Forma única de toda respuesta de error de la API (spec F0, reglas 1.2 y 1.4). */
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    fields: z.array(ErrorFieldSchema).optional(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
