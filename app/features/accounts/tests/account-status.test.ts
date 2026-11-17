import { afterEach, describe, expect, it, vi } from "vitest";
import { type Account, ErrorResponseSchema, isAccountActive, type Role, type Session } from "@/shared/schema";
import { UnauthenticatedError } from "@/shared/server/errors";
import { AccountStatusSchema, DeactivateAccountInputSchema } from "../schema";
import { createDeactivateAccountHandler, createReactivateAccountHandler } from "../server/account-status-handlers";
import { createAccountStatusService } from "../server/account-status-service";
import { createMemoryAccountStatusRepository } from "../server/repository.memory";

const NOW = new Date("2026-11-16T15:00:00.000Z");
const REASON = "No devolvió libros en tres ocasiones.";
const LIBRARIAN: Session = { uid: "uid-bib", email: "bib@biblioteca.test", role: "BIBLIOTECARIO" };
const ADMIN: Session = { uid: "uid-admin", email: "admin@biblioteca.test", role: "ADMINISTRADOR" };

const PEOPLE: Record<string, Account> = {
  "uid-ana": { email: "ana@correo.test", name: "Ana Pérez", role: "ESTUDIANTE" },
  "uid-eva": { email: "eva@correo.test", name: "Eva Ruiz", role: "EXTERNO" },
  "uid-doc": { email: "doc@correo.test", name: "Dora Díaz", role: "DOCENTE" },
  "uid-bib": { email: "bib@biblioteca.test", name: "Beto Bib", role: "BIBLIOTECARIO" },
  "uid-bib2": { email: "bib2@biblioteca.test", name: "Bea Bib", role: "BIBLIOTECARIO" },
  "uid-admin": { email: "admin@biblioteca.test", name: "Ada Admin", role: "ADMINISTRADOR" },
  "uid-admin2": { email: "admin2@biblioteca.test", name: "Aldo Admin", role: "ADMINISTRADOR" },
};

function sessionOf(role: Role): Session {
  return { uid: `uid-sesion-${role}`, email: `${role.toLowerCase()}@correo.test`, role };
}

function setup(session: Session | null = LIBRARIAN) {
  const accounts = createMemoryAccountStatusRepository();
  for (const [uid, account] of Object.entries(PEOPLE)) {
    accounts.seed(uid, account);
  }
  const service = createAccountStatusService({ accounts });
  let sessionReads = 0;
  const deps = {
    service,
    readSession: () => {
      sessionReads += 1;
      if (session === null) {
        return Promise.reject(new UnauthenticatedError());
      }
      return Promise.resolve(session);
    },
    now: () => NOW,
    rethrow: () => undefined,
  };
  return {
    accounts,
    service,
    deactivate: createDeactivateAccountHandler(deps),
    reactivate: createReactivateAccountHandler(deps),
    sessionReads: () => sessionReads,
  };
}

function post(path: string, body: string, origin = "http://localhost:3000"): Request {
  return new Request(`http://localhost:3000/api/accounts/${path}`, {
    method: "POST",
    headers: { host: "localhost:3000", origin, "content-type": "application/json" },
    body,
  });
}

function off(body: object, origin?: string): Request {
  return post("deactivate", JSON.stringify(body), origin);
}

function on(body: object, origin?: string): Request {
  return post("reactivate", JSON.stringify(body), origin);
}

