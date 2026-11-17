import { z } from "zod";
import { RoleSchema, SessionSchema } from "@/shared/schema";

/** Contrato de cuentas (F3, F4, F10, F11 y F12). Solo el orquestador lo cambia. Claves del cable en snake_case. */

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

/** Cuerpo de `POST /api/accounts/staff` (spec F13, regla 2): mismos datos y reglas que F3; el rol nunca sale del cuerpo. */
export const StaffAccountInputSchema = SelfRegisterInputSchema;
export type StaffAccountInput = z.infer<typeof StaffAccountInputSchema>;

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

/** Roles que pueden pedir el rol de docente (spec F11, regla 1.1). */
export const TEACHER_REQUESTER_ROLES = ["EXTERNO", "ESTUDIANTE"] as const;
export const TeacherRequesterRoleSchema = z.enum(TEACHER_REQUESTER_ROLES);

export const REASON_MIN_LENGTH = 10;
export const REASON_MAX_LENGTH = 500;

/** Estados de una solicitud de docente (spec F11, regla 2.3). F11 solo crea `PENDIENTE`. */
export const TEACHER_REQUEST_STATUSES = ["PENDIENTE", "APROBADA", "RECHAZADA"] as const;
export const TeacherRequestStatusSchema = z.enum(TEACHER_REQUEST_STATUSES);
export type TeacherRequestStatus = z.infer<typeof TeacherRequestStatusSchema>;

/** Cuerpo de `POST /api/teacher-requests` (spec F11, regla 2.1). Quién pide sale de la sesión. */
export const TeacherRequestInputSchema = z.object({
  reason: z.string().trim().min(REASON_MIN_LENGTH).max(REASON_MAX_LENGTH),
});
export type TeacherRequestInput = z.infer<typeof TeacherRequestInputSchema>;

/** Documento de `teacher_requests` (spec F11, regla 2.2). F12 añade la decisión; F11 no la escribe. */
export const NewTeacherRequestSchema = z.object({
  uid: z.string().min(1),
  email: z.email(),
  name: z.string().min(1),
  reason: z.string().min(1),
  status: TeacherRequestStatusSchema,
  requested_at: z.iso.datetime(),
  decided_at: z.iso.datetime().nullable().optional(),
  decided_by_uid: z.string().min(1).nullable().optional(),
  note: z.string().min(1).nullable().optional(),
});
export type NewTeacherRequest = z.infer<typeof NewTeacherRequestSchema>;

/** Respuesta de `POST /api/teacher-requests` y lo que la pantalla muestra (spec F11, regla 4.3). */
export const TeacherRequestSchema = z.object({
  id: z.string().min(1),
  reason: z.string().min(1),
  status: TeacherRequestStatusSchema,
  requested_at: z.iso.datetime(),
});
export type TeacherRequest = z.infer<typeof TeacherRequestSchema>;

/** La última solicitud, tal como la ve quien la pidió: con la nota del personal si la hay (spec F12, regla 5.3). */
export const MyTeacherRequestSchema = TeacherRequestSchema.extend({ note: z.string().min(1).nullable() });
export type MyTeacherRequest = z.infer<typeof MyTeacherRequestSchema>;

export const PENDING_LIST_LIMIT = 100;
export const NOTE_MAX_LENGTH = 500;
export const REQUEST_ID_MAX_LENGTH = 128;

/** Una solicitud pendiente, vista por el personal (spec F12, regla 2.2). */
export const PendingTeacherRequestSchema = z.object({
  id: z.string().min(1),
  uid: z.string().min(1),
  email: z.email(),
  name: z.string().min(1),
  reason: z.string().min(1),
  requested_at: z.iso.datetime(),
});
export type PendingTeacherRequest = z.infer<typeof PendingTeacherRequestSchema>;

/** Respuesta de `GET /api/teacher-requests/pending` (spec F12, regla 2). */
export const PendingTeacherRequestsResponseSchema = z.object({
  requests: z.array(PendingTeacherRequestSchema),
});
export type PendingTeacherRequestsResponse = z.infer<typeof PendingTeacherRequestsResponseSchema>;

/** Decisiones posibles (spec F12, regla 3.1). */
export const TEACHER_REQUEST_DECISIONS = ["APROBADA", "RECHAZADA"] as const;
export const TeacherRequestDecisionSchema = z.enum(TEACHER_REQUEST_DECISIONS);
export type TeacherRequestDecision = z.infer<typeof TeacherRequestDecisionSchema>;

/** Cuerpo de `POST /api/teacher-requests/decision` (spec F12, reglas 3.1 y 5.2). */
export const DecideTeacherRequestInputSchema = z.object({
  request_id: z.string().trim().min(1).max(REQUEST_ID_MAX_LENGTH),
  decision: TeacherRequestDecisionSchema,
  note: z.string().trim().max(NOTE_MAX_LENGTH).optional(),
});
export type DecideTeacherRequestInput = z.infer<typeof DecideTeacherRequestInputSchema>;

/** Respuesta de la decisión (spec F12, regla 6.1). */
export const DecidedTeacherRequestSchema = z.object({
  id: z.string().min(1),
  status: TeacherRequestDecisionSchema,
  decided_at: z.iso.datetime(),
  note: z.string().min(1).nullable(),
});
export type DecidedTeacherRequest = z.infer<typeof DecidedTeacherRequestSchema>;

/** Correo de la cuenta a desactivar o reactivar (spec F14, regla 2.1). */
const AccountEmailSchema = z.string().trim().toLowerCase().max(EMAIL_MAX_LENGTH).pipe(z.email());

/** Cuerpo de `POST /api/accounts/deactivate` (spec F14, regla 2). */
export const DeactivateAccountInputSchema = z.object({
  email: AccountEmailSchema,
  reason: z.string().trim().min(REASON_MIN_LENGTH).max(REASON_MAX_LENGTH),
});
export type DeactivateAccountInput = z.infer<typeof DeactivateAccountInputSchema>;

/** Cuerpo de `POST /api/accounts/reactivate` (spec F14, regla 2). Un `reason` se ignora. */
export const ReactivateAccountInputSchema = z.object({ email: AccountEmailSchema });
export type ReactivateAccountInput = z.infer<typeof ReactivateAccountInputSchema>;

/** Respuesta de las dos rutas de F14. */
export const AccountStatusSchema = z.object({
  uid: z.string().min(1),
  email: z.email(),
  name: z.string().min(1),
  role: RoleSchema,
  active: z.boolean(),
});
export type AccountStatus = z.infer<typeof AccountStatusSchema>;

/** Lo que F14 guarda en `accounts/{uid}` al desactivar (regla 3.2). */
export const DeactivationRecordSchema = z.object({
  active: z.literal(false),
  deactivated_at: z.iso.datetime(),
  deactivated_by_uid: z.string().min(1),
  deactivation_reason: z.string().min(REASON_MIN_LENGTH).max(REASON_MAX_LENGTH),
});
export type DeactivationRecord = z.infer<typeof DeactivationRecordSchema>;

/** Lo que F14 guarda en `accounts/{uid}` al reactivar (regla 4.2). El motivo anterior se conserva. */
export const ReactivationRecordSchema = z.object({
  active: z.literal(true),
  reactivated_at: z.iso.datetime(),
  reactivated_by_uid: z.string().min(1),
});
export type ReactivationRecord = z.infer<typeof ReactivationRecordSchema>;

/** Cuerpo de `POST /api/accounts/password` (spec F15, regla 2). Ninguna contraseña se recorta. */
export const ChangePasswordInputSchema = z.object({
  current_password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  new_password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordInputSchema>;
