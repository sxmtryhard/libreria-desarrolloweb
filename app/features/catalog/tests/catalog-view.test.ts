import { describe, expect, it } from "vitest";
import type { Book } from "../schema";
import { availabilityLabel, CATALOG_MESSAGES, countLabel, readCatalogQuery, showsLimitNote } from "../ui/catalog-view";

function book(available: number, total: number): Book {
  return {
    id: "libro-1",
    title: "Rayuela",
    author: "Julio Cortázar",
    isbn: "9788437604947",
    total_copies: total,
    available_copies: available,
    created_at: "2026-11-15T15:00:00.000Z",
  };
}

describe("F33 · catálogo: el texto de búsqueda (reglas 4.2, 4.8 y Bordes)", () => {
  it("sin parámetro la búsqueda es vacía", () => {
    expect(readCatalogQuery(undefined)).toEqual({ q: "", tooLong: false });
  });

  it("se recortan los espacios de los extremos", () => {
    expect(readCatalogQuery("  cortazar ")).toEqual({ q: "cortazar", tooLong: false });
  });

  it("solo espacios se trata como búsqueda vacía", () => {
    expect(readCatalogQuery("    ")).toEqual({ q: "", tooLong: false });
  });

  it("100 caracteres se aceptan", () => {
    expect(readCatalogQuery("a".repeat(100))).toEqual({ q: "a".repeat(100), tooLong: false });
  });

  it("101 caracteres es demasiado largo", () => {
    expect(readCatalogQuery("a".repeat(101)).tooLong).toBe(true);
  });

  it("si el parámetro se repite vale el primero", () => {
    expect(readCatalogQuery(["rayuela", "ficciones"])).toEqual({ q: "rayuela", tooLong: false });
  });

  it("una lista vacía es búsqueda vacía", () => {
    expect(readCatalogQuery([])).toEqual({ q: "", tooLong: false });
  });
});

describe("F33 · catálogo: textos (reglas 4.4–4.8)", () => {
  it("los mensajes son los de la spec", () => {
    expect(CATALOG_MESSAGES.empty).toBe("No se encontraron libros.");
    expect(CATALOG_MESSAGES.limit).toBe("Se muestran los primeros 50. Escribe algo más específico.");
    expect(CATALOG_MESSAGES.tooLong).toBe("La búsqueda no puede tener más de 100 caracteres.");
  });

  it("1 resultado es «1 libro» y varios «N libros»", () => {
    expect(countLabel(1)).toBe("1 libro");
    expect(countLabel(2)).toBe("2 libros");
    expect(countLabel(50)).toBe("50 libros");
  });

  it("la nota del límite sale solo con 50 resultados", () => {
    expect(showsLimitNote(49)).toBe(false);
    expect(showsLimitNote(50)).toBe(true);
    expect(showsLimitNote(0)).toBe(false);
  });

  it("los disponibles se muestran como «N de M disponibles»", () => {
    expect(availabilityLabel(book(2, 3))).toBe("2 de 3 disponibles");
    expect(availabilityLabel(book(0, 4))).toBe("0 de 4 disponibles");
    expect(availabilityLabel(book(1, 1))).toBe("1 de 1 disponibles");
  });
});
