import { describe, expect, it } from "vitest";
import type { Role, Session } from "@/shared/schema";
import { type Loan, LoanFineSchema, ReturnedLoanSchema } from "../schema";
import { calculateFine } from "../server/fine";
import { createLoanService } from "../server/loan-service";
import { createMemoryBorrowerDirectory, createMemoryLoanRepository } from "../server/repository.memory";
import { createReturnBookHandler } from "../server/return-book-handler";

const DUE_AT = "2026-11-29T15:00:00.000Z";
const DUE_MS = new Date(DUE_AT).getTime();
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function afterDue(ms: number): Date {
  return new Date(DUE_MS + ms);
}

function loan(returnedAt: Date | null): Loan {
  let returned: string | null = null;
  if (returnedAt !== null) {
    returned = returnedAt.toISOString();
  }
  return {
    id: "loan-1",
    book_id: "libro-1",
    borrower_uid: "uid-ana",
    lent_by_uid: "uid-staff",
    loaned_at: "2026-11-15T15:00:00.000Z",
    due_at: DUE_AT,
    returned_at: returned,
  };
}

/** Multa de un préstamo devuelto en `returnedAt`, calculada mucho después (el corte es `returned_at`). */
function fineOfReturned(returnedAt: Date) {
  return calculateFine(loan(returnedAt), new Date("2027-06-01T00:00:00.000Z"));
}

describe("F7 · días de retraso y multa de un préstamo devuelto (regla 1)", () => {
  it("devuelto antes del vencimiento: 0 días y 0 pesos", () => {
    expect(fineOfReturned(new Date("2026-11-20T10:00:00.000Z"))).toEqual({ days_late: 0, fine_amount: 0 });
  });

  it("devuelto exactamente a la hora de vencimiento: 0 días y 0 pesos", () => {
    expect(fineOfReturned(afterDue(0))).toEqual({ days_late: 0, fine_amount: 0 });
  });

  it("un milisegundo tarde: 1 día y 1000 pesos", () => {
    expect(fineOfReturned(afterDue(1))).toEqual({ days_late: 1, fine_amount: 1000 });
  });

  it("exactamente 24 horas tarde: 1 día", () => {
    expect(fineOfReturned(afterDue(DAY_MS))).toEqual({ days_late: 1, fine_amount: 1000 });
  });

  it("24 horas y un milisegundo tarde: 2 días y 2000 pesos", () => {
    expect(fineOfReturned(afterDue(DAY_MS + 1))).toEqual({ days_late: 2, fine_amount: 2000 });
  });

  it("2 días y 19 horas tarde: 3 días y 3000 pesos", () => {
    expect(fineOfReturned(new Date("2026-12-02T10:00:00.000Z"))).toEqual({ days_late: 3, fine_amount: 3000 });
  });

  it("exactamente 30 días tarde: 30 días y 30000 pesos", () => {
    expect(fineOfReturned(afterDue(30 * DAY_MS))).toEqual({ days_late: 30, fine_amount: 30_000 });
  });

  it("30 días y un milisegundo tarde: 31 días, pero la multa se queda en 30000", () => {
    expect(fineOfReturned(afterDue(30 * DAY_MS + 1))).toEqual({ days_late: 31, fine_amount: 30_000 });
  });

  it("45 días tarde: 45 días y 30000 pesos (tope)", () => {
    expect(fineOfReturned(afterDue(45 * DAY_MS))).toEqual({ days_late: 45, fine_amount: 30_000 });
  });

  it("un año tarde: la multa sigue en 30000", () => {
    expect(fineOfReturned(afterDue(365 * DAY_MS)).fine_amount).toBe(30_000);
  });

  it("devuelto tarde y consultado después: la multa no sigue creciendo", () => {
    const returned = loan(afterDue(2 * DAY_MS));
    const soon = calculateFine(returned, afterDue(3 * DAY_MS));
    const muchLater = calculateFine(returned, afterDue(200 * DAY_MS));
    expect(soon).toEqual({ days_late: 2, fine_amount: 2000 });
    expect(muchLater).toEqual(soon);
  });

  it.each([
    1, 2, 7, 13, 29, 30, 31, 90,
  ])("a los %i días la multa es un entero múltiplo de 1000 dentro del tope", (days) => {
    const fine = LoanFineSchema.parse(fineOfReturned(afterDue(days * DAY_MS - HOUR_MS)));
    expect(Number.isInteger(fine.fine_amount)).toBe(true);
    expect(fine.fine_amount % 1000).toBe(0);
    expect(fine.fine_amount).toBeLessThanOrEqual(30_000);
    expect(fine.days_late).toBe(days);
  });
});

