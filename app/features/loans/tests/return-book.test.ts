import { describe, expect, it } from "vitest";
import type { Role, Session } from "@/shared/schema";
import { ErrorResponseSchema } from "@/shared/schema";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/server/errors";
import { ReturnBookInputSchema, ReturnedLoanSchema } from "../schema";
import { createLendBookHandler } from "../server/lend-book-handler";
import { createLoanService } from "../server/loan-service";
import { createMemoryBorrowerDirectory, createMemoryLoanRepository } from "../server/repository.memory";
import { createReturnBookHandler } from "../server/return-book-handler";

const LOANED_AT = "2026-11-15T15:00:00.000Z";
const DUE_AT = "2026-11-29T15:00:00.000Z";
const ON_TIME = new Date("2026-11-20T10:00:00.000Z");
const LATE = new Date("2026-12-05T10:00:00.000Z");
const ANA = "ana@correo.test";

function sessionOf(role: Role): Session {
  return { uid: `uid-${role}`, email: `${role.toLowerCase()}@biblioteca.test`, role };
}

/**
 * Mostrador con la sesión dada. `libro-1` tiene 2 disponibles y Ana (rol indicado) lo tiene prestado
 * desde el 15 de noviembre, con vencimiento el 29.
 */
function setup(staffRole: Role | null, now: Date = ON_TIME, anaRole: Role = "ESTUDIANTE") {
  const loans = createMemoryLoanRepository();
  const borrowers = createMemoryBorrowerDirectory();
  loans.setBook("libro-1", 2);
  borrowers.add("uid-ana", ANA, anaRole);
  const anaLoan = loans.seedLoan({
    book_id: "libro-1",
    borrower_uid: "uid-ana",
    lent_by_uid: "uid-quien-presto",
    loaned_at: LOANED_AT,
    due_at: DUE_AT,
    returned_at: null,
  });
  const service = createLoanService({ loans, borrowers });
  const deps = {
    service,
    readSession(): Promise<Session> {
      if (staffRole === null) {
        return Promise.reject(new UnauthenticatedError());
      }
      return Promise.resolve(sessionOf(staffRole));
    },
    now: () => now,
    rethrow: () => undefined,
  };
  const handler = createReturnBookHandler(deps);
  const lendHandler = createLendBookHandler(deps);
  function loanById(id: string) {
    return loans.all().find((loan) => loan.id === id);
  }
  return { loans, borrowers, service, handler, lendHandler, anaLoan, loanById };
}

function post(path: string, body: string, origin = "http://localhost:3000"): Request {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { host: "localhost:3000", origin, "content-type": "application/json" },
    body,
  });
}

function giveBack(bookId = "libro-1", email = ANA): Request {
  return post("/api/loans/return", JSON.stringify({ book_id: bookId, borrower_email: email }));
}

function lend(bookId: string, email = ANA): Request {
  return post("/api/loans", JSON.stringify({ book_id: bookId, borrower_email: email }));
}

async function errorOf(response: Response) {
  return ErrorResponseSchema.parse(await response.json()).error;
}

function fieldPaths(input: object): string[] {
  const result = ReturnBookInputSchema.safeParse(input);
  if (result.success) {
    return [];
  }
  return result.error.issues.map((issue) => issue.path.map(String).join("."));
}

