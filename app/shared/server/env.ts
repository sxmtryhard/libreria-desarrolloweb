import { z } from "zod";

/** Validación del entorno (spec F0, regla 5). Nunca imprime ni devuelve valores en mensajes. */

export type EnvSource = Record<string, string | undefined>;
export type EnvStatus = "OK" | "FALTA" | "INVALIDA";

export interface EnvEntry {
  name: string;
  status: EnvStatus;
}

const BEGIN_MARK = "BEGIN PRIVATE KEY";

/** Quita las comillas dobles envolventes y convierte los `\n` literales en saltos de línea (ADR-0007). */
export function normalizePrivateKey(raw: string): string {
  let key = raw;
  const trimmed = raw.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    key = trimmed.slice(1, -1);
  }
  return key.replaceAll("\\n", "\n");
}

const NonEmpty = z.string().min(1);
const PrivateKey = z.string().refine((value) => normalizePrivateKey(value).includes(BEGIN_MARK));

const ENV_RULES: [string, z.ZodType<string>][] = [
  ["FIREBASE_PROJECT_ID", NonEmpty],
  ["FIREBASE_CLIENT_EMAIL", z.email()],
  ["FIREBASE_PRIVATE_KEY", PrivateKey],
  ["NEXT_PUBLIC_FIREBASE_API_KEY", NonEmpty],
  ["NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", NonEmpty],
  ["NEXT_PUBLIC_FIREBASE_PROJECT_ID", NonEmpty],
  ["NEXT_PUBLIC_FIREBASE_APP_ID", NonEmpty],
];

function statusOf(value: string | undefined, rule: z.ZodType<string>): EnvStatus {
  if (value === undefined || value.trim().length === 0) {
    return "FALTA";
  }
  if (!rule.safeParse(value.trim()).success) {
    return "INVALIDA";
  }
  return "OK";
}

/** Estado de cada variable obligatoria, en el orden de `.env.example`. */
export function checkEnv(source: EnvSource): EnvEntry[] {
  return ENV_RULES.map(([name, rule]) => ({ name, status: statusOf(source[name], rule) }));
}

export function isEnvValid(report: EnvEntry[]): boolean {
  return report.every((entry) => entry.status === "OK");
}

/** Una línea por variable: nombre y estado, nunca el valor. */
export function formatEnvReport(report: EnvEntry[]): string[] {
  return report.map((entry) => `${entry.name.padEnd(34)} ${entry.status}`);
}

export interface ServerEnv {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

/** Credenciales del servidor. Falla nombrando las variables con problema, sin mostrar valores (regla 5.5). */
export function readServerEnv(source: EnvSource): ServerEnv {
  const problems = checkEnv(source).filter((entry) => entry.status !== "OK");
  if (problems.length > 0) {
    const detail = problems.map((entry) => `${entry.name} (${entry.status})`).join(", ");
    throw new Error(`Entorno inválido: ${detail}. Ejecuta \`npm run check:env\`.`);
  }
  return {
    projectId: (source.FIREBASE_PROJECT_ID ?? "").trim(),
    clientEmail: (source.FIREBASE_CLIENT_EMAIL ?? "").trim(),
    privateKey: normalizePrivateKey(source.FIREBASE_PRIVATE_KEY ?? ""),
  };
}
