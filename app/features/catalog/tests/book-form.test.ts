import { describe, expect, it } from "vitest";
import { RegisterBookInputSchema } from "../schema";
import {
  BOOK_FORM_MESSAGES,
  bookProblem,
  bookSuccessMessage,
  INITIAL_COPIES,
  toRegisterBookBody,
} from "../ui/book-form-view";

const VALID = { title: "Rayuela", author: "Julio Cortázar", isbn: "978-84-376-0494-7", copies: "3" };

describe("F36 · formulario de libro (regla 2)", () => {
  it("empieza con 1 ejemplar", () => {
    expect(INITIAL_COPIES).toBe("1");
  });

  it("un libro bien escrito no tiene problemas", () => {
    expect(bookProblem(VALID)).toBeNull();
  });

  it("muestra el primer problema, en el orden de la spec", () => {
    expect(bookProblem({ title: "", author: "", isbn: "", copies: "" })).toBe("Escribe el título.");
    expect(bookProblem({ ...VALID, title: "   " })).toBe("Escribe el título.");
    expect(bookProblem({ ...VALID, author: "  ", isbn: "" })).toBe("Escribe el autor.");
    expect(bookProblem({ ...VALID, isbn: "123", copies: "0" })).toBe(BOOK_FORM_MESSAGES.badIsbn);
    expect(BOOK_FORM_MESSAGES.badIsbn).toBe("El ISBN debe tener 13 dígitos, o 10 (el último puede ser X).");
  });

  it.each(["978-84 376-0494-7", "9788437604947", "84-376-0494-x", "843760494X"])("el ISBN %s es válido", (isbn) => {
    expect(bookProblem({ ...VALID, isbn })).toBeNull();
  });

  it.each(["", "123", "97884376049", "978843760494X", "84376049XX"])("el ISBN «%s» no es válido", (isbn) => {
    expect(bookProblem({ ...VALID, isbn })).toBe(BOOK_FORM_MESSAGES.badIsbn);
  });

  it.each(["0", "101", "2,5", "2.5", "", "  ", "abc", "-1"])("los ejemplares «%s» no son válidos", (copies) => {
    expect(bookProblem({ ...VALID, copies })).toBe("Los ejemplares deben ser un número entero de 1 a 100.");
  });

  it.each(["1", "100", " 7 "])("los ejemplares «%s» son válidos", (copies) => {
    expect(bookProblem({ ...VALID, copies })).toBeNull();
  });

  it("arma el cuerpo de POST /api/books con total_copies numérico y válido para F1 (regla 2.3)", () => {
    const body = toRegisterBookBody(VALID);
    expect(body).toEqual({ title: "Rayuela", author: "Julio Cortázar", isbn: "978-84-376-0494-7", total_copies: 3 });
    expect(RegisterBookInputSchema.safeParse(body).success).toBe(true);
  });

  it("el mensaje de éxito dice el título y los ejemplares (regla 2.4)", () => {
    expect(bookSuccessMessage("Rayuela", 3)).toBe("Libro registrado: Rayuela (3 ejemplares).");
    expect(bookSuccessMessage("Ficciones", 1)).toBe("Libro registrado: Ficciones (1 ejemplar).");
  });
});