describe("F6 · devolver un libro (reglas 1 y 2)", () => {
  it("un BIBLIOTECARIO registra la devolución a tiempo: 200, returned_late false y sube un disponible", async () => {
    const { handler, loans, anaLoan } = setup("BIBLIOTECARIO");
    const response = await handler(giveBack());
    expect(response.status).toBe(200);
    const body = ReturnedLoanSchema.parse(await response.json());
    expect(body.returned_late).toBe(false);
    expect(body.loan).toEqual({ ...anaLoan, returned_at: "2026-11-20T10:00:00.000Z" });
    expect(loans.availableCopies("libro-1")).toBe(3);
  });

  it("el préstamo queda guardado como devuelto y el resto de sus datos no cambia", async () => {
    const { handler, anaLoan, loanById } = setup("BIBLIOTECARIO");
    await handler(giveBack());
    expect(loanById(anaLoan.id)).toEqual({ ...anaLoan, returned_at: "2026-11-20T10:00:00.000Z" });
  });

  it("un ADMINISTRADOR también registra devoluciones", async () => {
    const { handler } = setup("ADMINISTRADOR");
    expect((await handler(giveBack())).status).toBe(200);
  });

  it("la respuesta tiene loan, returned_late y los dos campos de multa de F7 (spec F7, regla 2.3)", async () => {
    const { handler } = setup("BIBLIOTECARIO");
    const body = ReturnedLoanSchema.parse(await (await handler(giveBack())).json());
    expect(Object.keys(body).sort()).toEqual(["days_late", "fine_amount", "loan", "returned_late"]);
  });

  it("el correo se busca sin espacios y en minúsculas", async () => {
    const { handler } = setup("BIBLIOTECARIO");
    expect((await handler(giveBack("libro-1", "  Ana@Correo.TEST "))).status).toBe(200);
  });
});

describe("F6 · devolución tardía (regla 3)", () => {
  it("después del vencimiento se acepta con returned_late true y el libro recupera el ejemplar", async () => {
    const { handler, loans } = setup("BIBLIOTECARIO", LATE);
    const response = await handler(giveBack());
    expect(response.status).toBe(200);
    const body = ReturnedLoanSchema.parse(await response.json());
    expect(body.returned_late).toBe(true);
    expect(body.loan.returned_at).toBe("2026-12-05T10:00:00.000Z");
    expect(loans.availableCopies("libro-1")).toBe(3);
  });

  it("en el instante exacto del vencimiento es a tiempo", async () => {
    const { handler } = setup("BIBLIOTECARIO", new Date(DUE_AT));
    const body = ReturnedLoanSchema.parse(await (await handler(giveBack())).json());
    expect(body.returned_late).toBe(false);
  });

  it("un milisegundo después del vencimiento es tarde", async () => {
    const { handler } = setup("BIBLIOTECARIO", new Date(new Date(DUE_AT).getTime() + 1));
    const body = ReturnedLoanSchema.parse(await (await handler(giveBack())).json());
    expect(body.returned_late).toBe(true);
  });
});