async function errorOf(response: Response) {
  return ErrorResponseSchema.parse(await response.json()).error;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("F14 · desactivar (reglas 2 y 3)", () => {
  it("un bibliotecario desactiva a un estudiante: 200 con active false, y se guarda motivo, fecha y quién", async () => {
    const { deactivate, accounts } = setup();
    const response = await deactivate(off({ email: "ana@correo.test", reason: REASON }));
    expect(response.status).toBe(200);
    expect(AccountStatusSchema.parse(await response.json())).toEqual({
      uid: "uid-ana",
      email: "ana@correo.test",
      name: "Ana Pérez",
      role: "ESTUDIANTE",
      active: false,
    });
    expect(accounts.stored("uid-ana")).toMatchObject({
      active: false,
      deactivated_at: NOW.toISOString(),
      deactivated_by_uid: "uid-bib",
      deactivation_reason: REASON,
      role: "ESTUDIANTE",
    });
  });

  it("deshabilita el usuario en Authentication y cierra sus sesiones (regla 3.1)", async () => {
    const { deactivate, accounts } = setup();
    await deactivate(off({ email: "ana@correo.test", reason: REASON }));
    expect(accounts.authDisabled("uid-ana")).toBe(true);
    expect(accounts.revocations("uid-ana")).toBe(1);
  });

  it("el motivo se guarda recortado", async () => {
    const { deactivate, accounts } = setup();
    await deactivate(off({ email: "ana@correo.test", reason: `   ${REASON}  ` }));
    expect(accounts.stored("uid-ana")?.deactivation_reason).toBe(REASON);
  });

  it("encuentra la cuenta con el correo en mayúsculas y con espacios", async () => {
    const { deactivate } = setup();
    expect((await deactivate(off({ email: "  ANA@Correo.test ", reason: REASON }))).status).toBe(200);
  });

  it("desactivar una cuenta ya desactivada → 409 y no cambia nada", async () => {
    const { deactivate, accounts } = setup();
    await deactivate(off({ email: "ana@correo.test", reason: REASON }));
    const before = accounts.stored("uid-ana");
    const response = await deactivate(off({ email: "ana@correo.test", reason: "Otro motivo distinto." }));
    expect(response.status).toBe(409);
    expect((await errorOf(response)).message).toBe("La cuenta ya está desactivada.");
    expect(accounts.stored("uid-ana")).toEqual(before);
    expect(accounts.revocations("uid-ana")).toBe(1);
  });

  it("dos desactivaciones simultáneas: una 200 y otra 409", async () => {
    const { deactivate } = setup();
    const body = { email: "ana@correo.test", reason: REASON };
    const responses = await Promise.all([deactivate(off(body)), deactivate(off(body))]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
  });

  it("un correo sin cuenta → 404", async () => {
    const { deactivate } = setup();
    const response = await deactivate(off({ email: "nadie@correo.test", reason: REASON }));
    expect(response.status).toBe(404);
    const error = await errorOf(response);
    expect(error.code).toBe("NO_ENCONTRADO");
    expect(error.message).toBe("No existe una cuenta con ese correo.");
  });

  it("si falla Authentication responde 500 y el documento no cambia", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { deactivate, accounts } = setup();
    accounts.failAuth();
    const response = await deactivate(off({ email: "ana@correo.test", reason: REASON }));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("users.ts");
    expect(accounts.stored("uid-ana")).toEqual(PEOPLE["uid-ana"]);
    expect(accounts.authDisabled("uid-ana")).toBe(false);
  });
});

describe("F14 · reactivar (regla 4)", () => {
  it("reactiva: 200 con active true, guarda fecha y quién, y conserva el motivo anterior", async () => {
    const { deactivate, reactivate, accounts } = setup();
    await deactivate(off({ email: "ana@correo.test", reason: REASON }));
    const response = await reactivate(on({ email: "ana@correo.test" }));
    expect(response.status).toBe(200);
    expect(AccountStatusSchema.parse(await response.json()).active).toBe(true);
    expect(accounts.stored("uid-ana")).toMatchObject({
      active: true,
      reactivated_at: NOW.toISOString(),
      reactivated_by_uid: "uid-bib",
      deactivation_reason: REASON,
      role: "ESTUDIANTE",
    });
    expect(accounts.authDisabled("uid-ana")).toBe(false);
  });

  it("reactivar una cuenta activa → 409 y no cambia nada", async () => {
    const { reactivate, accounts } = setup();
    const response = await reactivate(on({ email: "ana@correo.test" }));
    expect(response.status).toBe(409);
    expect((await errorOf(response)).message).toBe("La cuenta ya está activa.");
    expect(accounts.stored("uid-ana")).toEqual(PEOPLE["uid-ana"]);
  });

  it("un reason en el cuerpo de reactivar se ignora", async () => {
    const { deactivate, reactivate, accounts } = setup();
    await deactivate(off({ email: "ana@correo.test", reason: REASON }));
    expect((await reactivate(on({ email: "ana@correo.test", reason: "x" }))).status).toBe(200);
    expect(accounts.stored("uid-ana")?.deactivation_reason).toBe(REASON);
  });

  it("si falla Authentication responde 500 y la cuenta sigue desactivada", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { deactivate, reactivate, accounts } = setup();
    await deactivate(off({ email: "ana@correo.test", reason: REASON }));
    accounts.failAuth();
    expect((await reactivate(on({ email: "ana@correo.test" }))).status).toBe(500);
    expect(accounts.stored("uid-ana")?.active).toBe(false);
    expect(accounts.authDisabled("uid-ana")).toBe(true);
  });
});

