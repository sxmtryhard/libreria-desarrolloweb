import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { Role, Session } from "@/shared/schema";
import { ErrorResponseSchema } from "@/shared/schema";
import { ConflictError, ForbiddenError, UnauthenticatedError } from "@/shared/server/errors";
import { BookSchema, RegisterBookInputSchema } from "../schema";
import { createBookService } from "../server/book-service";
import { createRegisterBookHandler } from "../server/register-book-handler";
import { createMemoryBookRepository } from "../server/repository.memory";

const NOW = new Date("2026-11-15T15:00:00.000Z");
const VALID = { title: "Rayuela", author: "Julio Cortázar", isbn: "978-84-376-0494-7", total_copies: 3 };

function sessionOf(role: Role): Session {
  return { uid: `uid-${role}`, email: `${role.toLowerCase()}@biblioteca.test`, role };
}

function setup(role: Role | null) {
  const books = createMemoryBookRepository();
  const service = createBookService({ books });
  const handler = createRegisterBookHandler({
    service,
    readSession(): Promise<Session> {
      if (role === null) {
        return Promise.reject(new UnauthenticatedError());
      }
      return Promise.resolve(sessionOf(role));
    },
    now: () => NOW,
    rethrow: () => undefined,
  });
  return { books, service, handler };
}

