import { afterEach, describe, expect, it, vi } from "vitest";
import type { Role, Session } from "@/shared/schema";
import { ErrorResponseSchema } from "@/shared/schema";
import { ConflictError, ForbiddenError, UnauthenticatedError } from "@/shared/server/errors";
import { RegisterAccountInputSchema, RegisteredAccountSchema } from "../schema";
import { createAccountService } from "../server/account-service";
import { createRegisterAccountHandler } from "../server/register-account-handler";
import type { AccountRepository } from "../server/repository";
import { createMemoryAccountRepository } from "../server/repository.memory";

const PASSWORD = "clave-inicial-1";
const VALID = { name: "Ana Pérez", email: "ana.perez@correo.test", role: "ESTUDIANTE", password: PASSWORD };

function sessionOf(role: Role): Session {
  return { uid: `uid-${role}`, email: `${role.toLowerCase()}@biblioteca.test`, role };
}

function handlerFor(role: Role | null, accounts: AccountRepository) {
  const service = createAccountService({ accounts });
  const handler = createRegisterAccountHandler({
    service,
    readSession(): Promise<Session> {
      if (role === null) {
        return Promise.reject(new UnauthenticatedError());
      }
      return Promise.resolve(sessionOf(role));
    },
    rethrow: () => undefined,
  });
  return { service, handler };
}

function setup(role: Role | null) {
  const accounts = createMemoryAccountRepository();
  return { accounts, ...handlerFor(role, accounts) };
}

