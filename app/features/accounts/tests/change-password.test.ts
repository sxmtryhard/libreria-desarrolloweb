import { describe, expect, it } from "vitest";
import { ErrorResponseSchema, type Role, type Session } from "@/shared/schema";
import { UnauthenticatedError } from "@/shared/server/errors";
import { ChangePasswordInputSchema } from "../schema";
import { createChangePasswordHandler } from "../server/change-password-handler";
import { createPasswordService } from "../server/password-service";
import { createMemoryPasswordRepository } from "../server/repository.memory";
import {
  CHANGE_PASSWORD_LINK,
  PASSWORD_MESSAGES,
  passwordFailureMessage,
  passwordProblem,
  signInNotice,
} from "../ui/password-view";

const CURRENT = "clave-actual-1";
const NEW = "clave-nueva-22";
const ANA: Session = { uid: "uid-ana", email: "ana@correo.test", role: "ESTUDIANTE" };

function setup(session: Session | null = ANA) {
  const passwords = createMemoryPasswordRepository();
  passwords.seed("uid-ana", "ana@correo.test", CURRENT);
  passwords.seed("uid-luis", "luis@correo.test", "clave-de-luis");
  const service = createPasswordService({ passwords });
  let sessionReads = 0;
  let cookieCleared = 0;
  const handler = createChangePasswordHandler({
    service,
    readSession: () => {
      sessionReads += 1;
      if (session === null) {
        return Promise.reject(new UnauthenticatedError());
      }
      return Promise.resolve(session);
    },
    clearSessionCookie: () => {
      cookieCleared += 1;
      return Promise.resolve();
    },
    rethrow: () => undefined,
  });
  return { passwords, handler, sessionReads: () => sessionReads, cookieCleared: () => cookieCleared };
}

