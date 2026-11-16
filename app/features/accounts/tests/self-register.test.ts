import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorResponseSchema } from "@/shared/schema";
import { ConflictError } from "@/shared/server/errors";
import { RegisteredAccountSchema, SelfRegisterInputSchema } from "../schema";
import { createAccountService } from "../server/account-service";
import type { AccountRepository } from "../server/repository";
import { createMemoryAccountRepository } from "../server/repository.memory";
import { createSelfRegisterHandler } from "../server/self-register-handler";
import { REGISTER_MESSAGES, registerFailureMessage, registrationProblem } from "../ui/register-messages";

const PASSWORD = "clave-segura-1";
const VALID = { name: "Ana Pérez", email: "ana@correo.test", password: PASSWORD };

function setup(accounts: AccountRepository = createMemoryAccountRepository()) {
  const service = createAccountService({ accounts });
  const handler = createSelfRegisterHandler({ service, rethrow: () => undefined });
  return { service, handler };
}

function setupMemory() {
  const accounts = createMemoryAccountRepository();
  return { accounts, ...setup(accounts) };
}

function post(body: string, origin = "http://localhost:3000"): Request {
  return new Request("http://localhost:3000/api/accounts/register", {
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
  const result = SelfRegisterInputSchema.safeParse(input);
  if (result.success) {
    return [];
  }
  return result.error.issues.map((issue) => issue.path.map(String).join("."));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("F10 · autorregistro (reglas 2 y 3)", () => {
  it("crea la cuenta como EXTERNO y responde 201 sin la contraseña", async () => {
    const { handler, accounts } = setupMemory();
    const response = await handler(postJson(VALID));
    expect(response.status).toBe(201);
    const text = await response.text();
    expect(text).not.toContain("password");
    expect(text).not.toContain(PASSWORD);
    const created = RegisteredAccountSchema.parse(JSON.parse(text));
    expect(created).toMatchObject({ email: "ana@correo.test", name: "Ana Pérez", role: "EXTERNO" });
    expect(created.uid.length).toBeGreaterThan(0);
    expect(Object.keys(created).sort()).toEqual(["email", "name", "role", "uid"]);
    expect(accounts.findAccount(created.uid)).toEqual({ email: "ana@correo.test", name: "Ana Pérez", role: "EXTERNO" });
  });

  it("la contraseña llega tal cual a Authentication y no se guarda en el documento", async () => {
    const { handler, accounts } = setupMemory();
    const password = "  con espacios  ";
    const created = RegisteredAccountSchema.parse(await (await handler(postJson({ ...VALID, password }))).json());
    expect(accounts.findUser("ana@correo.test")?.password).toBe(password);
    expect(JSON.stringify(accounts.findAccount(created.uid))).not.toContain("espacios");
  });

  it.each([
    "ADMINISTRADOR",
    "BIBLIOTECARIO",
    "DOCENTE",
    "ESTUDIANTE",
  ])("un role %s en el cuerpo se ignora: queda EXTERNO", async (role) => {
    const { handler, accounts } = setupMemory();
    const created = RegisteredAccountSchema.parse(await (await handler(postJson({ ...VALID, role }))).json());
    expect(created.role).toBe("EXTERNO");
    expect(accounts.findAccount(created.uid)?.role).toBe("EXTERNO");
  });

  it("un uid en el cuerpo se ignora", async () => {
    const { handler } = setupMemory();
    const created = RegisteredAccountSchema.parse(
      await (await handler(postJson({ ...VALID, uid: "uid-elegido" }))).json(),
    );
    expect(created.uid).not.toBe("uid-elegido");
  });

  it("el correo se guarda sin espacios y en minúsculas", async () => {
    const { handler, accounts } = setupMemory();
    const response = await handler(postJson({ ...VALID, email: "  Ana@Correo.TEST " }));
    expect(RegisteredAccountSchema.parse(await response.json()).email).toBe("ana@correo.test");
    expect(accounts.findUser("ana@correo.test")).not.toBeNull();
  });

  it("al nombre se le quitan los espacios de los extremos", async () => {
    const { handler } = setupMemory();
    const response = await handler(postJson({ ...VALID, name: "  Ana Pérez  " }));
    expect(RegisteredAccountSchema.parse(await response.json()).name).toBe("Ana Pérez");
  });

  it("un correo que ya tiene cuenta recibe 409 y no se crea nada", async () => {
    const { handler, accounts } = setupMemory();
    expect((await handler(postJson(VALID))).status).toBe(201);
    const response = await handler(postJson({ ...VALID, name: "Otra Persona", email: "ANA@correo.test" }));
    expect(response.status).toBe(409);
    const error = await errorOf(response);
    expect(error.code).toBe("CONFLICTO");
    expect(error.message).toBe("Ya existe una cuenta con ese correo.");
    expect(accounts.userCount()).toBe(1);
    expect(accounts.findUser("ana@correo.test")?.name).toBe("Ana Pérez");
  });

  it("dos registros simultáneos con el mismo correo: uno 201 y otro 409", async () => {
    const { handler, accounts } = setupMemory();
    const responses = await Promise.all([handler(postJson(VALID)), handler(postJson(VALID))]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(accounts.userCount()).toBe(1);
  });

  it("no exige sesión: la ruta no lee ninguna", async () => {
    const { handler } = setupMemory();
    expect((await handler(postJson(VALID))).status).toBe(201);
  });

  it("el servicio lanza ConflictError con un correo repetido", async () => {
    const { service } = setupMemory();
    const input = SelfRegisterInputSchema.parse(VALID);
    await service.selfRegister(input);
    await expect(service.selfRegister(input)).rejects.toBeInstanceOf(ConflictError);
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
    const { handler } = setup(failing);
    const response = await handler(postJson(VALID));
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain("accounts.ts");
    expect(ErrorResponseSchema.parse(JSON.parse(text)).error.code).toBe("ERROR_INTERNO");
    expect(memory.userCount()).toBe(0);
  });
});

describe("F10 · origen y validación (reglas 1 y 3.2, Bordes)", () => {
  it("desde otro origen recibe 403 y no se crea nada", async () => {
    const { handler, accounts } = setupMemory();
    const response = await handler(postJson(VALID, "https://otro-sitio.com"));
    expect(response.status).toBe(403);
    expect((await errorOf(response)).message).toBe("Origen no permitido.");
    expect(accounts.userCount()).toBe(0);
  });

  it("el origen se valida antes que el cuerpo", async () => {
    const { handler } = setupMemory();
    expect((await handler(post("no es json", "https://otro-sitio.com"))).status).toBe(403);
  });

  it.each([
    ["sin name", { email: VALID.email, password: PASSWORD }, ["name"]],
    ["sin email", { name: VALID.name, password: PASSWORD }, ["email"]],
    ["sin password", { name: VALID.name, email: VALID.email }, ["password"]],
    ["nombre de solo espacios", { ...VALID, name: "   " }, ["name"]],
    ["nombre de 121 caracteres", { ...VALID, name: "a".repeat(121) }, ["name"]],
    ["correo sin forma de correo", { ...VALID, email: "ana" }, ["email"]],
    ["correo de 255 caracteres", { ...VALID, email: `${"a".repeat(245)}@correo.es` }, ["email"]],
    ["contraseña de 7 caracteres", { ...VALID, password: "1234567" }, ["password"]],
    ["contraseña de 129 caracteres", { ...VALID, password: "a".repeat(129) }, ["password"]],
    ["contraseña numérica", { ...VALID, password: 12345678 }, ["password"]],
  ])("%s → inválido", (_label, input, paths) => {
    expect(fieldPaths(input)).toEqual(paths);
  });

  it.each([
    ["nombre de 120 caracteres", { ...VALID, name: "a".repeat(120) }],
    ["contraseña de 8 caracteres", { ...VALID, password: "12345678" }],
    ["contraseña de 128 caracteres", { ...VALID, password: "a".repeat(128) }],
  ])("%s → 201", async (_label, input) => {
    const { handler } = setupMemory();
    expect((await handler(postJson(input))).status).toBe(201);
  });

  it("un cuerpo inválido recibe 400 con fields y no crea nada", async () => {
    const { handler, accounts } = setupMemory();
    const response = await handler(postJson({ ...VALID, password: "1234567" }));
    expect(response.status).toBe(400);
    const error = await errorOf(response);
    expect(error.code).toBe("VALIDACION");
    expect(error.fields?.map((field) => field.path)).toEqual(["password"]);
    expect(JSON.stringify(error)).not.toContain("1234567");
    expect(accounts.userCount()).toBe(0);
  });

  it("un cuerpo que no es JSON recibe 400", async () => {
    const { handler } = setupMemory();
    expect((await handler(post("no es json"))).status).toBe(400);
  });
});

describe("F10 · formulario: comprobaciones y mensajes (reglas 4.2 y 4.3)", () => {
  const form = { name: "Ana Pérez", email: "ana@correo.test", password: PASSWORD, repeat: PASSWORD };

  it("los textos son los de la spec", () => {
    expect(REGISTER_MESSAGES.missingName).toBe("Escribe tu nombre.");
    expect(REGISTER_MESSAGES.missingEmail).toBe("Escribe tu correo.");
    expect(REGISTER_MESSAGES.passwordLength).toBe("La contraseña debe tener entre 8 y 128 caracteres.");
    expect(REGISTER_MESSAGES.mismatch).toBe("Las contraseñas no coinciden.");
    expect(REGISTER_MESSAGES.checkForm).toBe("Revisa los datos del formulario.");
    expect(REGISTER_MESSAGES.failed).toBe("No se pudo crear la cuenta. Intenta de nuevo.");
    expect(REGISTER_MESSAGES.createdButNoSession).toBe("Tu cuenta se creó. Ingresa con tu correo y tu contraseña.");
  });

  it("un formulario bien lleno no tiene problemas", () => {
    expect(registrationProblem(form)).toBeNull();
  });

  it.each([
    ["nombre vacío", { ...form, name: "" }, "Escribe tu nombre."],
    ["nombre de solo espacios", { ...form, name: "   " }, "Escribe tu nombre."],
    ["correo vacío", { ...form, email: "  " }, "Escribe tu correo."],
    [
      "contraseña de 7",
      { ...form, password: "1234567", repeat: "1234567" },
      "La contraseña debe tener entre 8 y 128 caracteres.",
    ],
    [
      "contraseña de 129",
      { ...form, password: "a".repeat(129), repeat: "a".repeat(129) },
      "La contraseña debe tener entre 8 y 128 caracteres.",
    ],
    ["contraseñas distintas", { ...form, repeat: "otra-clave-1" }, "Las contraseñas no coinciden."],
  ])("%s → «%s»", (_label, input, message) => {
    expect(registrationProblem(input)).toBe(message);
  });

  it("se muestra el primer problema: el nombre antes que la contraseña", () => {
    expect(registrationProblem({ name: "", email: "", password: "1", repeat: "2" })).toBe("Escribe tu nombre.");
  });

  it("la longitud se comprueba antes que la coincidencia", () => {
    expect(registrationProblem({ ...form, password: "corta", repeat: "otra" })).toBe(
      "La contraseña debe tener entre 8 y 128 caracteres.",
    );
  });

  it("una contraseña de espacios de 8 caracteres es válida y no se recorta", () => {
    expect(registrationProblem({ ...form, password: "        ", repeat: "        " })).toBeNull();
  });

  it("con 409 se muestra el mensaje del servidor", () => {
    expect(registerFailureMessage(409, "Ya existe una cuenta con ese correo.")).toBe(
      "Ya existe una cuenta con ese correo.",
    );
  });

  it("con 409 sin mensaje legible se usa el genérico", () => {
    expect(registerFailureMessage(409, null)).toBe("No se pudo crear la cuenta. Intenta de nuevo.");
  });

  it("con 400 se pide revisar el formulario", () => {
    expect(registerFailureMessage(400, "Los datos enviados no son válidos.")).toBe("Revisa los datos del formulario.");
  });

  it.each([403, 500, 0])("con %i se muestra el genérico", (status) => {
    expect(registerFailureMessage(status, "Ocurrió un error inesperado.")).toBe(
      "No se pudo crear la cuenta. Intenta de nuevo.",
    );
  });
});
