import type { Account } from "@/shared/schema";

/** Datos de ejemplo (spec F0, regla 6). Lógica pura: Firebase entra por el puerto. */

export const SEED_PASSWORD_MIN_LENGTH = 8;

export const SEED_ACCOUNTS: Account[] = [
  { email: "externo@biblioteca.test", name: "Externo de Ejemplo", role: "EXTERNO" },
  { email: "estudiante@biblioteca.test", name: "Estudiante de Ejemplo", role: "ESTUDIANTE" },
  { email: "docente@biblioteca.test", name: "Docente de Ejemplo", role: "DOCENTE" },
  { email: "bibliotecario@biblioteca.test", name: "Bibliotecario de Ejemplo", role: "BIBLIOTECARIO" },
  { email: "admin@biblioteca.test", name: "Administrador de Ejemplo", role: "ADMINISTRADOR" },
];

export interface SeedAccountsPort {
  findUidByEmail(email: string): Promise<string | null>;
  /** Crea el usuario en Authentication y devuelve su uid. */
  createUser(email: string, password: string, name: string): Promise<string>;
  /** Escribe (o reemplaza) el documento `accounts/{uid}`. */
  saveAccount(uid: string, account: Account): Promise<void>;
}

export interface SeedInput {
  accounts: SeedAccountsPort;
  password: string | undefined;
}

export interface SeedResult {
  ok: boolean;
  lines: string[];
}

async function seedAccount(port: SeedAccountsPort, account: Account, password: string): Promise<string> {
  let uid = await port.findUidByEmail(account.email);
  let outcome = "ya existía";
  if (uid === null) {
    uid = await port.createUser(account.email, password, account.name);
    outcome = "creada";
  }
  await port.saveAccount(uid, account);
  return `${account.role.padEnd(14)} ${account.email.padEnd(32)} ${outcome}`;
}

export async function runSeed(input: SeedInput): Promise<SeedResult> {
  const password = input.password;
  if (password === undefined || password.length < SEED_PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      lines: [`Falta SEED_PASSWORD o tiene menos de ${SEED_PASSWORD_MIN_LENGTH} caracteres. No se creó nada.`],
    };
  }
  const lines: string[] = [];
  for (const account of SEED_ACCOUNTS) {
    lines.push(await seedAccount(input.accounts, account, password));
  }
  return { ok: true, lines };
}
