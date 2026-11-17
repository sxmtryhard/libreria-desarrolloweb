import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorResponseSchema, type Role, type Session } from "@/shared/schema";
import { ForbiddenError, UnauthenticatedError } from "@/shared/server/errors";
import { RegisteredAccountSchema, SelfRegisterInputSchema, StaffAccountInputSchema } from "../schema";
import { createAccountService } from "../server/account-service";
import type { AccountRepository } from "../server/repository";
import { createMemoryAccountRepository } from "../server/repository.memory";
import { createStaffAccountHandler } from "../server/staff-account-handler";

const PASSWORD = "clave-inicial-1";
const VALID = { name: "Luis Gómez", email: "luis.gomez@biblioteca.test", password: PASSWORD };
const ADMIN: Session = { uid: "uid-admin", email: "admin@biblioteca.test", role: "ADMINISTRADOR" };

function sessionWith(role: Role): Session {
  return { ...ADMIN, uid: `uid-${role}`, role };
}

function setup(session: Session | null = ADMIN, accounts: AccountRepository = createMemoryAccountRepository()) {
  const service = createAccountService({ accounts });
  let sessionReads = 0;
  const handler = createStaffAccountHandler({
    service,
    readSession: () => {
      sessionReads += 1;
      if (session === null) {
        return Promise.reject(new UnauthenticatedError());
      }
      return Promise.resolve(session);
    },
    rethrow: () => undefined,
  });
  return { service, handler, sessionReads: () => sessionReads };
}

function setupMemory(session: Session | null = ADMIN) {
  const accounts = createMemoryAccountRepository();
  return { accounts, ...setup(session, accounts) };
}

function post(body: string, origin = "http://localhost:3000"): Request {
  return new Request("http://localhost:3000/api/accounts/staff", {
    method: "POST",
    headers: { host: "localhost:3000", origin, "content-type": "application/json" },
    body,
  });
}

function postJson(body: object, origin?: string): Request {
  return post(JSON.stringify(body), origin);
}