function post(body: string, origin = "http://localhost:3000"): Request {
  return new Request("http://localhost:3000/api/accounts/password", {
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

describe("F15 · cambiar la contraseña (reglas 1, 2 y 3)", () => {
  it("con la actual correcta: 204 sin cuerpo, guarda la nueva, cierra las sesiones y borra la cookie", async () => {
    const { handler, passwords, cookieCleared } = setup();
    const response = await handler(postJson({ current_password: CURRENT, new_password: NEW }));
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(passwords.passwordOf("uid-ana")).toBe(NEW);
    expect(passwords.revocations("uid-ana")).toBe(1);
    expect(cookieCleared()).toBe(1);
  });

  it.each<Role>([
    "EXTERNO",
    "DOCENTE",
    "BIBLIOTECARIO",
    "ADMINISTRADOR",
  ])("%s también puede cambiar la suya", async (role) => {
    const { handler, passwords } = setup({ ...ANA, role });
    expect((await handler(postJson({ current_password: CURRENT, new_password: NEW }))).status).toBe(204);
    expect(passwords.passwordOf("uid-ana")).toBe(NEW);
  });

  it("la cuenta sale de la sesión: un uid o email en el cuerpo se ignora", async () => {
    const { handler, passwords } = setup();
    const body = { current_password: CURRENT, new_password: NEW, uid: "uid-luis", email: "luis@correo.test" };
    expect((await handler(postJson(body))).status).toBe(204);
    expect(passwords.passwordOf("uid-luis")).toBe("clave-de-luis");
    expect(passwords.passwordOf("uid-ana")).toBe(NEW);
  });

  it("la contraseña actual de otra persona no sirve", async () => {
    const { handler, passwords } = setup();
    const response = await handler(postJson({ current_password: "clave-de-luis", new_password: NEW }));
    expect(response.status).toBe(400);
    expect(passwords.passwordOf("uid-ana")).toBe(CURRENT);
  });

  it("con la actual incorrecta: 400 con su mensaje y no cambia nada", async () => {
    const { handler, passwords, cookieCleared } = setup();
    const response = await handler(postJson({ current_password: "otra-clave", new_password: NEW }));
    expect(response.status).toBe(400);
    const error = await errorOf(response);
    expect(error.code).toBe("VALIDACION");
    expect(error.message).toBe("La contraseña actual no es correcta.");
    expect(passwords.passwordOf("uid-ana")).toBe(CURRENT);
    expect(passwords.revocations("uid-ana")).toBe(0);
    expect(cookieCleared()).toBe(0);
  });

  it("con la nueva igual a la actual: 400 con su mensaje y no cambia nada", async () => {
    const { handler, passwords } = setup();
    const response = await handler(postJson({ current_password: CURRENT, new_password: CURRENT }));
    expect(response.status).toBe(400);
    expect((await errorOf(response)).message).toBe("La contraseña nueva debe ser distinta de la actual.");
    expect(passwords.revocations("uid-ana")).toBe(0);
  });

  it("la regla de «distinta» va antes que comprobar la actual (regla 1.3)", async () => {
    const { handler } = setup();
    const response = await handler(postJson({ current_password: "no-es-la-mia", new_password: "no-es-la-mia" }));
    expect((await errorOf(response)).message).toBe("La contraseña nueva debe ser distinta de la actual.");
  });

  it("si Firebase bloquea por demasiados intentos: 409 con su mensaje y no cambia nada", async () => {
    const { handler, passwords } = setup();
    passwords.block();
    const response = await handler(postJson({ current_password: CURRENT, new_password: NEW }));
    expect(response.status).toBe(409);
    const error = await errorOf(response);
    expect(error.code).toBe("CONFLICTO");
    expect(error.message).toBe("Demasiados intentos. Espera unos minutos.");
    expect(passwords.passwordOf("uid-ana")).toBe(CURRENT);
  });

  it("las contraseñas se usan tal cual, con espacios", async () => {
    const { handler, passwords } = setup();
    passwords.seed("uid-ana", "ana@correo.test", "  con espacios  ");
    const response = await handler(postJson({ current_password: "  con espacios  ", new_password: " nueva clave " }));
    expect(response.status).toBe(204);
    expect(passwords.passwordOf("uid-ana")).toBe(" nueva clave ");
  });

  it("ningún mensaje de error contiene las contraseñas", async () => {
    const { handler } = setup();
    const text = await (await handler(postJson({ current_password: "secreta-mala", new_password: "1234567" }))).text();
    expect(text).not.toContain("secreta-mala");
    expect(text).not.toContain("1234567");
  });
});

describe("F15 · sesión, origen y validación (regla 1, Bordes)", () => {
  it("sin sesión → 401 y no cambia nada", async () => {
    const { handler, passwords } = setup(null);
    const response = await handler(postJson({ current_password: CURRENT, new_password: NEW }));
    expect(response.status).toBe(401);
    expect(passwords.passwordOf("uid-ana")).toBe(CURRENT);
  });

  it("sin sesión y con un cuerpo inválido → 401, no 400", async () => {
    const { handler } = setup(null);
    expect((await handler(post("no es json"))).status).toBe(401);
  });

  it("desde otro origen → 403 sin leer la sesión", async () => {
    const { handler, sessionReads } = setup();
    const response = await handler(
      postJson({ current_password: CURRENT, new_password: NEW }, "https://otro-sitio.com"),
    );
    expect(response.status).toBe(403);
    expect((await errorOf(response)).message).toBe("Origen no permitido.");
    expect(sessionReads()).toBe(0);
  });

  it.each([
    ["nueva de 8", "a".repeat(8), 204],
    ["nueva de 128", "a".repeat(128), 204],
    ["nueva de 7", "a".repeat(7), 400],
    ["nueva de 129", "a".repeat(129), 400],
  ])("%s → %i", async (_label, newPassword, status) => {
    const { handler } = setup();
    expect((await handler(postJson({ current_password: CURRENT, new_password: newPassword }))).status).toBe(status);
  });

  it.each([
    ["sin la actual", { new_password: NEW }, "current_password"],
    ["actual vacía", { current_password: "", new_password: NEW }, "current_password"],
    ["actual de 129", { current_password: "a".repeat(129), new_password: NEW }, "current_password"],
    ["sin la nueva", { current_password: CURRENT }, "new_password"],
  ])("%s → 400 con fields", async (_label, body, path) => {
    const { handler } = setup();
    const response = await handler(postJson(body));
    expect(response.status).toBe(400);
    expect((await errorOf(response)).fields?.map((field) => field.path)).toEqual([path]);
  });

  it("un cuerpo que no es JSON → 400", async () => {
    const { handler } = setup();
    expect((await handler(post("no es json"))).status).toBe(400);
  });

  it("el esquema no recorta las contraseñas", () => {
    expect(ChangePasswordInputSchema.parse({ current_password: " a ", new_password: " 12345678 " })).toEqual({
      current_password: " a ",
      new_password: " 12345678 ",
    });
  });
});

describe("F15 · pantalla: comprobaciones y mensajes (regla 4)", () => {
  const form = { current: CURRENT, next: NEW, repeat: NEW };

  it("los textos son los de la spec", () => {
    expect(PASSWORD_MESSAGES).toEqual({
      missingCurrent: "Escribe tu contraseña actual.",
      newLength: "La contraseña nueva debe tener entre 8 y 128 caracteres.",
      mismatch: "Las contraseñas nuevas no coinciden.",
      sameAsCurrent: "La contraseña nueva debe ser distinta de la actual.",
      sessionEnded: "Tu sesión terminó. Vuelve a ingresar.",
      failed: "No se pudo cambiar la contraseña. Intenta de nuevo.",
      changed: "Tu contraseña cambió. Ingresa con la nueva.",
    });
  });

  it("el enlace de la cabecera lleva a /cambiar-contrasena", () => {
    expect(CHANGE_PASSWORD_LINK).toEqual({ href: "/cambiar-contrasena", label: "Cambiar contraseña" });
  });

  it("un formulario bien lleno no tiene problemas", () => {
    expect(passwordProblem(form)).toBeNull();
  });

  it.each([
    ["actual vacía", { ...form, current: "" }, "Escribe tu contraseña actual."],
    [
      "nueva de 7",
      { ...form, next: "1234567", repeat: "1234567" },
      "La contraseña nueva debe tener entre 8 y 128 caracteres.",
    ],
    [
      "nueva de 129",
      { ...form, next: "a".repeat(129), repeat: "a".repeat(129) },
      "La contraseña nueva debe tener entre 8 y 128 caracteres.",
    ],
    ["repetición distinta", { ...form, repeat: "otra-clave-9" }, "Las contraseñas nuevas no coinciden."],
    [
      "nueva igual a la actual",
      { current: CURRENT, next: CURRENT, repeat: CURRENT },
      "La contraseña nueva debe ser distinta de la actual.",
    ],
  ])("%s → «%s»", (_label, input, message) => {
    expect(passwordProblem(input)).toBe(message);
  });

  it("muestra el primer problema en el orden de la regla 4.4", () => {
    expect(passwordProblem({ current: "", next: "1", repeat: "2" })).toBe("Escribe tu contraseña actual.");
    expect(passwordProblem({ current: CURRENT, next: "corta", repeat: "otra" })).toBe(
      "La contraseña nueva debe tener entre 8 y 128 caracteres.",
    );
    expect(passwordProblem({ current: NEW, next: NEW, repeat: "otra-clave-9" })).toBe(
      "Las contraseñas nuevas no coinciden.",
    );
  });

  it("una actual de solo espacios no está vacía (no se recorta)", () => {
    expect(passwordProblem({ ...form, current: "   " })).toBeNull();
  });

  it.each([
    [400, "La contraseña actual no es correcta.", "La contraseña actual no es correcta."],
    [409, "Demasiados intentos. Espera unos minutos.", "Demasiados intentos. Espera unos minutos."],
    [401, "Debes iniciar sesión.", "Tu sesión terminó. Vuelve a ingresar."],
    [400, null, "No se pudo cambiar la contraseña. Intenta de nuevo."],
    [403, "Origen no permitido.", "No se pudo cambiar la contraseña. Intenta de nuevo."],
    [500, "Ocurrió un error inesperado.", "No se pudo cambiar la contraseña. Intenta de nuevo."],
    [0, null, "No se pudo cambiar la contraseña. Intenta de nuevo."],
  ])("respuesta %i con «%s» → «%s»", (status, serverMessage, shown) => {
    expect(passwordFailureMessage(status, serverMessage)).toBe(shown);
  });

  it("/ingresar muestra el aviso solo con ?contrasena=cambiada (regla 4.6)", () => {
    expect(signInNotice("cambiada")).toBe("Tu contraseña cambió. Ingresa con la nueva.");
    expect(signInNotice(undefined)).toBeNull();
    expect(signInNotice("otra")).toBeNull();
    expect(signInNotice(["cambiada", "x"])).toBeNull();
  });
});
