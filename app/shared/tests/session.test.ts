import { describe, expect, it } from "vitest";
import type { Session } from "@/shared/schema";
import { ForbiddenError, UnauthenticatedError } from "@/shared/server/errors";
import { createSessionService, requireRole } from "@/shared/server/session";
import { createFakeAccountRoles, createFakeSessionAuth } from "./fakes";

const ISSUED_AT = new Date("2026-11-15T08:00:00.000Z");
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

function setup(isProduction = false) {
  const auth = createFakeSessionAuth();
  const accounts = createFakeAccountRoles();
  const service = createSessionService({ auth, accounts, isProduction });
  return { auth, accounts, service };
}

function after(ms: number): Date {
  return new Date(ISSUED_AT.getTime() + ms);
}

describe("F0 · verificar la sesión (reglas 3.4 y 3.5)", () => {
  it("sin cookie lanza UnauthenticatedError", async () => {
    const { service } = setup();
    await expect(service.verify(undefined, after(0))).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("con cookie vacía lanza UnauthenticatedError", async () => {
    const { service } = setup();
    await expect(service.verify("", after(0))).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("una cookie válida con cuenta devuelve uid, email y el rol de la cuenta", async () => {
    const { auth, accounts, service } = setup();
    auth.cookies.set("c1", { uid: "u1", email: "biblio@biblioteca.test", issuedAt: ISSUED_AT });
    accounts.roles.set("u1", "BIBLIOTECARIO");
    expect(await service.verify("c1", after(60_000))).toEqual({
      uid: "u1",
      email: "biblio@biblioteca.test",
      role: "BIBLIOTECARIO",
    });
  });

  it("una cookie válida sin documento de cuenta lanza UnauthenticatedError", async () => {
    const { auth, service } = setup();
    auth.cookies.set("c1", { uid: "u1", email: "x@biblioteca.test", issuedAt: ISSUED_AT });
    await expect(service.verify("c1", after(60_000))).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("una cookie inválida, vencida o revocada (el proveedor no la reconoce) lanza UnauthenticatedError", async () => {
    const { accounts, service } = setup();
    accounts.roles.set("u1", "ESTUDIANTE");
    await expect(service.verify("desconocida", after(0))).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});

describe("F0 · duración de 8 horas (regla 3.2)", () => {
  it("es válida a las 7 h 59 min", async () => {
    const { auth, accounts, service } = setup();
    auth.cookies.set("c1", { uid: "u1", email: "x@biblioteca.test", issuedAt: ISSUED_AT });
    accounts.roles.set("u1", "ESTUDIANTE");
    const session = await service.verify("c1", after(EIGHT_HOURS_MS - 60_000));
    expect(session.role).toBe("ESTUDIANTE");
  });

  it("no es válida a las 8 horas exactas", async () => {
    const { auth, accounts, service } = setup();
    auth.cookies.set("c1", { uid: "u1", email: "x@biblioteca.test", issuedAt: ISSUED_AT });
    accounts.roles.set("u1", "ESTUDIANTE");
    await expect(service.verify("c1", after(EIGHT_HOURS_MS))).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});

describe("F0 · cookie de sesión (regla 3.3)", () => {
  it("en producción lleva HttpOnly, Secure, SameSite=Lax, Path=/ y Max-Age=28800", async () => {
    const { auth, service } = setup(true);
    const cookie = await service.create("token-1");
    expect(cookie.name).toBe("session");
    expect(cookie.value).toBe("cookie-de-token-1");
    expect(cookie.options).toEqual({ httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 28_800 });
    expect(auth.requestedDurations).toEqual([EIGHT_HOURS_MS]);
  });

  it("fuera de producción no lleva Secure", async () => {
    const { service } = setup(false);
    const cookie = await service.create("token-1");
    expect(cookie.options.secure).toBe(false);
    expect(cookie.options.httpOnly).toBe(true);
  });
});

describe("F0 · cerrar sesión (regla 3.6)", () => {
  it("borra la cookie (Max-Age=0) y revoca los tokens del usuario", async () => {
    const { auth, service } = setup();
    auth.cookies.set("c1", { uid: "u1", email: "x@biblioteca.test", issuedAt: ISSUED_AT });
    const cookie = await service.close("c1");
    expect(cookie.name).toBe("session");
    expect(cookie.value).toBe("");
    expect(cookie.options.maxAge).toBe(0);
    expect(auth.revoked).toEqual(["u1"]);
  });

  it("sin cookie o con cookie desconocida borra la cookie y no revoca nada", async () => {
    const { auth, service } = setup();
    expect((await service.close(undefined)).options.maxAge).toBe(0);
    expect((await service.close("desconocida")).options.maxAge).toBe(0);
    expect(auth.revoked).toEqual([]);
  });
});

describe("F0 · requireRole (regla 3.7)", () => {
  const student: Session = { uid: "u1", email: "x@biblioteca.test", role: "ESTUDIANTE" };

  it("lanza ForbiddenError si el rol no está en la lista", () => {
    expect(() => requireRole(student, ["BIBLIOTECARIO", "ADMINISTRADOR"])).toThrow(ForbiddenError);
  });

  it("no lanza si el rol está en la lista", () => {
    expect(() => requireRole(student, ["ESTUDIANTE", "DOCENTE"])).not.toThrow();
  });

  it("con lista vacía lanza ForbiddenError para cualquier sesión", () => {
    expect(() => requireRole(student, [])).toThrow(ForbiddenError);
  });
});
