import { describe, expect, it } from "vitest";
import type { Role, Session } from "@/shared/schema";
import { ForbiddenError } from "@/shared/server/errors";
import { type MyLoan, MyLoansResponseSchema } from "../schema";
import { createMyLoansService } from "../server/my-loans-service";
import { createMemoryBookCatalog, createMemoryLoanRepository } from "../server/repository.memory";
import {
  daysLateLabel,
  loanCountLabel,
  loanStatusLabel,
  MY_LOANS_MESSAGES,
  myLoanTitle,
  showsOverdueWarning,
} from "../ui/my-loans-view";

const NOW = new Date("2026-11-16T12:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const ANA: Session = { uid: "uid-ana", email: "ana@correo.test", role: "ESTUDIANTE" };
const LUIS: Session = { uid: "uid-luis", email: "luis@correo.test", role: "DOCENTE" };

function fromNowIso(ms: number): string {
  return new Date(NOW.getTime() + ms).toISOString();
}

function setup() {
  const loans = createMemoryLoanRepository();
  const books = createMemoryBookCatalog();
  books.add("rayuela", "Rayuela", "Julio Cortázar");
  books.add("ficciones", "Ficciones", "Jorge Luis Borges");
  const service = createMyLoansService({ loans, books });
  /** Préstamo que vence dentro de `dueInMs` (negativo = ya venció). */
  function seed(bookId: string, dueInMs: number, borrowerUid = "uid-ana", returned = false) {
    let returnedAt: string | null = null;
    if (returned) {
      returnedAt = fromNowIso(-HOUR_MS);
    }
    return loans.seedLoan({
      book_id: bookId,
      borrower_uid: borrowerUid,
      lent_by_uid: "uid-staff",
      loaned_at: fromNowIso(dueInMs - 14 * DAY_MS),
      due_at: fromNowIso(dueInMs),
      returned_at: returnedAt,
    });
  }
  return { service, seed, loans };
}

function myLoan(dueInMs: number): MyLoan {
  return {
    loan_id: "loan-1",
    book_id: "rayuela",
    book_title: "Rayuela",
    book_author: "Julio Cortázar",
    loaned_at: fromNowIso(dueInMs - 14 * DAY_MS),
    due_at: fromNowIso(dueInMs),
    overdue: dueInMs < 0,
  };
}

describe("F35 · mis préstamos: la lista (regla 2)", () => {
  it("trae los activos de la persona con libro, fechas y si está vencido", async () => {
    const { service, seed } = setup();
    const loan = seed("rayuela", 3.5 * DAY_MS);
    const body = MyLoansResponseSchema.parse(await service.listActive(ANA, NOW));
    expect(body).toEqual({
      loans: [
        {
          loan_id: loan.id,
          book_id: "rayuela",
          book_title: "Rayuela",
          book_author: "Julio Cortázar",
          loaned_at: loan.loaned_at,
          due_at: loan.due_at,
          overdue: false,
        },
      ],
    });
  });

  it("el que vence antes sale primero", async () => {
    const { service, seed } = setup();
    seed("ficciones", 10 * DAY_MS);
    seed("rayuela", 3.5 * DAY_MS);
    const body = await service.listActive(ANA, NOW);
    expect(body.loans.map((loan) => loan.book_title)).toEqual(["Rayuela", "Ficciones"]);
  });

  it("un vencido sale primero y marcado como vencido", async () => {
    const { service, seed } = setup();
    seed("ficciones", 5 * DAY_MS);
    seed("rayuela", -2 * DAY_MS);
    const body = await service.listActive(ANA, NOW);
    expect(body.loans.map((loan) => [loan.book_id, loan.overdue])).toEqual([
      ["rayuela", true],
      ["ficciones", false],
    ]);
  });

  it("los devueltos no aparecen", async () => {
    const { service, seed } = setup();
    seed("rayuela", 5 * DAY_MS, "uid-ana", true);
    expect((await service.listActive(ANA, NOW)).loans).toEqual([]);
  });

  it("sin préstamos la lista está vacía", async () => {
    const { service } = setup();
    expect(await service.listActive(ANA, NOW)).toEqual({ loans: [] });
  });

  it("cada persona ve solo los suyos", async () => {
    const { service, seed } = setup();
    seed("rayuela", 5 * DAY_MS, "uid-ana");
    seed("ficciones", 5 * DAY_MS, "uid-luis");
    expect((await service.listActive(LUIS, NOW)).loans.map((loan) => loan.book_id)).toEqual(["ficciones"]);
    expect((await service.listActive(ANA, NOW)).loans.map((loan) => loan.book_id)).toEqual(["rayuela"]);
  });

  it("el que vence exactamente ahora no está vencido; un milisegundo después sí", async () => {
    const { service, seed } = setup();
    seed("rayuela", 0);
    seed("ficciones", -1);
    const body = await service.listActive(ANA, NOW);
    expect(body.loans.map((loan) => [loan.book_id, loan.overdue])).toEqual([
      ["ficciones", true],
      ["rayuela", false],
    ]);
  });

  it("a igual vencimiento se ordena por identificador", async () => {
    const { service, seed } = setup();
    const first = seed("rayuela", DAY_MS);
    const second = seed("ficciones", DAY_MS);
    const body = await service.listActive(ANA, NOW);
    expect(body.loans.map((loan) => loan.loan_id)).toEqual([first.id, second.id].sort());
  });

  it("si el libro ya no existe, título y autor van en null", async () => {
    const { service, seed } = setup();
    seed("libro-borrado", DAY_MS);
    const body = await service.listActive(ANA, NOW);
    expect(body.loans[0]).toMatchObject({ book_title: null, book_author: null });
  });

  it.each<Role>(["BIBLIOTECARIO", "ADMINISTRADOR"])("un %s no tiene «mis préstamos»", async (role) => {
    const { service } = setup();
    const session: Session = { uid: "uid-staff", email: "staff@biblioteca.test", role };
    await expect(service.listActive(session, NOW)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("consultar no cambia ningún dato", async () => {
    const { service, seed, loans } = setup();
    seed("rayuela", DAY_MS);
    const before = JSON.stringify(loans.all());
    await service.listActive(ANA, NOW);
    expect(JSON.stringify(loans.all())).toBe(before);
  });
});

describe("F35 · estado de cada préstamo (regla 2.4 y Bordes)", () => {
  it.each([
    ["faltan 3 días y medio", 3.5 * DAY_MS, "Vence en 3 días"],
    ["faltan 10 días", 10 * DAY_MS, "Vence en 10 días"],
    ["faltan exactamente 24 horas", DAY_MS, "Vence en 1 día"],
    ["falta un milisegundo menos de 24 horas", DAY_MS - 1, "Vence hoy"],
    ["faltan 5 horas", 5 * HOUR_MS, "Vence hoy"],
    ["vence exactamente ahora", 0, "Vence hoy"],
    ["venció hace un milisegundo", -1, "Vencido"],
    ["venció hace 4 días", -4 * DAY_MS, "Vencido"],
  ])("%s → «%s»", (_label, dueInMs, text) => {
    expect(loanStatusLabel(myLoan(dueInMs), NOW)).toBe(text);
  });
});

describe("F35 · textos (reglas 1.4, 2.5–2.8 y 3)", () => {
  it("son los de la spec", () => {
    expect(MY_LOANS_MESSAGES.noLoans).toBe("No tienes libros prestados.");
    expect(MY_LOANS_MESSAGES.noOverdue).toBe("No tienes préstamos vencidos.");
    expect(MY_LOANS_MESSAGES.overdueWarning).toBe("Tienes préstamos vencidos.");
    expect(MY_LOANS_MESSAGES.returnAtDesk).toBe("Devuelve los libros en el mostrador de la biblioteca.");
    expect(MY_LOANS_MESSAGES.staffOnly).toBe("Esta pantalla es para quienes piden libros prestados.");
  });

  it("1 préstamo va en singular y varios en plural", () => {
    expect(loanCountLabel(1)).toBe("Tienes 1 libro prestado.");
    expect(loanCountLabel(2)).toBe("Tienes 2 libros prestados.");
    expect(loanCountLabel(5)).toBe("Tienes 5 libros prestados.");
  });

  it("los días de retraso van en singular o plural", () => {
    expect(daysLateLabel(1)).toBe("1 día de retraso");
    expect(daysLateLabel(3)).toBe("3 días de retraso");
    expect(daysLateLabel(45)).toBe("45 días de retraso");
  });

  it("el aviso de vencidos sale solo si alguno está vencido", () => {
    expect(showsOverdueWarning([myLoan(DAY_MS), myLoan(-DAY_MS)])).toBe(true);
    expect(showsOverdueWarning([myLoan(DAY_MS)])).toBe(false);
    expect(showsOverdueWarning([])).toBe(false);
  });

  it("un libro retirado se muestra como «Libro retirado»", () => {
    expect(myLoanTitle({ book_title: "Rayuela" })).toBe("Rayuela");
    expect(myLoanTitle({ book_title: null })).toBe("Libro retirado");
  });
});
