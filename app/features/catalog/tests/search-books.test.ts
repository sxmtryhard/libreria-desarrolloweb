import { describe, expect, it } from "vitest";
import { ErrorResponseSchema } from "@/shared/schema";
import { SearchBooksResponseSchema } from "../schema";
import { createBookService } from "../server/book-service";
import type { BookRepository } from "../server/repository";
import { createMemoryBookRepository } from "../server/repository.memory";
import { createSearchBooksHandler } from "../server/search-books-handler";

const CREATED_AT = "2026-11-15T15:00:00.000Z";
const CIEN = "Cien años de soledad";
const AMOR = "El amor en los tiempos del cólera";
const RAYUELA = "Rayuela";

interface Seed {
  title: string;
  author: string;
  isbn: string;
  copies?: number;
}

const EXAMPLE: Seed[] = [
  { title: RAYUELA, author: "Julio Cortázar", isbn: "9788437604947" },
  { title: AMOR, author: "Gabriel García Márquez", isbn: "9780307387264" },
  { title: CIEN, author: "Gabriel García Márquez", isbn: "9780307474728" },
];

async function seed(books: BookRepository, items: Seed[]): Promise<void> {
  for (const item of items) {
    const copies = item.copies ?? 3;
    await books.insertUnique({
      title: item.title,
      author: item.author,
      isbn: item.isbn,
      total_copies: copies,
      available_copies: copies,
      created_at: CREATED_AT,
    });
  }
}

async function setup(items: Seed[]) {
  const books = createMemoryBookRepository();
  await seed(books, items);
  const service = createBookService({ books });
  const handler = createSearchBooksHandler({ service, rethrow: () => undefined });
  return { books, service, handler };
}

function get(query: string): Request {
  return new Request(`http://localhost:3000/api/books${query}`, { method: "GET", headers: { host: "localhost:3000" } });
}

function withQ(q: string): string {
  return `?q=${encodeURIComponent(q)}`;
}

async function titlesOf(response: Response): Promise<string[]> {
  expect(response.status).toBe(200);
  return SearchBooksResponseSchema.parse(await response.json()).books.map((book) => book.title);
}

async function search(items: Seed[], query: string): Promise<string[]> {
  const { handler } = await setup(items);
  return titlesOf(await handler(get(query)));
}

describe("F2 · coincidencia por título o autor (reglas 2, 3 y 4)", () => {
  it("«garcia» encuentra los dos libros de García Márquez, ordenados por título", async () => {
    expect(await search(EXAMPLE, withQ("garcia"))).toEqual([CIEN, AMOR]);
  });

  it("ignora mayúsculas: «RAYU» encuentra Rayuela", async () => {
    expect(await search(EXAMPLE, withQ("RAYU"))).toEqual([RAYUELA]);
  });

  it("ignora tildes del catálogo: «colera» encuentra el título con «cólera»", async () => {
    expect(await search(EXAMPLE, withQ("colera"))).toEqual([AMOR]);
  });

  it("ignora tildes de la búsqueda: «CÓRTAZAR» encuentra Rayuela", async () => {
    expect(await search(EXAMPLE, withQ("CÓRTAZAR"))).toEqual([RAYUELA]);
  });

  it("trata la ñ como n: «anos de» encuentra Cien años de soledad", async () => {
    expect(await search(EXAMPLE, withQ("anos de"))).toEqual([CIEN]);
  });

  it("busca una sola frase: «marquez garcia» no encuentra nada", async () => {
    expect(await search(EXAMPLE, withQ("marquez garcia"))).toEqual([]);
  });

  it("sin coincidencias responde 200 con lista vacía", async () => {
    expect(await search(EXAMPLE, withQ("zzz"))).toEqual([]);
  });

  it("recorta los espacios de los extremos de la búsqueda", async () => {
    expect(await search(EXAMPLE, withQ("  rayuela  "))).toEqual([RAYUELA]);
  });

  it("varios espacios seguidos cuentan como uno", async () => {
    expect(await search(EXAMPLE, withQ("cien    años"))).toEqual([CIEN]);
  });

  it("no busca en el ISBN", async () => {
    expect(await search(EXAMPLE, withQ("9788437604947"))).toEqual([]);
  });

  it.each(["%", "*", ".", ".*"])("trata «%s» como texto normal, no como comodín", async (q) => {
    expect(await search(EXAMPLE, withQ(q))).toEqual([]);
  });

  it("un carácter especial que sí está en el título se encuentra tal cual", async () => {
    const items = [...EXAMPLE, { title: "C++ a fondo", author: "Ana Ruiz", isbn: "9780000000001" }];
    expect(await search(items, withQ("c++"))).toEqual(["C++ a fondo"]);
  });
});

describe("F2 · búsqueda vacía (regla 5)", () => {
  const ALL = [CIEN, AMOR, RAYUELA];

  it.each([
    ["sin q", ""],
    ["q vacío", "?q="],
    ["q de solo espacios", withQ("   ")],
  ])("%s devuelve todos los libros ordenados por título", async (_label, query) => {
    expect(await search(EXAMPLE, query)).toEqual(ALL);
  });

  it("con el catálogo vacío responde 200 con lista vacía", async () => {
    expect(await search([], withQ("rayuela"))).toEqual([]);
    expect(await search([], "")).toEqual([]);
  });
});

