import { describe, expect, it } from "vitest";
import { ROLES } from "@/shared/schema";
import { runSeed } from "@/shared/server/seed";
import { createFakeSeedAccounts } from "./fakes";

const PASSWORD = "12345678";

function count(lines: string[], text: string): number {
  return lines.filter((line) => line.includes(text)).length;
}

describe("F0 · datos de ejemplo (reglas 6.1–6.5)", () => {
  it("sin cuentas previas crea 5 cuentas, una por rol, e imprime «creada» 5 veces", async () => {
    const accounts = createFakeSeedAccounts();
    const result = await runSeed({ accounts, password: PASSWORD });
    expect(result.ok).toBe(true);
    expect(accounts.users.size).toBe(5);
    expect(accounts.documents.size).toBe(5);
    const roles = [...accounts.documents.values()].map((account) => account.role).sort();
    expect(roles).toEqual([...ROLES].sort());
    expect(count(result.lines, "creada")).toBe(5);
  });

  it("crea las cuentas con los correos, nombres y roles de la spec", async () => {
    const accounts = createFakeSeedAccounts();
    await runSeed({ accounts, password: PASSWORD });
    const byEmail = new Map([...accounts.documents.values()].map((account) => [account.email, account]));
    expect(byEmail.get("externo@biblioteca.test")).toMatchObject({ name: "Externo de Ejemplo", role: "EXTERNO" });
    expect(byEmail.get("estudiante@biblioteca.test")).toMatchObject({
      name: "Estudiante de Ejemplo",
      role: "ESTUDIANTE",
    });
    expect(byEmail.get("docente@biblioteca.test")).toMatchObject({ name: "Docente de Ejemplo", role: "DOCENTE" });
    expect(byEmail.get("bibliotecario@biblioteca.test")).toMatchObject({
      name: "Bibliotecario de Ejemplo",
      role: "BIBLIOTECARIO",
    });
    expect(byEmail.get("admin@biblioteca.test")).toMatchObject({
      name: "Administrador de Ejemplo",
      role: "ADMINISTRADOR",
    });
  });

  it("es repetible: la segunda vez siguen siendo 5 e imprime «ya existía» 5 veces", async () => {
    const accounts = createFakeSeedAccounts();
    await runSeed({ accounts, password: PASSWORD });
    const second = await runSeed({ accounts, password: "otra-clave-distinta" });
    expect(second.ok).toBe(true);
    expect(accounts.users.size).toBe(5);
    expect(accounts.documents.size).toBe(5);
    expect(count(second.lines, "ya existía")).toBe(5);
    expect(count(second.lines, "creada")).toBe(0);
    for (const user of accounts.users.values()) {
      expect(user.password).toBe(PASSWORD);
    }
  });

  it("si la cuenta ya existe deja su documento con el rol y el nombre de la tabla", async () => {
    const accounts = createFakeSeedAccounts();
    await runSeed({ accounts, password: PASSWORD });
    const uid = accounts.users.get("admin@biblioteca.test")?.uid ?? "";
    accounts.documents.set(uid, { email: "admin@biblioteca.test", name: "Otro", role: "EXTERNO" });
    await runSeed({ accounts, password: PASSWORD });
    expect(accounts.documents.get(uid)).toEqual({
      email: "admin@biblioteca.test",
      name: "Administrador de Ejemplo",
      role: "ADMINISTRADOR",
    });
  });

  it.each([["1234567"], [""], [undefined]])("con SEED_PASSWORD %j falla y no crea nada", async (password) => {
    const accounts = createFakeSeedAccounts();
    const result = await runSeed({ accounts, password });
    expect(result.ok).toBe(false);
    expect(accounts.users.size).toBe(0);
    expect(accounts.documents.size).toBe(0);
  });

  it("nunca imprime la contraseña", async () => {
    const accounts = createFakeSeedAccounts();
    const secret = "clave-super-secreta";
    const first = await runSeed({ accounts, password: secret });
    const second = await runSeed({ accounts, password: secret });
    expect([...first.lines, ...second.lines].join("\n")).not.toContain(secret);
  });
});