async function errorOf(response: Response) {
  return ErrorResponseSchema.parse(await response.json()).error;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("F13 · el administrador crea un bibliotecario (reglas 2, 3 y 4)", () => {
  it("responde 201 con rol BIBLIOTECARIO, sin la contraseña, y guarda usuario y documento", async () => {
    const { handler, accounts } = setupMemory();
    const response = await handler(postJson(VALID));
    expect(response.status).toBe(201);
    const text = await response.text();
    expect(text).not.toContain("password");
    expect(text).not.toContain(PASSWORD);
    const created = RegisteredAccountSchema.parse(JSON.parse(text));
    expect(created).toMatchObject({ email: VALID.email, name: VALID.name, role: "BIBLIOTECARIO" });
    expect(created.uid.length).toBeGreaterThan(0);
    expect(Object.keys(created).sort()).toEqual(["email", "name", "role", "uid"]);
    expect(accounts.findAccount(created.uid)).toEqual({ email: VALID.email, name: VALID.name, role: "BIBLIOTECARIO" });
    expect(accounts.findUser(VALID.email)?.password).toBe(PASSWORD);
  });

  it.each([
    "ADMINISTRADOR",
    "DOCENTE",
    "EXTERNO",
  ])("un role %s en el cuerpo se ignora: queda BIBLIOTECARIO", async (role) => {
    const { handler, accounts } = setupMemory();
    const created = RegisteredAccountSchema.parse(await (await handler(postJson({ ...VALID, role }))).json());
    expect(created.role).toBe("BIBLIOTECARIO");
    expect(accounts.findAccount(created.uid)?.role).toBe("BIBLIOTECARIO");
  });

  it("el correo se guarda sin espacios y en minúsculas, y el nombre recortado", async () => {
    const { handler, accounts } = setupMemory();
    const response = await handler(
      postJson({ ...VALID, name: "  Luis Gómez ", email: "  Luis.Gomez@Biblioteca.TEST " }),
    );
    const created = RegisteredAccountSchema.parse(await response.json());
    expect(created.email).toBe("luis.gomez@biblioteca.test");
    expect(created.name).toBe("Luis Gómez");
    expect(accounts.findUser("luis.gomez@biblioteca.test")).not.toBeNull();
  });

  it("un correo que ya tiene cuenta recibe 409 y la cuenta existente no cambia de rol", async () => {
    const { handler, accounts, service } = setupMemory();
    const existing = await service.selfRegister(SelfRegisterInputSchema.parse({ ...VALID, name: "Ya Existía" }));
    const response = await handler(postJson({ ...VALID, email: "LUIS.GOMEZ@biblioteca.test" }));
    expect(response.status).toBe(409);
    const error = await errorOf(response);
    expect(error.code).toBe("CONFLICTO");
    expect(error.message).toBe("Ya existe una cuenta con ese correo.");
    expect(accounts.userCount()).toBe(1);
    expect(accounts.findAccount(existing.uid)).toEqual({ email: VALID.email, name: "Ya Existía", role: "EXTERNO" });
  });

  it("dos creaciones simultáneas con el mismo correo: una 201 y otra 409", async () => {
    const { handler, accounts } = setupMemory();
    const responses = await Promise.all([handler(postJson(VALID)), handler(postJson(VALID))]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(accounts.userCount()).toBe(1);
  });

  it("si falla guardar el documento responde 500 genérico y borra el usuario recién creado", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const memory = createMemoryAccountRepository();
    const failing: AccountRepository = {
      createUser: (email, password, name) => memory.createUser(email, password, name),
      deleteUser: (uid) => memory.deleteUser(uid),
      saveAccount(): Promise<void> {
        return Promise.reject(new Error("firestore caído en accounts.ts:12"));
      },
    };
    const { handler } = setup(ADMIN, failing);
    const response = await handler(postJson(VALID));
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain("accounts.ts");
    expect(ErrorResponseSchema.parse(JSON.parse(text)).error.code).toBe("ERROR_INTERNO");
    expect(memory.userCount()).toBe(0);
  });
});

describe("F13 · quién crea y en qué orden (regla 1)", () => {
  it.each<Role>([
    "BIBLIOTECARIO",
    "DOCENTE",
    "ESTUDIANTE",
    "EXTERNO",
  ])("%s recibe 403 y no se crea nada", async (role) => {
    const { handler, accounts } = setupMemory(sessionWith(role));
    const response = await handler(postJson(VALID));
    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe("NO_AUTORIZADO");
    expect(accounts.userCount()).toBe(0);
  });

  it("un estudiante con un cuerpo inválido recibe 403, no 400", async () => {
    const { handler } = setupMemory(sessionWith("ESTUDIANTE"));
    expect((await handler(post("no es json"))).status).toBe(403);
    expect((await handler(postJson({ ...VALID, password: "1" }))).status).toBe(403);
  });

  it("un bibliotecario con un correo repetido recibe 403, no 409", async () => {
    const { handler, service } = setupMemory(sessionWith("BIBLIOTECARIO"));
    await service.selfRegister(SelfRegisterInputSchema.parse(VALID));
    expect((await handler(postJson(VALID))).status).toBe(403);
  });

  it("sin sesión recibe 401 aunque el cuerpo sea inválido", async () => {
    const { handler, accounts } = setupMemory(null);
    const response = await handler(post("no es json"));
    expect(response.status).toBe(401);
    expect((await errorOf(response)).code).toBe("NO_AUTENTICADO");
    expect(accounts.userCount()).toBe(0);
  });

  it("desde otro origen recibe 403 sin leer la sesión", async () => {
    const { handler, accounts, sessionReads } = setupMemory();
    const response = await handler(postJson(VALID, "https://otro-sitio.com"));
    expect(response.status).toBe(403);
    expect((await errorOf(response)).message).toBe("Origen no permitido.");
    expect(sessionReads()).toBe(0);
    expect(accounts.userCount()).toBe(0);
  });

  it("el servicio rechaza a un bibliotecario con ForbiddenError", async () => {
    const { service } = setupMemory();
    expect(() => service.assertCanCreateLibrarian(sessionWith("BIBLIOTECARIO"))).toThrow(ForbiddenError);
    await expect(
      service.createLibrarian(sessionWith("BIBLIOTECARIO"), StaffAccountInputSchema.parse(VALID)),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("F13 · validación (regla 2.1, Bordes)", () => {
  it.each([
    ["nombre de 120 caracteres", { ...VALID, name: "a".repeat(120) }],
    ["contraseña de 8 caracteres", { ...VALID, password: "12345678" }],
    ["contraseña de 128 caracteres", { ...VALID, password: "a".repeat(128) }],
  ])("%s → 201", async (_label, input) => {
    const { handler } = setupMemory();
    expect((await handler(postJson(input))).status).toBe(201);
  });

  it.each([
    ["nombre de 121 caracteres", { ...VALID, name: "a".repeat(121) }, "name"],
    ["contraseña de 7 caracteres", { ...VALID, password: "1234567" }, "password"],
    ["contraseña de 129 caracteres", { ...VALID, password: "a".repeat(129) }, "password"],
    ["sin name", { email: VALID.email, password: PASSWORD }, "name"],
    ["sin email", { name: VALID.name, password: PASSWORD }, "email"],
    ["sin password", { name: VALID.name, email: VALID.email }, "password"],
    ["correo sin forma de correo", { ...VALID, email: "luis" }, "email"],
  ])("%s → 400 con fields y no se crea nada", async (_label, input, path) => {
    const { handler, accounts } = setupMemory();
    const response = await handler(postJson(input));
    expect(response.status).toBe(400);
    const error = await errorOf(response);
    expect(error.code).toBe("VALIDACION");
    expect(error.fields?.map((field) => field.path)).toEqual([path]);
    expect(accounts.userCount()).toBe(0);
  });

  it("un cuerpo que no es JSON recibe 400", async () => {
    const { handler } = setupMemory();
    expect((await handler(post("no es json"))).status).toBe(400);
  });
});