describe("F2 · orden (regla 6)", () => {
  it("el orden ignora mayúsculas y tildes: «álgebra» va antes que «Biología»", async () => {
    const items = [
      { title: "Biología", author: "Ana Ruiz", isbn: "9780000000001" },
      { title: "álgebra", author: "Luis Paz", isbn: "9780000000002" },
      { title: "Zoología", author: "Eva Sol", isbn: "9780000000003" },
    ];
    expect(await search(items, "")).toEqual(["álgebra", "Biología", "Zoología"]);
  });

  it("con el mismo título, desempata por autor", async () => {
    const items = [
      { title: "Poesía completa", author: "Zenón Díaz", isbn: "9780000000001" },
      { title: "Poesía completa", author: "Álvaro Mutis", isbn: "9780000000002" },
    ];
    const { handler } = await setup(items);
    const response = await handler(get(""));
    const { books } = SearchBooksResponseSchema.parse(await response.json());
    expect(books.map((book) => book.author)).toEqual(["Álvaro Mutis", "Zenón Díaz"]);
  });

  it("con el mismo título y autor, desempata por id", async () => {
    const items = [
      { title: "Antología", author: "Varios", isbn: "9780000000001" },
      { title: "Antología", author: "Varios", isbn: "9780000000002" },
    ];
    const { handler } = await setup(items);
    const { books } = SearchBooksResponseSchema.parse(await (await handler(get(""))).json());
    const ids = books.map((book) => book.id);
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(2);
  });
});

function numbered(count: number): Seed[] {
  const items: Seed[] = [];
  for (let index = count; index >= 1; index -= 1) {
    const number = String(index).padStart(2, "0");
    items.push({ title: `Libro ${number}`, author: "Autora", isbn: `97800000000${number}` });
  }
  return items;
}

describe("F2 · máximo de resultados (regla 7)", () => {
  it("con 60 libros devuelve exactamente los 50 primeros por título", async () => {
    const titles = await search(numbered(60), "");
    expect(titles).toHaveLength(50);
    expect(titles[0]).toBe("Libro 01");
    expect(titles[49]).toBe("Libro 50");
  });

  it("con exactamente 50 coincidencias devuelve las 50", async () => {
    expect(await search(numbered(50), withQ("libro"))).toHaveLength(50);
  });

  it("con 51 coincidencias devuelve 50", async () => {
    expect(await search(numbered(51), withQ("libro"))).toHaveLength(50);
  });
});

describe("F2 · validación de q (regla 8)", () => {
  it("acepta un q de 100 caracteres", async () => {
    expect(await search(EXAMPLE, withQ("a".repeat(100)))).toEqual([]);
  });

  it("rechaza un q de 101 caracteres con 400 y fields que nombra q", async () => {
    const { handler } = await setup(EXAMPLE);
    const response = await handler(get(withQ("a".repeat(101))));
    expect(response.status).toBe(400);
    const { error } = ErrorResponseSchema.parse(await response.json());
    expect(error.code).toBe("VALIDACION");
    expect(error.fields?.map((field) => field.path)).toContain("q");
  });

  it("los 100 caracteres se cuentan después de recortar", async () => {
    expect(await search(EXAMPLE, withQ(`   ${"a".repeat(100)}   `))).toEqual([]);
  });

  it("si q llega repetido, usa el primero", async () => {
    expect(await search(EXAMPLE, "?q=rayuela&q=garcia")).toEqual([RAYUELA]);
  });
});

describe("F2 · autorización y datos (reglas 9 y Autorización)", () => {
  it("funciona sin sesión ni cabecera de origen, y con cookie da lo mismo", async () => {
    const { handler } = await setup(EXAMPLE);
    const anonymous = await titlesOf(await handler(get(withQ("garcia"))));
    const withCookie = new Request(`http://localhost:3000/api/books${withQ("garcia")}`, {
      headers: { host: "localhost:3000", cookie: "session=cualquiera", origin: "https://otro-sitio.example" },
    });
    expect(await titlesOf(await handler(withCookie))).toEqual(anonymous);
  });

  it("no modifica el catálogo", async () => {
    const { handler, books } = await setup(EXAMPLE);
    await handler(get(withQ("garcia")));
    await handler(get(""));
    expect(await books.count()).toBe(3);
  });

  it("un libro recién registrado con F1 aparece con todos sus ejemplares disponibles", async () => {
    const { handler, service } = await setup([]);
    const session = { uid: "uid-1", email: "bibliotecario@biblioteca.test", role: "BIBLIOTECARIO" as const };
    const input = { title: "Pedro Páramo", author: "Juan Rulfo", isbn: "9788437604183", total_copies: 4 };
    await service.register(session, input, new Date(CREATED_AT));
    const response = await handler(get(withQ("pedro paramo")));
    const { books } = SearchBooksResponseSchema.parse(await response.json());
    expect(books).toHaveLength(1);
    expect(books[0]).toMatchObject({ title: "Pedro Páramo", total_copies: 4, available_copies: 4 });
  });
});
