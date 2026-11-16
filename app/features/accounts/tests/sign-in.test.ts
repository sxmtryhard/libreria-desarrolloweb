import { afterEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@/shared/schema";
import { ErrorResponseSchema } from "@/shared/schema";
import { createSessionService, type SessionCookie } from "@/shared/server/session";
import { createFakeAccountRoles, createFakeSessionAuth } from "@/shared/tests/fakes";
import { SignedInSchema, SignInInputSchema } from "../schema";
import { createSignInHandler, createSignOutHandler } from "../server/session-handlers";
import { messageForAuthCode, messageForStatus, prepareCredentials, SIGN_IN_MESSAGES } from "../ui/sign-in-messages";

const NOW = new Date("2026-11-15T10:00:00.000Z");
const GOOD_TOKEN = "token-bueno";
const GOOD_COOKIE = `cookie-de-${GOOD_TOKEN}`;
const ORIGIN = "http://localhost:3000";

interface SetupOptions {
  /** Rol del documento `accounts/{uid}`; `null` = no hay documento. */
  role: Role | null;
  /** Cookie que trae la petición (para cerrar sesión). */
  requestCookie?: string;
  /** Tokens que Firebase rechaza. */
  rejectedTokens?: string[];
  failRevoke?: boolean;
}

function setup(options: SetupOptions) {
  const fake = createFakeSessionAuth();
  const accounts = createFakeAccountRoles();
  const rejected = new Set(options.rejectedTokens ?? []);
  const created: string[] = [];
  const written: SessionCookie[] = [];
  fake.cookies.set(GOOD_COOKIE, { uid: "uid-1", email: "ana@biblioteca.test", issuedAt: NOW });
  if (options.role !== null) {
    accounts.roles.set("uid-1", options.role);
  }
  const sessions = createSessionService({
    auth: {
      createCookie(idToken: string, durationMs: number): Promise<string | null> {
        created.push(idToken);
        if (rejected.has(idToken)) {
          return Promise.resolve(null);
        }
        return fake.createCookie(idToken, durationMs);
      },
      verifyCookie: (cookie: string) => fake.verifyCookie(cookie),
      revoke(uid: string): Promise<void> {
        if (options.failRevoke === true) {
          return Promise.reject(new Error("firebase caído en revoke.ts:9"));
        }
        return fake.revoke(uid);
      },
    },
    accounts,
    isProduction: false,
  });
  function writeCookie(cookie: SessionCookie): Promise<void> {
    written.push(cookie);
    return Promise.resolve();
  }
  const signIn = createSignInHandler({ sessions, writeCookie, now: () => NOW, rethrow: () => undefined });
  const signOut = createSignOutHandler({
    sessions,
    writeCookie,
    readCookieValue: () => Promise.resolve(options.requestCookie),
    rethrow: () => undefined,
  });
  return { fake, created, written, signIn, signOut };
}

function request(method: string, body: string | undefined, origin: string | null = ORIGIN): Request {
  const headers = new Headers({ host: "localhost:3000", "content-type": "application/json" });
  if (origin !== null) {
    headers.set("origin", origin);
  }
  return new Request("http://localhost:3000/api/session", { method, headers, body });
}

function post(body: object, origin?: string | null): Request {
  return request("POST", JSON.stringify(body), origin);
}

async function errorOf(response: Response) {
  return ErrorResponseSchema.parse(await response.json()).error;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("F4 · POST /api/session (reglas 1.3–1.6 y 1.9)", () => {
  it("un token válido de una cuenta ESTUDIANTE responde 200 con uid, email y role y deja la cookie de 8 horas", async () => {
    const { signIn, written } = setup({ role: "ESTUDIANTE" });
    const response = await signIn(post({ id_token: GOOD_TOKEN }));
    expect(response.status).toBe(200);
    const body = SignedInSchema.parse(await response.json());
    expect(body).toEqual({ uid: "uid-1", email: "ana@biblioteca.test", role: "ESTUDIANTE" });
    expect(written).toHaveLength(1);
    expect(written[0]?.name).toBe("session");
    expect(written[0]?.value).toBe(GOOD_COOKIE);
    expect(written[0]?.options.maxAge).toBe(28_800);
    expect(written[0]?.options.httpOnly).toBe(true);
  });

  it.each<Role>([
    "EXTERNO",
    "DOCENTE",
    "BIBLIOTECARIO",
    "ADMINISTRADOR",
  ])("el rol %s también puede ingresar", async (role) => {
    const { signIn } = setup({ role });
    const response = await signIn(post({ id_token: GOOD_TOKEN }));
    expect(response.status).toBe(200);
    expect(SignedInSchema.parse(await response.json()).role).toBe(role);
  });

  it("la respuesta solo trae uid, email y role", async () => {
    const { signIn } = setup({ role: "DOCENTE" });
    const response = await signIn(post({ id_token: GOOD_TOKEN }));
    const text = await response.text();
    expect(text).not.toContain(GOOD_TOKEN);
    expect(Object.keys(SignedInSchema.parse(JSON.parse(text))).sort()).toEqual(["email", "role", "uid"]);
  });

  it("un token inválido responde 401 NO_AUTENTICADO y no deja cookie", async () => {
    const { signIn, written } = setup({ role: "ESTUDIANTE", rejectedTokens: ["token-malo"] });
    const response = await signIn(post({ id_token: "token-malo" }));
    expect(response.status).toBe(401);
    expect((await errorOf(response)).code).toBe("NO_AUTENTICADO");
    expect(written).toHaveLength(0);
  });

  it("un token válido de un usuario sin documento de cuenta responde 401 y no deja cookie", async () => {
    const { signIn, written } = setup({ role: null });
    const response = await signIn(post({ id_token: GOOD_TOKEN }));
    expect(response.status).toBe(401);
    expect((await errorOf(response)).code).toBe("NO_AUTENTICADO");
    expect(written).toHaveLength(0);
  });

  it("no exige sesión previa y con una sesión abierta la cookie nueva reemplaza a la anterior", async () => {
    const { signIn, written } = setup({ role: "ESTUDIANTE", requestCookie: "cookie-vieja" });
    const response = await signIn(post({ id_token: GOOD_TOKEN }));
    expect(response.status).toBe(200);
    expect(written.map((cookie) => cookie.value)).toEqual([GOOD_COOKIE]);
  });

  it("la identidad sale del token: un uid o correo en el cuerpo se ignora", async () => {
    const { signIn } = setup({ role: "ESTUDIANTE" });
    const response = await signIn(
      post({ id_token: GOOD_TOKEN, uid: "uid-de-otro", email: "otro@biblioteca.test", role: "ADMINISTRADOR" }),
    );
    expect(SignedInSchema.parse(await response.json())).toEqual({
      uid: "uid-1",
      email: "ana@biblioteca.test",
      role: "ESTUDIANTE",
    });
  });
});

describe("F4 · POST /api/session: validación y origen (reglas 1.6 y 2.1)", () => {
  it("sin id_token responde 400 VALIDACION con fields id_token", async () => {
    const { signIn, created } = setup({ role: "ESTUDIANTE" });
    const response = await signIn(post({}));
    expect(response.status).toBe(400);
    const error = await errorOf(response);
    expect(error.code).toBe("VALIDACION");
    expect(error.fields?.map((field) => field.path)).toEqual(["id_token"]);
    expect(created).toHaveLength(0);
  });

  it.each([
    ["vacío", ""],
    ["de 4097 caracteres", "a".repeat(4097)],
    ["numérico", 12345],
    ["null", null],
  ])("id_token %s responde 400", async (_label, value) => {
    const { signIn, written } = setup({ role: "ESTUDIANTE" });
    const response = await signIn(post({ id_token: value }));
    expect(response.status).toBe(400);
    expect((await errorOf(response)).fields?.map((field) => field.path)).toEqual(["id_token"]);
    expect(written).toHaveLength(0);
  });

  it("id_token de 4096 caracteres pasa la validación y se intenta verificar", async () => {
    const long = "a".repeat(4096);
    expect(SignInInputSchema.safeParse({ id_token: long }).success).toBe(true);
    const { signIn, created } = setup({ role: "ESTUDIANTE", rejectedTokens: [long] });
    const response = await signIn(post({ id_token: long }));
    expect(response.status).toBe(401);
    expect(created).toEqual([long]);
  });

  it("un cuerpo que no es JSON responde 400", async () => {
    const { signIn } = setup({ role: "ESTUDIANTE" });
    const response = await signIn(request("POST", "esto no es json"));
    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe("VALIDACION");
  });

  it("desde otro origen responde 403 y no se mira el token", async () => {
    const { signIn, created, written } = setup({ role: "ESTUDIANTE" });
    const response = await signIn(post({ id_token: GOOD_TOKEN }, "https://otro-sitio.com"));
    expect(response.status).toBe(403);
    const error = await errorOf(response);
    expect(error.code).toBe("NO_AUTORIZADO");
    expect(error.message).toBe("Origen no permitido.");
    expect(created).toHaveLength(0);
    expect(written).toHaveLength(0);
  });

  it("el origen se valida antes que el cuerpo", async () => {
    const { signIn } = setup({ role: "ESTUDIANTE" });
    const response = await signIn(request("POST", "esto no es json", "https://otro-sitio.com"));
    expect(response.status).toBe(403);
  });
});

describe("F4 · DELETE /api/session (regla 4)", () => {
  it("con sesión válida responde 204 sin cuerpo, borra la cookie y revoca los tokens", async () => {
    const { signOut, written, fake } = setup({ role: "ESTUDIANTE", requestCookie: GOOD_COOKIE });
    const response = await signOut(request("DELETE", undefined));
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(written).toHaveLength(1);
    expect(written[0]?.name).toBe("session");
    expect(written[0]?.options.maxAge).toBe(0);
    expect(fake.revoked).toEqual(["uid-1"]);
  });

  it("sin cookie responde 204, borra la cookie y no revoca nada", async () => {
    const { signOut, written, fake } = setup({ role: "ESTUDIANTE" });
    const response = await signOut(request("DELETE", undefined));
    expect(response.status).toBe(204);
    expect(written[0]?.options.maxAge).toBe(0);
    expect(fake.revoked).toEqual([]);
  });

  it("con una cookie que ya no es válida responde 204 y no revoca nada", async () => {
    const { signOut, written, fake } = setup({ role: "ESTUDIANTE", requestCookie: "cookie-vencida" });
    const response = await signOut(request("DELETE", undefined));
    expect(response.status).toBe(204);
    expect(written[0]?.options.maxAge).toBe(0);
    expect(fake.revoked).toEqual([]);
  });

  it("dos veces seguidas responde 204 las dos", async () => {
    const { signOut } = setup({ role: "ESTUDIANTE", requestCookie: GOOD_COOKIE });
    expect((await signOut(request("DELETE", undefined))).status).toBe(204);
    expect((await signOut(request("DELETE", undefined))).status).toBe(204);
  });

  it("sin cabecera Origin responde 403 y la sesión sigue abierta", async () => {
    const { signOut, written, fake } = setup({ role: "ESTUDIANTE", requestCookie: GOOD_COOKIE });
    const response = await signOut(request("DELETE", undefined, null));
    expect(response.status).toBe(403);
    expect(written).toHaveLength(0);
    expect(fake.revoked).toEqual([]);
  });

  it("si falla la revocación responde 500 genérico y la cookie no se borra", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { signOut, written } = setup({ role: "ESTUDIANTE", requestCookie: GOOD_COOKIE, failRevoke: true });
    const response = await signOut(request("DELETE", undefined));
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain("revoke.ts");
    expect(ErrorResponseSchema.parse(JSON.parse(text)).error.code).toBe("ERROR_INTERNO");
    expect(written).toHaveLength(0);
  });
});

describe("F4 · formulario: validación y mensajes (regla 2)", () => {
  it("los textos son los de la spec", () => {
    expect(SIGN_IN_MESSAGES.missing).toBe("Escribe tu correo y tu contraseña.");
    expect(SIGN_IN_MESSAGES.invalid).toBe("Correo o contraseña incorrectos.");
    expect(SIGN_IN_MESSAGES.tooMany).toBe("Demasiados intentos. Intenta de nuevo más tarde.");
    expect(SIGN_IN_MESSAGES.failed).toBe("No se pudo ingresar. Intenta de nuevo.");
  });

  it("al correo se le quitan los espacios de los extremos y la contraseña no se toca", () => {
    expect(prepareCredentials("  ana@x.test ", "  clave con espacios  ")).toEqual({
      email: "ana@x.test",
      password: "  clave con espacios  ",
    });
  });

  it.each([
    ["sin correo", "", "clave-1234"],
    ["correo de solo espacios", "   ", "clave-1234"],
    ["sin contraseña", "ana@x.test", ""],
    ["sin nada", "", ""],
  ])("%s → no se puede enviar", (_label, email, password) => {
    expect(prepareCredentials(email, password)).toBeNull();
  });

  it("una contraseña de solo espacios se envía tal cual", () => {
    expect(prepareCredentials("ana@x.test", "   ")).toEqual({ email: "ana@x.test", password: "   " });
  });

  it.each([
    "auth/invalid-credential",
    "auth/user-not-found",
    "auth/wrong-password",
    "auth/invalid-email",
  ])("%s muestra el mismo mensaje genérico", (code) => {
    expect(messageForAuthCode(code)).toBe("Correo o contraseña incorrectos.");
  });

  it("el bloqueo de Firebase por demasiados intentos tiene su mensaje", () => {
    expect(messageForAuthCode("auth/too-many-requests")).toBe("Demasiados intentos. Intenta de nuevo más tarde.");
  });

  it.each(["auth/network-request-failed", "auth/internal-error", "otro"])("%s muestra el mensaje de fallo", (code) => {
    expect(messageForAuthCode(code)).toBe("No se pudo ingresar. Intenta de nuevo.");
  });

  it("un 401 del servidor muestra el mensaje genérico de credenciales", () => {
    expect(messageForStatus(401)).toBe("Correo o contraseña incorrectos.");
  });

  it.each([400, 403, 500, 503])("un %i del servidor muestra el mensaje de fallo", (status) => {
    expect(messageForStatus(status)).toBe("No se pudo ingresar. Intenta de nuevo.");
  });
});