describe("F14 · quién a quién (regla 1)", () => {
  it.each([
    ["ana@correo.test", 200],
    ["eva@correo.test", 200],
    ["doc@correo.test", 200],
    ["bib2@biblioteca.test", 403],
    ["admin@biblioteca.test", 403],
    ["bib@biblioteca.test", 403],
  ])("un bibliotecario sobre %s → %i", async (email, status) => {
    const { deactivate } = setup(LIBRARIAN);
    expect((await deactivate(off({ email, reason: REASON }))).status).toBe(status);
  });

  it.each([
    ["ana@correo.test", 200],
    ["doc@correo.test", 200],
    ["bib2@biblioteca.test", 200],
    ["admin2@biblioteca.test", 403],
    ["admin@biblioteca.test", 403],
  ])("un administrador sobre %s → %i", async (email, status) => {
    const { deactivate } = setup(ADMIN);
    expect((await deactivate(off({ email, reason: REASON }))).status).toBe(status);
  });

  it("las mismas reglas valen para reactivar: un bibliotecario no reactiva a otro bibliotecario", async () => {
    const admin = setup(ADMIN);
    const { reactivate, accounts } = setup(LIBRARIAN);
    accounts.seed("uid-bib2", { ...PEOPLE["uid-bib2"], active: false });
    expect((await reactivate(on({ email: "bib2@biblioteca.test" }))).status).toBe(403);
    admin.accounts.seed("uid-bib2", { ...PEOPLE["uid-bib2"], active: false });
    expect((await admin.reactivate(on({ email: "bib2@biblioteca.test" }))).status).toBe(200);
  });

  it("un 403 sobre la cuenta no cambia nada", async () => {
    const { deactivate, accounts } = setup(LIBRARIAN);
    await deactivate(off({ email: "admin@biblioteca.test", reason: REASON }));
    expect(accounts.stored("uid-admin")).toEqual(PEOPLE["uid-admin"]);
    expect(accounts.authDisabled("uid-admin")).toBe(false);
  });

  it.each<Role>(["EXTERNO", "ESTUDIANTE", "DOCENTE"])("%s recibe 403 en las dos rutas", async (role) => {
    const { deactivate, reactivate } = setup(sessionOf(role));
    expect((await deactivate(off({ email: "eva@correo.test", reason: REASON }))).status).toBe(403);
    expect((await reactivate(on({ email: "eva@correo.test" }))).status).toBe(403);
  });

  it("un estudiante con un cuerpo inválido recibe 403, no 400", async () => {
    const { deactivate } = setup(sessionOf("ESTUDIANTE"));
    expect((await deactivate(post("deactivate", "no es json"))).status).toBe(403);
  });

  it("un estudiante con un correo inexistente recibe 403, no 404", async () => {
    const { deactivate } = setup(sessionOf("ESTUDIANTE"));
    expect((await deactivate(off({ email: "nadie@correo.test", reason: REASON }))).status).toBe(403);
  });

  it("un correo inexistente da 404 antes que el permiso sobre la cuenta", async () => {
    const { deactivate } = setup(LIBRARIAN);
    expect((await deactivate(off({ email: "nadie@correo.test", reason: REASON }))).status).toBe(404);
  });

  it("sin sesión → 401", async () => {
    const { deactivate, reactivate } = setup(null);
    expect((await deactivate(off({ email: "ana@correo.test", reason: REASON }))).status).toBe(401);
    expect((await reactivate(on({ email: "ana@correo.test" }))).status).toBe(401);
  });

  it("desde otro origen → 403 sin leer la sesión", async () => {
    const { deactivate, reactivate, sessionReads, accounts } = setup();
    const response = await deactivate(off({ email: "ana@correo.test", reason: REASON }, "https://otro-sitio.com"));
    expect(response.status).toBe(403);
    expect((await errorOf(response)).message).toBe("Origen no permitido.");
    expect((await reactivate(on({ email: "ana@correo.test" }, "https://otro-sitio.com"))).status).toBe(403);
    expect(sessionReads()).toBe(0);
    expect(accounts.stored("uid-ana")).toEqual(PEOPLE["uid-ana"]);
  });
});

describe("F14 · validación (Bordes)", () => {
  it.each([
    ["motivo de 10", "a".repeat(10), 200],
    ["motivo de 500", "a".repeat(500), 200],
    ["motivo de 9", "a".repeat(9), 400],
    ["motivo de 501", "a".repeat(501), 400],
    ["motivo de solo espacios", " ".repeat(20), 400],
  ])("%s → %i", async (_label, reason, status) => {
    const { deactivate } = setup();
    expect((await deactivate(off({ email: "ana@correo.test", reason }))).status).toBe(status);
  });

  it.each([
    ["sin motivo al desactivar", { email: "ana@correo.test" }, "reason"],
    ["sin correo", { reason: REASON }, "email"],
    ["correo sin forma de correo", { email: "ana", reason: REASON }, "email"],
  ])("%s → 400 con fields", async (_label, body, path) => {
    const { deactivate, accounts } = setup();
    const response = await deactivate(off(body));
    expect(response.status).toBe(400);
    const error = await errorOf(response);
    expect(error.code).toBe("VALIDACION");
    expect(error.fields?.map((field) => field.path)).toEqual([path]);
    expect(accounts.stored("uid-ana")).toEqual(PEOPLE["uid-ana"]);
  });

  it("reactivar sin correo o con un cuerpo que no es JSON → 400", async () => {
    const { reactivate } = setup();
    expect((await reactivate(on({}))).status).toBe(400);
    expect((await reactivate(post("reactivate", "no es json"))).status).toBe(400);
  });

  it("el esquema normaliza el correo", () => {
    expect(DeactivateAccountInputSchema.parse({ email: " ANA@correo.TEST ", reason: REASON }).email).toBe(
      "ana@correo.test",
    );
  });
});

describe("F14 · la cuenta activa en el contrato común", () => {
  it("sin el campo active la cuenta está activa; con active false, no", () => {
    expect(isAccountActive(PEOPLE["uid-ana"])).toBe(true);
    expect(isAccountActive({ ...PEOPLE["uid-ana"], active: true })).toBe(true);
    expect(isAccountActive({ ...PEOPLE["uid-ana"], active: false })).toBe(false);
  });
});