describe("F6 · autorización y orden (Autorización)", () => {
  it.each<Role>(["EXTERNO", "ESTUDIANTE", "DOCENTE"])("un %s recibe 403 y el préstamo sigue activo", async (role) => {
    const { handler, loans, anaLoan, loanById } = setup(role);
    const response = await handler(giveBack());
    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe("NO_AUTORIZADO");
    expect(loanById(anaLoan.id)?.returned_at).toBeNull();
    expect(loans.availableCopies("libro-1")).toBe(2);
  });

  it("sin sesión recibe 401", async () => {
    const { handler } = setup(null);
    const response = await handler(giveBack());
    expect(response.status).toBe(401);
    expect((await errorOf(response)).code).toBe("NO_AUTENTICADO");
  });

  it("desde otro origen recibe 403 sin mirar sesión ni cuerpo", async () => {
    const { handler } = setup(null);
    const response = await handler(post("/api/loans/return", "no es json", "https://otro-sitio.com"));
    expect(response.status).toBe(403);
    expect((await errorOf(response)).message).toBe("Origen no permitido.");
  });

  it("sin permiso recibe 403 aunque el cuerpo sea inválido", async () => {
    const { handler } = setup("ESTUDIANTE");
    expect((await handler(post("/api/loans/return", "no es json"))).status).toBe(403);
  });

  it("el servicio también comprueba el rol", async () => {
    const { service } = setup("BIBLIOTECARIO");
    const input = { book_id: "libro-1", borrower_email: ANA };
    await expect(service.returnBook(sessionOf("ESTUDIANTE"), input, ON_TIME)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("F6 · cuándo no hay nada que devolver (reglas 1.4–1.7)", () => {
  it("un préstamo ya devuelto recibe 404 y los disponibles no cambian", async () => {
    const { handler, loans } = setup("BIBLIOTECARIO");
    expect((await handler(giveBack())).status).toBe(200);
    const response = await handler(giveBack());
    expect(response.status).toBe(404);
    const error = await errorOf(response);
    expect(error.code).toBe("NO_ENCONTRADO");
    expect(error.message).toBe("La persona no tiene prestado este libro.");
    expect(loans.availableCopies("libro-1")).toBe(3);
  });

  it("una persona que nunca tuvo ese libro recibe 404", async () => {
    const { handler, loans, borrowers } = setup("BIBLIOTECARIO");
    borrowers.add("uid-luis", "luis@correo.test", "DOCENTE");
    const response = await handler(giveBack("libro-1", "luis@correo.test"));
    expect(response.status).toBe(404);
    expect((await errorOf(response)).message).toBe("La persona no tiene prestado este libro.");
    expect(loans.availableCopies("libro-1")).toBe(2);
  });

  it("un correo sin cuenta recibe 404", async () => {
    const { handler } = setup("BIBLIOTECARIO");
    const response = await handler(giveBack("libro-1", "nadie@correo.test"));
    expect(response.status).toBe(404);
    expect((await errorOf(response)).message).toBe("No existe una cuenta con ese correo.");
  });

  it("un libro que no existe recibe 404", async () => {
    const { handler } = setup("BIBLIOTECARIO");
    const response = await handler(giveBack("no-existe"));
    expect(response.status).toBe(404);
    expect((await errorOf(response)).message).toBe("No existe ese libro.");
  });

  it("cuenta inexistente se informa antes que libro inexistente", async () => {
    const { handler } = setup("BIBLIOTECARIO");
    const response = await handler(giveBack("no-existe", "nadie@correo.test"));
    expect((await errorOf(response)).message).toBe("No existe una cuenta con ese correo.");
  });

  it("el correo de una cuenta del personal recibe 404 de préstamo", async () => {
    const { handler, borrowers } = setup("BIBLIOTECARIO");
    borrowers.add("uid-staff", "staff@biblioteca.test", "BIBLIOTECARIO");
    const response = await handler(giveBack("libro-1", "staff@biblioteca.test"));
    expect(response.status).toBe(404);
    expect((await errorOf(response)).message).toBe("La persona no tiene prestado este libro.");
  });

  it("el servicio lanza NotFoundError si no hay préstamo activo", async () => {
    const { service, loans } = setup("BIBLIOTECARIO");
    loans.setBook("libro-2", 1);
    const input = { book_id: "libro-2", borrower_email: ANA };
    await expect(service.returnBook(sessionOf("BIBLIOTECARIO"), input, ON_TIME)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("F6 · solo cambia el préstamo indicado (Bordes)", () => {
  it("Ana tiene dos libros y devuelve uno: el otro sigue activo", async () => {
    const { handler, loans, anaLoan, loanById } = setup("BIBLIOTECARIO");
    loans.setBook("libro-2", 0);
    const other = loans.seedLoan({ ...anaLoan, book_id: "libro-2" });
    expect((await handler(giveBack("libro-2"))).status).toBe(200);
    expect(loanById(other.id)?.returned_at).toBe("2026-11-20T10:00:00.000Z");
    expect(loanById(anaLoan.id)?.returned_at).toBeNull();
    expect(loans.availableCopies("libro-2")).toBe(1);
    expect(loans.availableCopies("libro-1")).toBe(2);
  });

  it("dos personas tienen el mismo libro y una devuelve: el de la otra sigue activo", async () => {
    const { handler, loans, borrowers, anaLoan, loanById } = setup("BIBLIOTECARIO");
    borrowers.add("uid-luis", "luis@correo.test", "DOCENTE");
    const luisLoan = loans.seedLoan({ ...anaLoan, borrower_uid: "uid-luis" });
    expect((await handler(giveBack("libro-1", "luis@correo.test"))).status).toBe(200);
    expect(loanById(luisLoan.id)?.returned_at).not.toBeNull();
    expect(loanById(anaLoan.id)?.returned_at).toBeNull();
  });

  it("si tuvo el libro antes y lo tiene otra vez, se devuelve el activo y el antiguo no cambia", async () => {
    const { handler, loans, anaLoan, loanById } = setup("BIBLIOTECARIO");
    const old = loans.seedLoan({
      ...anaLoan,
      loaned_at: "2026-10-01T15:00:00.000Z",
      due_at: "2026-10-15T15:00:00.000Z",
      returned_at: "2026-10-10T15:00:00.000Z",
    });
    const body = ReturnedLoanSchema.parse(await (await handler(giveBack())).json());
    expect(body.loan.id).toBe(anaLoan.id);
    expect(loanById(old.id)?.returned_at).toBe("2026-10-10T15:00:00.000Z");
  });

  it("dos devoluciones simultáneas del mismo préstamo: una 200, otra 404 y sube solo un disponible", async () => {
    const { handler, loans } = setup("BIBLIOTECARIO");
    const responses = await Promise.all([handler(giveBack()), handler(giveBack())]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 404]);
    expect(loans.availableCopies("libro-1")).toBe(3);
  });
});

describe("F6 · después de devolver se puede volver a prestar (regla 3.4)", () => {
  it("un EXTERNO que devolvió su único préstamo recibe otro libro", async () => {
    const { handler, lendHandler, loans } = setup("BIBLIOTECARIO", ON_TIME, "EXTERNO");
    loans.setBook("libro-2", 1);
    expect((await lendHandler(lend("libro-2"))).status).toBe(409);
    expect((await handler(giveBack())).status).toBe(200);
    expect((await lendHandler(lend("libro-2"))).status).toBe(201);
  });

  it("al devolver el único préstamo vencido, la persona vuelve a recibir préstamos", async () => {
    const { handler, lendHandler, loans } = setup("BIBLIOTECARIO", LATE);
    loans.setBook("libro-2", 1);
    const blocked = await lendHandler(lend("libro-2"));
    expect((await errorOf(blocked)).message).toBe("La persona tiene préstamos vencidos.");
    expect((await handler(giveBack())).status).toBe(200);
    expect((await lendHandler(lend("libro-2"))).status).toBe(201);
  });

  it("después de devolver un libro se le puede prestar ese mismo libro otra vez", async () => {
    const { handler, lendHandler } = setup("BIBLIOTECARIO");
    expect((await handler(giveBack())).status).toBe(200);
    expect((await lendHandler(lend("libro-1"))).status).toBe(201);
  });
});

describe("F6 · validación del cuerpo (Entradas y Bordes)", () => {
  it.each([
    ["sin book_id", { borrower_email: ANA }, ["book_id"]],
    ["sin borrower_email", { book_id: "libro-1" }, ["borrower_email"]],
    ["book_id vacío", { book_id: "", borrower_email: ANA }, ["book_id"]],
    ["book_id de 129 caracteres", { book_id: "a".repeat(129), borrower_email: ANA }, ["book_id"]],
    ["correo sin forma de correo", { book_id: "libro-1", borrower_email: "ana" }, ["borrower_email"]],
  ])("%s → inválido", (_label, input, paths) => {
    expect(fieldPaths(input)).toEqual(paths);
  });

  it("un cuerpo inválido recibe 400 con fields y no cambia nada", async () => {
    const { handler, loans } = setup("BIBLIOTECARIO");
    const response = await handler(post("/api/loans/return", JSON.stringify({ book_id: "libro-1" })));
    expect(response.status).toBe(400);
    const error = await errorOf(response);
    expect(error.code).toBe("VALIDACION");
    expect(error.fields?.map((field) => field.path)).toEqual(["borrower_email"]);
    expect(loans.availableCopies("libro-1")).toBe(2);
  });

  it("un cuerpo que no es JSON recibe 400", async () => {
    const { handler } = setup("BIBLIOTECARIO");
    expect((await handler(post("/api/loans/return", "no es json"))).status).toBe(400);
  });
});