function post(body: string, origin = "http://localhost:3000"): Request {
  return new Request("http://localhost:3000/api/accounts", {
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

function fieldPaths(input: object): string[] {
  const result = RegisterAccountInputSchema.safeParse(input);
  if (result.success) {
    return [];
  }
  return result.error.issues.map((issue) => issue.path.map(String).join("."));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("F3 · registrar una cuenta (reglas 1, 8, 9 y 10)", () => {
  it("un BIBLIOTECARIO registra una cuenta y recibe 201 sin contraseña", async () => {
    const { handler, accounts } = setup("BIBLIOTECARIO");
    const response = await handler(postJson(VALID));
    expect(response.status).toBe(201);
    const text = await response.text();
    expect(text).not.toContain("password");
    expect(text).not.toContain(PASSWORD);
    const created = RegisteredAccountSchema.parse(JSON.parse(text));
    expect(created).toMatchObject({ email: "ana.perez@correo.test", name: "Ana Pérez", role: "ESTUDIANTE" });
    expect(created.uid.length).toBeGreaterThan(0);
    expect(Object.keys(created).sort()).toEqual(["email", "name", "role", "uid"]);
    expect(accounts.userCount()).toBe(1);
  });

  it("crea el usuario de Authentication y el documento accounts/{uid} sin contraseña", async () => {
    const { handler, accounts } = setup("BIBLIOTECARIO");
    const created = RegisteredAccountSchema.parse(await (await handler(postJson(VALID))).json());
    expect(accounts.findUser("ana.perez@correo.test")).toEqual({
      uid: created.uid,
      email: "ana.perez@correo.test",
      name: "Ana Pérez",
      password: PASSWORD,
    });
    expect(accounts.findAccount(created.uid)).toEqual({
      email: "ana.perez@correo.test",
      name: "Ana Pérez",
      role: "ESTUDIANTE",
    });
  });

  it("un ADMINISTRADOR registra una cuenta de DOCENTE", async () => {
    const { handler } = setup("ADMINISTRADOR");
    const response = await handler(postJson({ ...VALID, role: "DOCENTE" }));
    expect(response.status).toBe(201);
    expect(RegisteredAccountSchema.parse(await response.json()).role).toBe("DOCENTE");
  });

  it("se puede registrar una cuenta de EXTERNO", async () => {
    const { handler } = setup("BIBLIOTECARIO");
    expect((await handler(postJson({ ...VALID, role: "EXTERNO" }))).status).toBe(201);
  });

  it("los campos extra del cuerpo se ignoran", async () => {
    const { handler } = setup("BIBLIOTECARIO");
    const response = await handler(postJson({ ...VALID, uid: "mi-uid" }));
    expect(RegisteredAccountSchema.parse(await response.json()).uid).not.toBe("mi-uid");
  });

  it("mismo nombre con correos distintos se acepta", async () => {
    const { handler, accounts } = setup("BIBLIOTECARIO");
    await handler(postJson(VALID));
    expect((await handler(postJson({ ...VALID, email: "otra.ana@correo.test" }))).status).toBe(201);
    expect(accounts.userCount()).toBe(2);
  });
});

describe("F3 · autorización", () => {
  it.each<Role>(["ESTUDIANTE", "DOCENTE", "EXTERNO"])("un %s recibe 403 y no se crea nada", async (role) => {
    const { handler, accounts } = setup(role);
    const response = await handler(postJson(VALID));
    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe("NO_AUTORIZADO");
    expect(accounts.userCount()).toBe(0);
  });

  it("sin sesión recibe 401 y no se crea nada", async () => {
    const { handler, accounts } = setup(null);
    expect((await handler(postJson(VALID))).status).toBe(401);
    expect(accounts.userCount()).toBe(0);
  });

  it("un ESTUDIANTE con cuerpo inválido recibe 403, no 400", async () => {
    const { handler } = setup("ESTUDIANTE");
    expect((await handler(postJson({ name: "" }))).status).toBe(403);
    expect((await handler(post("{no es json"))).status).toBe(403);
  });

  it("sin sesión y con cuerpo inválido recibe 401, no 400", async () => {
    const { handler } = setup(null);
    expect((await handler(postJson({ name: "" }))).status).toBe(401);
  });

  it("un ESTUDIANTE no descubre si un correo tiene cuenta: recibe 403, no 409", async () => {
    const accounts = createMemoryAccountRepository();
    await handlerFor("BIBLIOTECARIO", accounts).handler(postJson(VALID));
    const response = await handlerFor("ESTUDIANTE", accounts).handler(postJson(VALID));
    expect(response.status).toBe(403);
  });

  it("el servicio también rechaza a quien no es personal", async () => {
    const { service, accounts } = setup("BIBLIOTECARIO");
    const input = RegisterAccountInputSchema.parse(VALID);
    await expect(service.register(sessionOf("DOCENTE"), input)).rejects.toBeInstanceOf(ForbiddenError);
    expect(accounts.userCount()).toBe(0);
  });

  it("un POST desde otro origen recibe 403 «Origen no permitido.» aunque sea BIBLIOTECARIO", async () => {
    const { handler, accounts } = setup("BIBLIOTECARIO");
    const response = await handler(postJson(VALID, "https://otro-sitio.com"));
    expect(response.status).toBe(403);
    expect((await errorOf(response)).message).toBe("Origen no permitido.");
    expect(accounts.userCount()).toBe(0);
  });
});

describe("F3 · rol de la cuenta (regla 4)", () => {
  it.each([
    "BIBLIOTECARIO",
    "ADMINISTRADOR",
  ])("un ADMINISTRADOR no puede crear un %s: 400 con fields role", async (role) => {
    const { handler, accounts } = setup("ADMINISTRADOR");
    const response = await handler(postJson({ ...VALID, role }));
    expect(response.status).toBe(400);
    expect((await errorOf(response)).fields?.map((field) => field.path)).toContain("role");
    expect(accounts.userCount()).toBe(0);
  });

  it.each(["estudiante", "LECTOR", "", 3])("role %j se rechaza nombrando role", (role) => {
    expect(fieldPaths({ ...VALID, role })).toContain("role");
  });
});

describe("F3 · correo (reglas 3 y 7)", () => {
  it("guarda el correo recortado y en minúsculas", async () => {
    const { handler, accounts } = setup("BIBLIOTECARIO");
    const response = await handler(postJson({ ...VALID, email: "  Ana.Perez@Correo.TEST " }));
    expect(response.status).toBe(201);
    const created = RegisteredAccountSchema.parse(await response.json());
    expect(created.email).toBe("ana.perez@correo.test");
    expect(accounts.findAccount(created.uid)?.email).toBe("ana.perez@correo.test");
  });

  it("un correo repetido (con otras mayúsculas y espacios) responde 409 y no cambia la cuenta existente", async () => {
    const { handler, accounts } = setup("BIBLIOTECARIO");
    const first = RegisteredAccountSchema.parse(await (await handler(postJson(VALID))).json());
    const response = await handler(
      postJson({ name: "Otra Persona", email: "  Ana.Perez@Correo.TEST ", role: "DOCENTE", password: "otra-clave-22" }),
    );
    expect(response.status).toBe(409);
    expect(await errorOf(response)).toEqual({ code: "CONFLICTO", message: "Ya existe una cuenta con ese correo." });
    expect(accounts.userCount()).toBe(1);
    expect(accounts.findAccount(first.uid)).toEqual({
      email: "ana.perez@correo.test",
      name: "Ana Pérez",
      role: "ESTUDIANTE",
    });
    expect(accounts.findUser("ana.perez@correo.test")?.password).toBe(PASSWORD);
  });

  it("el servicio lanza ConflictError con correo repetido", async () => {
    const { service } = setup("BIBLIOTECARIO");
    const input = RegisterAccountInputSchema.parse(VALID);
    await service.register(sessionOf("ADMINISTRADOR"), input);
    await expect(service.register(sessionOf("ADMINISTRADOR"), input)).rejects.toBeInstanceOf(ConflictError);
  });

  it("dos registros simultáneos con el mismo correo: uno 201 y el otro 409", async () => {
    const { handler, accounts } = setup("BIBLIOTECARIO");
    const responses = await Promise.all([handler(postJson(VALID)), handler(postJson(VALID))]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(accounts.userCount()).toBe(1);
  });

  it.each([
    "no-es-un-correo",
    "ana@",
    "@correo.test",
    "",
    "ana perez@correo.test",
  ])("email %j se rechaza nombrando email", (email) => {
    expect(fieldPaths({ ...VALID, email })).toContain("email");
  });

  it("un correo inválido responde 400 con fields que nombra email", async () => {
    const { handler, accounts } = setup("BIBLIOTECARIO");
    const response = await handler(postJson({ ...VALID, email: "no-es-un-correo" }));
    expect(response.status).toBe(400);
    expect((await errorOf(response)).fields?.map((field) => field.path)).toContain("email");
    expect(accounts.userCount()).toBe(0);
  });

  it("correo de más de 254 caracteres se rechaza", () => {
    const long = `${"a".repeat(250)}@correo.test`;
    expect(fieldPaths({ ...VALID, email: long })).toContain("email");
  });
});

describe("F3 · nombre y contraseña (reglas 2, 5 y 6)", () => {
  it("recorta los espacios del nombre", () => {
    expect(RegisterAccountInputSchema.parse({ ...VALID, name: "  Ana Pérez  " }).name).toBe("Ana Pérez");
  });

  it("nombre de 120 se acepta; de 121 y de solo espacios se rechazan", () => {
    expect(fieldPaths({ ...VALID, name: "a".repeat(120) })).toEqual([]);
    expect(fieldPaths({ ...VALID, name: "a".repeat(121) })).toContain("name");
    expect(fieldPaths({ ...VALID, name: "   " })).toContain("name");
  });

  it("contraseña de 8 y de 128 se aceptan; de 7 y de 129 se rechazan", () => {
    expect(fieldPaths({ ...VALID, password: "a".repeat(8) })).toEqual([]);
    expect(fieldPaths({ ...VALID, password: "a".repeat(128) })).toEqual([]);
    expect(fieldPaths({ ...VALID, password: "a".repeat(7) })).toContain("password");
    expect(fieldPaths({ ...VALID, password: "a".repeat(129) })).toContain("password");
  });

  it("los espacios de la contraseña cuentan y se conservan", async () => {
    const { handler, accounts } = setup("BIBLIOTECARIO");
    const spaced = "  con espacios  ";
    expect((await handler(postJson({ ...VALID, password: spaced }))).status).toBe(201);
    expect(accounts.findUser("ana.perez@correo.test")?.password).toBe(spaced);
  });

  it("una contraseña de 7 caracteres responde 400 con fields password y sin repetir la contraseña", async () => {
    const { handler, accounts } = setup("BIBLIOTECARIO");
    const response = await handler(postJson({ ...VALID, password: "secret7" }));
    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).not.toContain("secret7");
    expect(ErrorResponseSchema.parse(JSON.parse(text)).error.fields?.map((field) => field.path)).toContain("password");
    expect(accounts.userCount()).toBe(0);
  });

  it.each(["name", "email", "role", "password"])("si falta %s responde 400 nombrando ese campo", (field) => {
    const body: Record<string, string> = { ...VALID };
    delete body[field];
    expect(fieldPaths(body)).toContain(field);
  });

  it("un cuerpo que no es JSON responde 400", async () => {
    const { handler } = setup("BIBLIOTECARIO");
    expect((await handler(post("{no es json"))).status).toBe(400);
  });
});

describe("F3 · no queda una cuenta a medias (regla 8)", () => {
  it("si falla guardar el documento, responde 500 genérico y elimina el usuario creado", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const memory = createMemoryAccountRepository();
    const failing: AccountRepository = {
      createUser: memory.createUser,
      deleteUser: memory.deleteUser,
      saveAccount: () => Promise.reject(new Error("Firestore caído")),
    };
    const { handler } = handlerFor("BIBLIOTECARIO", failing);
    const response = await handler(postJson(VALID));
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(ErrorResponseSchema.parse(JSON.parse(text)).error.code).toBe("ERROR_INTERNO");
    expect(text).not.toContain("Firestore caído");
    expect(text).not.toContain(PASSWORD);
    expect(memory.userCount()).toBe(0);
    expect(memory.findUser("ana.perez@correo.test")).toBeNull();
    expect(JSON.stringify(logged.mock.calls)).not.toContain(PASSWORD);
  });

  it("tras ese fallo, el mismo correo se puede registrar de nuevo", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const memory = createMemoryAccountRepository();
    const failing: AccountRepository = { ...memory, saveAccount: () => Promise.reject(new Error("Firestore caído")) };
    await handlerFor("BIBLIOTECARIO", failing).handler(postJson(VALID));
    expect((await handlerFor("BIBLIOTECARIO", memory).handler(postJson(VALID))).status).toBe(201);
  });
});
