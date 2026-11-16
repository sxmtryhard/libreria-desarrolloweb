import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ErrorResponseSchema } from "@/shared/schema";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from "@/shared/server/errors";
import { assertSameOrigin, errorToResponse, readJsonBody } from "@/shared/server/http";

async function bodyOf(response: Response) {
  return ErrorResponseSchema.parse(await response.json());
}

function zodErrorWith(input: object, schema: z.ZodType): z.ZodError {
  const result = schema.safeParse(input);
  if (result.success) {
    throw new Error("La entrada debía ser inválida");
  }
  return result.error;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("F0 · errores de dominio → HTTP (reglas 1.1–1.3)", () => {
  it("NotFoundError sin mensaje propio responde 404 con el mensaje por defecto", async () => {
    const response = errorToResponse(new NotFoundError());
    expect(response.status).toBe(404);
    expect(await bodyOf(response)).toEqual({
      error: { code: "NO_ENCONTRADO", message: "No se encontró lo que buscabas." },
    });
  });

  it("ConflictError con mensaje propio responde 409 con ese mensaje", async () => {
    const response = errorToResponse(new ConflictError("El libro ya está prestado."));
    expect(response.status).toBe(409);
    expect(await bodyOf(response)).toEqual({
      error: { code: "CONFLICTO", message: "El libro ya está prestado." },
    });
  });

  it.each([
    [new ValidationError(), 400, "VALIDACION", "Los datos enviados no son válidos."],
    [new UnauthenticatedError(), 401, "NO_AUTENTICADO", "Debes iniciar sesión."],
    [new ForbiddenError(), 403, "NO_AUTORIZADO", "No tienes permiso para hacer esto."],
    [new ConflictError(), 409, "CONFLICTO", "La operación no se puede completar en el estado actual."],
  ])("cada clase tiene su estado, código y mensaje por defecto", async (error, status, code, message) => {
    const response = errorToResponse(error);
    expect(response.status).toBe(status);
    expect(await bodyOf(response)).toEqual({ error: { code, message } });
  });
});

describe("F0 · errores de validación de Zod (regla 1.4)", () => {
  const Schema = z.object({ title: z.string().min(1), copies: z.number().int() });

  it("un ZodError con dos campos inválidos responde 400 con dos entradas en fields", async () => {
    const response = errorToResponse(zodErrorWith({ title: "", copies: "x" }, Schema));
    expect(response.status).toBe(400);
    const body = await bodyOf(response);
    expect(body.error.code).toBe("VALIDACION");
    expect(body.error.fields).toHaveLength(2);
    expect(body.error.fields?.map((field) => field.path).sort()).toEqual(["copies", "title"]);
    for (const field of body.error.fields ?? []) {
      expect(field.message.length).toBeGreaterThan(0);
    }
  });

  it("un ZodError con un campo inválido tiene una sola entrada", async () => {
    const body = await bodyOf(errorToResponse(zodErrorWith({ title: "", copies: 1 }, Schema)));
    expect(body.error.fields).toHaveLength(1);
  });
});

describe("F0 · errores inesperados (regla 1.5)", () => {
  it("responde 500 con el mensaje genérico y sin detalles internos", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = errorToResponse(new Error("connection refused at db.ts:42"));
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain("connection refused");
    expect(text).not.toContain("db.ts");
    expect(ErrorResponseSchema.parse(JSON.parse(text))).toEqual({
      error: { code: "ERROR_INTERNO", message: "Ocurrió un error inesperado." },
    });
    expect(logged).toHaveBeenCalled();
  });

  it("un valor lanzado que no es un Error también responde 500 genérico", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = errorToResponse("texto suelto");
    expect(response.status).toBe(500);
    expect((await bodyOf(response)).error.code).toBe("ERROR_INTERNO");
  });
});

describe("F0 · cuerpo de la petición (regla 1.6)", () => {
  const Schema = z.object({ title: z.string() });

  function post(body: string): Request {
    return new Request("http://localhost:3000/api/x", { method: "POST", body });
  }

  it("un cuerpo que no es JSON se trata como ValidationError", async () => {
    await expect(readJsonBody(post("{no es json"), Schema)).rejects.toBeInstanceOf(ValidationError);
  });

  it("un cuerpo vacío se trata como ValidationError", async () => {
    await expect(readJsonBody(post(""), Schema)).rejects.toBeInstanceOf(ValidationError);
  });

  it("un JSON válido que cumple el esquema se devuelve tipado", async () => {
    expect(await readJsonBody(post('{"title":"Rayuela"}'), Schema)).toEqual({ title: "Rayuela" });
  });

  it("un JSON que no cumple el esquema lanza el ZodError (que se traduce a 400)", async () => {
    await expect(readJsonBody(post('{"title":5}'), Schema)).rejects.toBeInstanceOf(z.ZodError);
  });
});

describe("F0 · validación del origen (reglas 2.1–2.3)", () => {
  function request(method: string, host: string, origin: string | null): Request {
    const headers = new Headers({ host });
    if (origin !== null) {
      headers.set("origin", origin);
    }
    return new Request(`http://${host}/api/x`, { method, headers });
  }

  function expectForbidden(req: Request): void {
    let caught: Error | null = null;
    try {
      assertSameOrigin(req);
    } catch (error) {
      if (error instanceof Error) {
        caught = error;
      }
    }
    expect(caught).toBeInstanceOf(ForbiddenError);
    expect(caught?.message).toBe("Origen no permitido.");
  }

  it("rechaza un POST que viene de otro sitio", () => {
    expectForbidden(request("POST", "biblioteca.app", "https://otro-sitio.com"));
  });

  it("responde 403 NO_AUTORIZADO con el mensaje «Origen no permitido.»", async () => {
    let response = new Response();
    try {
      assertSameOrigin(request("POST", "biblioteca.app", "https://otro-sitio.com"));
    } catch (error) {
      response = errorToResponse(error);
    }
    expect(response.status).toBe(403);
    expect(await bodyOf(response)).toEqual({
      error: { code: "NO_AUTORIZADO", message: "Origen no permitido." },
    });
  });

  it("rechaza un POST sin cabecera Origin", () => {
    expectForbidden(request("POST", "biblioteca.app", null));
  });

  it("acepta un POST cuyo Origin coincide con el Host", () => {
    expect(() => assertSameOrigin(request("POST", "localhost:3000", "http://localhost:3000"))).not.toThrow();
  });

  it.each(["GET", "HEAD", "OPTIONS"])("no valida %s aunque falte Origin", (method) => {
    expect(() => assertSameOrigin(request(method, "biblioteca.app", null))).not.toThrow();
  });

  it.each(["PUT", "PATCH", "DELETE"])("también valida %s", (method) => {
    expectForbidden(request(method, "biblioteca.app", "https://otro-sitio.com"));
  });

  it("rechaza el mismo nombre con otro puerto", () => {
    expectForbidden(request("POST", "localhost:3000", "http://localhost:3001"));
  });

  it("rechaza Origin con el texto «null»", () => {
    expectForbidden(request("POST", "biblioteca.app", "null"));
  });
});