function post(body: string, origin = "http://localhost:3000"): Request {
  return new Request("http://localhost:3000/api/books", {
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
  const result = RegisterBookInputSchema.safeParse(input);
  if (result.success) {
    return [];
  }
  return result.error.issues.map((issue) => issue.path.map(String).join("."));
}

describe("F1 · registrar un libro (reglas 1, 9 y 10)", () => {
  it("un BIBLIOTECARIO registra un libro y recibe 201 con el libro creado", async () => {
    const { handler, books } = setup("BIBLIOTECARIO");
    const response = await handler(postJson(VALID));
    expect(response.status).toBe(201);
    const book = BookSchema.parse(await response.json());
    expect(book).toMatchObject({
      title: "Rayuela",
      author: "Julio Cortázar",
      isbn: "9788437604947",
      total_copies: 3,
      available_copies: 3,
      created_at: NOW.toISOString(),
    });
    expect(book.id.length).toBeGreaterThan(0);
    expect(await books.count()).toBe(1);
  });

  it("un ADMINISTRADOR también puede registrar", async () => {
    const { handler } = setup("ADMINISTRADOR");
    expect((await handler(postJson(VALID))).status).toBe(201);
  });

  it("los campos extra del cuerpo se ignoran", async () => {
    const { handler } = setup("BIBLIOTECARIO");
    const response = await handler(postJson({ ...VALID, id: "mi-id", available_copies: 99 }));
    const book = BookSchema.parse(await response.json());
    expect(book.id).not.toBe("mi-id");
    expect(book.available_copies).toBe(3);
  });

  it("mismo título y autor con ISBN distinto se acepta", async () => {
    const { handler, books } = setup("BIBLIOTECARIO");
    await handler(postJson(VALID));
    const response = await handler(postJson({ ...VALID, isbn: "9780307474728" }));
    expect(response.status).toBe(201);
    expect(await books.count()).toBe(2);
  });
});

describe("F1 · autorización", () => {
  it.each<Role>(["ESTUDIANTE", "DOCENTE", "EXTERNO"])("un %s recibe 403 y no se crea nada", async (role) => {
    const { handler, books } = setup(role);
    const response = await handler(postJson(VALID));
    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe("NO_AUTORIZADO");
    expect(await books.count()).toBe(0);
  });

  it("sin sesión recibe 401 y no se crea nada", async () => {
    const { handler, books } = setup(null);
    const response = await handler(postJson(VALID));
    expect(response.status).toBe(401);
    expect(await books.count()).toBe(0);
  });

  it("un ESTUDIANTE con cuerpo inválido recibe 403, no 400", async () => {
    const { handler } = setup("ESTUDIANTE");
    expect((await handler(postJson({ title: "" }))).status).toBe(403);
    expect((await handler(post("{no es json"))).status).toBe(403);
  });

  it("sin sesión y con cuerpo inválido recibe 401, no 400", async () => {
    const { handler } = setup(null);
    expect((await handler(postJson({ title: "" }))).status).toBe(401);
  });

  it("un ESTUDIANTE no descubre si un ISBN ya existe: recibe 403, no 409", async () => {
    const { books } = setup("BIBLIOTECARIO");
    const service = createBookService({ books });
    await service.register(sessionOf("BIBLIOTECARIO"), RegisterBookInputSchema.parse(VALID), NOW);
    await expect(
      service.register(sessionOf("ESTUDIANTE"), RegisterBookInputSchema.parse(VALID), NOW),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("un POST desde otro origen recibe 403 «Origen no permitido.» aunque sea BIBLIOTECARIO", async () => {
    const { handler, books } = setup("BIBLIOTECARIO");
    const response = await handler(postJson(VALID, "https://otro-sitio.com"));
    expect(response.status).toBe(403);
    expect((await errorOf(response)).message).toBe("Origen no permitido.");
    expect(await books.count()).toBe(0);
  });
});

describe("F1 · ISBN repetido (regla 7)", () => {
  it("rechaza con 409 el mismo ISBN escrito con otros guiones y no cambia el catálogo", async () => {
    const { handler, books } = setup("BIBLIOTECARIO");
    await handler(postJson(VALID));
    const response = await handler(postJson({ ...VALID, isbn: "978-8437604947", total_copies: 50 }));
    expect(response.status).toBe(409);
    expect(await errorOf(response)).toEqual({ code: "CONFLICTO", message: "Ya existe un libro con ese ISBN." });
    expect(await books.count()).toBe(1);
    const existing = await books.findByIsbn("9788437604947");
    expect(existing?.total_copies).toBe(3);
    expect(existing?.available_copies).toBe(3);
  });

  it("el servicio lanza ConflictError", async () => {
    const { service } = setup("BIBLIOTECARIO");
    const input = RegisterBookInputSchema.parse(VALID);
    await service.register(sessionOf("ADMINISTRADOR"), input, NOW);
    await expect(service.register(sessionOf("ADMINISTRADOR"), input, NOW)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("F1 · validación del cuerpo (reglas 2–6)", () => {
  it("un título de solo espacios responde 400 con fields que nombra title", async () => {
    const { handler, books } = setup("BIBLIOTECARIO");
    const response = await handler(postJson({ ...VALID, title: "   " }));
    expect(response.status).toBe(400);
    const error = await errorOf(response);
    expect(error.code).toBe("VALIDACION");
    expect(error.fields?.map((field) => field.path)).toContain("title");
    expect(await books.count()).toBe(0);
  });

  it("un cuerpo que no es JSON responde 400", async () => {
    const { handler } = setup("BIBLIOTECARIO");
    expect((await handler(post("{no es json"))).status).toBe(400);
  });

  it("recorta los espacios de título y autor", () => {
    const parsed = RegisterBookInputSchema.parse({ ...VALID, title: "  Rayuela  ", author: " Julio Cortázar " });
    expect(parsed.title).toBe("Rayuela");
    expect(parsed.author).toBe("Julio Cortázar");
  });

  it.each([[0], [101], [-1], [2.5], ["3"]])("total_copies %j se rechaza nombrando total_copies", (copies) => {
    expect(fieldPaths({ ...VALID, total_copies: copies })).toContain("total_copies");
  });

  it.each([[1], [100]])("total_copies %j se acepta", (copies) => {
    expect(fieldPaths({ ...VALID, total_copies: copies })).toEqual([]);
  });

  it("título de 200 caracteres se acepta y de 201 se rechaza", () => {
    expect(fieldPaths({ ...VALID, title: "a".repeat(200) })).toEqual([]);
    expect(fieldPaths({ ...VALID, title: "a".repeat(201) })).toContain("title");
  });

  it("autor de 120 caracteres se acepta y de 121 se rechaza", () => {
    expect(fieldPaths({ ...VALID, author: "a".repeat(120) })).toEqual([]);
    expect(fieldPaths({ ...VALID, author: "a".repeat(121) })).toContain("author");
  });

  it.each(["title", "author", "isbn", "total_copies"])("si falta %s se rechaza nombrándolo", (field) => {
    const input = z.record(z.string(), z.union([z.string(), z.number()])).parse({ ...VALID });
    delete input[field];
    expect(fieldPaths(input)).toContain(field);
  });
});

describe("F1 · formato del ISBN (reglas 4 y 5)", () => {
  it("guarda un ISBN-10 con x minúscula como X mayúscula y sin guiones", () => {
    expect(RegisterBookInputSchema.parse({ ...VALID, isbn: "0-306-40615-x" }).isbn).toBe("030640615X");
  });

  it("acepta espacios como separador", () => {
    expect(RegisterBookInputSchema.parse({ ...VALID, isbn: "978 84 376 0494 7" }).isbn).toBe("9788437604947");
  });

  it("no comprueba el dígito verificador (eso es F22)", () => {
    expect(fieldPaths({ ...VALID, isbn: "9788437604940" })).toEqual([]);
  });

  it.each([
    ["12345"],
    ["97884376049A7"],
    ["03064X6152"],
    ["978843760494X"],
    [""],
    ["97884376049471"],
  ])("rechaza %j nombrando isbn", (isbn) => {
    expect(fieldPaths({ ...VALID, isbn })).toContain("isbn");
  });
});
