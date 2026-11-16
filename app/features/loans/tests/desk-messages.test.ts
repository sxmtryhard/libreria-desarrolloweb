import { describe, expect, it } from "vitest";
import type { Loan, OverdueLoan } from "../schema";
import {
  DESK_MESSAGES,
  failureMessage,
  formatDateTime,
  formatPesos,
  lendSuccessMessage,
  overdueBookTitle,
  readyToAct,
  returnSuccessMessage,
} from "../ui/desk-messages";

const LOAN: Loan = {
  id: "loan-1",
  book_id: "libro-1",
  borrower_uid: "uid-ana",
  lent_by_uid: "uid-staff",
  loaned_at: "2026-11-15T10:00:00.000Z",
  due_at: "2026-11-29T10:00:00.000Z",
  returned_at: null,
};

function returned(daysLate: number, fineAmount: number) {
  return {
    loan: { ...LOAN, returned_at: "2026-12-02T10:00:00.000Z" },
    returned_late: daysLate > 0,
    days_late: daysLate,
    fine_amount: fineAmount,
  };
}

describe("F34 · textos fijos (reglas 1.3, 2.3, 2.4, 3.3, 4.2 y 4.6)", () => {
  it("son los de la spec", () => {
    expect(DESK_MESSAGES.forbiddenScreen).toBe("No tienes permiso para ver esta pantalla.");
    expect(DESK_MESSAGES.noOverdue).toBe("No tiene préstamos vencidos.");
    expect(DESK_MESSAGES.missingEmail).toBe("Escribe el correo de la persona.");
    expect(DESK_MESSAGES.noBooks).toBe("No se encontraron libros.");
    expect(DESK_MESSAGES.missingData).toBe("Escribe el correo de la persona y elige un libro.");
    expect(DESK_MESSAGES.returnedOnTime).toBe("Devolución registrada a tiempo.");
  });
});

describe("F34 · formato (regla 5)", () => {
  it("las fechas van en español con día, mes, año y hora", () => {
    expect(formatDateTime("2026-11-29T10:00:00.000Z", "UTC")).toBe("29 de noviembre de 2026, 10:00");
  });

  it("la fecha se muestra en la zona horaria indicada", () => {
    expect(formatDateTime("2026-11-29T10:00:00.000Z", "America/Bogota")).toBe("29 de noviembre de 2026, 5:00");
  });

  it.each([
    [0, "0 pesos"],
    [1000, "1.000 pesos"],
    [3000, "3.000 pesos"],
    [12_000, "12.000 pesos"],
    [30_000, "30.000 pesos"],
    [1_250_000, "1.250.000 pesos"],
  ])("%i se muestra como «%s»", (amount, text) => {
    expect(formatPesos(amount)).toBe(text);
  });
});

describe("F34 · mensajes de éxito (reglas 4.3 y 4.4)", () => {
  it("prestar: «Préstamo registrado. Vence el <fecha>.»", () => {
    expect(lendSuccessMessage(LOAN, "UTC")).toBe("Préstamo registrado. Vence el 29 de noviembre de 2026, 10:00.");
  });

  it("devolver a tiempo", () => {
    expect(returnSuccessMessage(returned(0, 0))).toBe("Devolución registrada a tiempo.");
  });

  it("devolver con 3 días de retraso", () => {
    expect(returnSuccessMessage(returned(3, 3000))).toBe(
      "Devolución registrada con 3 días de retraso. Multa: 3.000 pesos.",
    );
  });

  it("devolver con 1 día de retraso va en singular", () => {
    expect(returnSuccessMessage(returned(1, 1000))).toBe(
      "Devolución registrada con 1 día de retraso. Multa: 1.000 pesos.",
    );
  });

  it("devolver con la multa en el tope", () => {
    expect(returnSuccessMessage(returned(45, 30_000))).toBe(
      "Devolución registrada con 45 días de retraso. Multa: 30.000 pesos.",
    );
  });
});

describe("F34 · mensajes de fallo (reglas 4.5 y 4.6)", () => {
  it.each([404, 409])("con %i se muestra el mensaje del servidor tal cual", (status) => {
    expect(failureMessage(status, "La persona ya alcanzó su límite de préstamos.")).toBe(
      "La persona ya alcanzó su límite de préstamos.",
    );
  });

  it("con 404 o 409 sin mensaje legible se usa el genérico", () => {
    expect(failureMessage(409, null)).toBe("No se pudo completar la operación. Intenta de nuevo.");
  });

  it("400 pide revisar el correo, diga lo que diga el servidor", () => {
    expect(failureMessage(400, "Los datos enviados no son válidos.")).toBe("Revisa el correo de la persona.");
  });

  it("401 avisa de que la sesión terminó", () => {
    expect(failureMessage(401, "Debes iniciar sesión.")).toBe("Tu sesión terminó. Vuelve a ingresar.");
  });

  it("403 avisa de que no hay permiso", () => {
    expect(failureMessage(403, "Origen no permitido.")).toBe("No tienes permiso para hacer esto.");
  });

  it.each([500, 503, 0])("cualquier otro (%i) muestra el genérico y no el detalle del servidor", (status) => {
    expect(failureMessage(status, "Ocurrió un error inesperado.")).toBe(
      "No se pudo completar la operación. Intenta de nuevo.",
    );
  });
});

describe("F34 · cuándo se puede prestar o devolver (regla 4.2)", () => {
  it("hace falta correo y libro", () => {
    expect(readyToAct("ana@correo.test", "libro-1")).toEqual({ book_id: "libro-1", borrower_email: "ana@correo.test" });
  });

  it("el correo se recorta", () => {
    expect(readyToAct("  ana@correo.test ", "libro-1")?.borrower_email).toBe("ana@correo.test");
  });

  it.each([
    ["sin correo", "", "libro-1"],
    ["correo de solo espacios", "   ", "libro-1"],
    ["sin libro", "ana@correo.test", null],
    ["sin nada", "", null],
  ])("%s → no se puede", (_label, email, bookId) => {
    expect(readyToAct(email, bookId)).toBeNull();
  });
});

describe("F34 · vencidos (regla 2.2 y Bordes)", () => {
  const overdue: OverdueLoan = {
    loan_id: "loan-1",
    book_id: "libro-1",
    book_title: "Rayuela",
    book_author: "Julio Cortázar",
    loaned_at: "2026-11-01T10:00:00.000Z",
    due_at: "2026-11-15T10:00:00.000Z",
    days_late: 3,
    fine_amount: 3000,
  };

  it("se muestra el título del libro", () => {
    expect(overdueBookTitle(overdue)).toBe("Rayuela");
  });

  it("un libro que ya no existe se muestra como «Libro retirado»", () => {
    expect(overdueBookTitle({ ...overdue, book_title: null, book_author: null })).toBe("Libro retirado");
  });
});