describe("F7 · multa de un préstamo activo (regla 1.1)", () => {
  it("vencido hace 2 días y medio: 3 días y 3000 pesos", () => {
    expect(calculateFine(loan(null), afterDue(2.5 * DAY_MS))).toEqual({ days_late: 3, fine_amount: 3000 });
  });

  it("que aún no vence: 0 y 0", () => {
    expect(calculateFine(loan(null), afterDue(-3 * DAY_MS))).toEqual({ days_late: 0, fine_amount: 0 });
  });

  it("en el instante exacto del vencimiento: 0 y 0", () => {
    expect(calculateFine(loan(null), afterDue(0))).toEqual({ days_late: 0, fine_amount: 0 });
  });

  it("crece con el tiempo mientras no se devuelva, hasta el tope", () => {
    expect(calculateFine(loan(null), afterDue(5 * DAY_MS)).fine_amount).toBe(5000);
    expect(calculateFine(loan(null), afterDue(60 * DAY_MS))).toEqual({ days_late: 60, fine_amount: 30_000 });
  });

  it("no cambia el préstamo", () => {
    const active = loan(null);
    const copy = { ...active };
    calculateFine(active, afterDue(5 * DAY_MS));
    expect(active).toEqual(copy);
  });
});

describe("F7 · la devolución informa la multa (regla 2)", () => {
  function setup(now: Date, anaRole: Role = "ESTUDIANTE") {
    const loans = createMemoryLoanRepository();
    const borrowers = createMemoryBorrowerDirectory();
    loans.setBook("libro-1", 0);
    borrowers.add("uid-ana", "ana@correo.test", anaRole);
    loans.seedLoan({ ...loan(null) });
    const session: Session = { uid: "uid-staff", email: "staff@biblioteca.test", role: "BIBLIOTECARIO" };
    const handler = createReturnBookHandler({
      service: createLoanService({ loans, borrowers }),
      readSession: () => Promise.resolve(session),
      now: () => now,
      rethrow: () => undefined,
    });
    return { handler };
  }

  function giveBack(): Request {
    return new Request("http://localhost:3000/api/loans/return", {
      method: "POST",
      headers: { host: "localhost:3000", origin: "http://localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ book_id: "libro-1", borrower_email: "ana@correo.test" }),
    });
  }

  it("a tiempo: days_late 0, fine_amount 0 y returned_late false", async () => {
    const { handler } = setup(new Date("2026-11-20T10:00:00.000Z"));
    const body = ReturnedLoanSchema.parse(await (await handler(giveBack())).json());
    expect(body).toMatchObject({ returned_late: false, days_late: 0, fine_amount: 0 });
  });

  it("2 días y 19 horas tarde: days_late 3, fine_amount 3000 y returned_late true", async () => {
    const { handler } = setup(new Date("2026-12-02T10:00:00.000Z"));
    const response = await handler(giveBack());
    expect(response.status).toBe(200);
    const body = ReturnedLoanSchema.parse(await response.json());
    expect(body).toMatchObject({ returned_late: true, days_late: 3, fine_amount: 3000 });
    expect(body.loan.returned_at).toBe("2026-12-02T10:00:00.000Z");
  });

  it("45 días tarde: days_late 45 y fine_amount 30000", async () => {
    const { handler } = setup(afterDue(45 * DAY_MS));
    const body = ReturnedLoanSchema.parse(await (await handler(giveBack())).json());
    expect(body).toMatchObject({ returned_late: true, days_late: 45, fine_amount: 30_000 });
  });

  it("la respuesta tiene exactamente loan, returned_late, days_late y fine_amount", async () => {
    const { handler } = setup(afterDue(DAY_MS));
    const body = ReturnedLoanSchema.parse(await (await handler(giveBack())).json());
    expect(Object.keys(body).sort()).toEqual(["days_late", "fine_amount", "loan", "returned_late"]);
  });

  it.each<Role>(["EXTERNO", "ESTUDIANTE", "DOCENTE"])("un %s que devuelve 2 días tarde debe 2000", async (role) => {
    const { handler } = setup(afterDue(2 * DAY_MS), role);
    const body = ReturnedLoanSchema.parse(await (await handler(giveBack())).json());
    expect(body.fine_amount).toBe(2000);
  });

  it.each([
    0,
    1,
    DAY_MS,
    3 * DAY_MS,
  ])("returned_late es true exactamente cuando days_late es mayor que 0 (+%i ms)", async (ms) => {
    const { handler } = setup(afterDue(ms));
    const body = ReturnedLoanSchema.parse(await (await handler(giveBack())).json());
    expect(body.returned_late).toBe(body.days_late > 0);
  });
});
