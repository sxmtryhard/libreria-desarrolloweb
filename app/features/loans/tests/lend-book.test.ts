import { describe, expect, it } from "vitest";
import type { Role, Session } from "@/shared/schema";
import { ErrorResponseSchema } from "@/shared/schema";
import { ConflictError, ForbiddenError, UnauthenticatedError } from "@/shared/server/errors";
import { LendBookInputSchema, LoanSchema } from "../schema";
import { createLendBookHandler } from "../server/lend-book-handler";
import { createLoanService } from "../server/loan-service";
import { createMemoryBorrowerDirectory, createMemoryLoanRepository } from "../server/repository.memory";

const NOW = new Date("2026-11-15T15:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const ANA = "ana@correo.test";

function sessionOf(role: Role): Session {
  return { uid: `uid-${role}`, email: `${role.toLowerCase()}@biblioteca.test`, role };
}

function isoDaysFromNow(days: number): string {
  return new Date(NOW.getTime() + days * DAY_MS).toISOString();
}

/** Mostrador con la sesión dada, el libro `libro-1` (3 disponibles) y Ana con el rol indicado. */
function setup(staffRole: Role | null, anaRole: Role = "ESTUDIANTE") {
  const loans = createMemoryLoanRepository();
  const borrowers = createMemoryBorrowerDirectory();
  loans.setBook("libro-1", 3);
  borrowers.add("uid-ana", ANA, anaRole);
  const service = createLoanService({ loans, borrowers });
  const handler = createLendBookHandler({
    service,
    readSession(): Promise<Session> {
      if (staffRole === null) {
        return Promise.reject(new UnauthenticatedError());
      }
      return Promise.resolve(sessionOf(staffRole));
    },
    now: () => NOW,
    rethrow: () => undefined,
  });
  /** Deja a Ana con `count` préstamos activos de otros libros, que vencen en `dueInDays` días. */
  function giveActiveLoans(count: number, dueInDays = 5): void {
    for (let index = 0; index < count; index += 1) {
      loans.seedLoan({
        book_id: `otro-${index}`,
        borrower_uid: "uid-ana",
        lent_by_uid: "uid-BIBLIOTECARIO",
        loaned_at: isoDaysFromNow(-2),
        due_at: isoDaysFromNow(dueInDays),
        returned_at: null,
      });
    }
  }
  return { loans, borrowers, service, handler, giveActiveLoans };
}

function post(body: string, origin = "http://localhost:3000"): Request {
  return new Request("http://localhost:3000/api/loans", {
    method: "POST",
    headers: { host: "localhost:3000", origin, "content-type": "application/json" },
    body,
  });
}

function lend(bookId = "libro-1", email = ANA): Request {
  return post(JSON.stringify({ book_id: bookId, borrower_email: email }));
}

async function errorOf(response: Response) {
  return ErrorResponseSchema.parse(await response.json()).error;
}

function fieldPaths(input: object): string[] {
  const result = LendBookInputSchema.safeParse(input);
  if (result.success) {
    return [];
  }
  return result.error.issues.map((issue) => issue.path.map(String).join("."));
}

describe("F5 · prestar un libro (reglas 1, 2 y 4)", () => {
  it("un BIBLIOTECARIO presta a un ESTUDIANTE: 201, vence a los 14 días y baja un disponible", async () => {
    const { handler, loans } = setup("BIBLIOTECARIO");
    const response = await handler(lend());
    expect(response.status).toBe(201);
    const loan = LoanSchema.parse(await response.json());
    expect(loan).toMatchObject({
      book_id: "libro-1",
      borrower_uid: "uid-ana",
      lent_by_uid: "uid-BIBLIOTECARIO",
      loaned_at: "2026-11-15T15:00:00.000Z",
      due_at: "2026-11-29T15:00:00.000Z",
      returned_at: null,
    });
    expect(loan.id.length).toBeGreaterThan(0);
    expect(loans.availableCopies("libro-1")).toBe(2);
    expect(loans.all()).toHaveLength(1);
  });

  it.each<[Role, string]>([
    ["EXTERNO", "2026-11-22T15:00:00.000Z"],
    ["ESTUDIANTE", "2026-11-29T15:00:00.000Z"],
    ["DOCENTE", "2026-12-15T15:00:00.000Z"],
  ])("a un %s le vence el %s", async (role, dueAt) => {
    const { handler } = setup("BIBLIOTECARIO", role);
    const loan = LoanSchema.parse(await (await handler(lend())).json());
    expect(loan.due_at).toBe(dueAt);
  });

  it("un ADMINISTRADOR también presta", async () => {
    const { handler } = setup("ADMINISTRADOR");
    const response = await handler(lend());
    expect(response.status).toBe(201);
    expect(LoanSchema.parse(await response.json()).lent_by_uid).toBe("uid-ADMINISTRADOR");
  });

  it("la respuesta tiene exactamente los campos del préstamo", async () => {
    const { handler } = setup("BIBLIOTECARIO");
    const loan = LoanSchema.parse(await (await handler(lend())).json());
    expect(Object.keys(loan).sort()).toEqual([
      "book_id",
      "borrower_uid",
      "due_at",
      "id",
      "lent_by_uid",
      "loaned_at",
      "returned_at",
    ]);
  });

  it("lent_by_uid y borrower_uid del cuerpo se ignoran: valen la sesión y el correo", async () => {
    const { handler } = setup("BIBLIOTECARIO");
    const body = { book_id: "libro-1", borrower_email: ANA, lent_by_uid: "uid-falso", borrower_uid: "uid-otro" };
    const loan = LoanSchema.parse(await (await handler(post(JSON.stringify(body)))).json());
    expect(loan.lent_by_uid).toBe("uid-BIBLIOTECARIO");
    expect(loan.borrower_uid).toBe("uid-ana");
  });

  it("el correo se busca sin espacios y en minúsculas", async () => {
    const { handler } = setup("BIBLIOTECARIO");
    const response = await handler(lend("libro-1", "  Ana@Correo.TEST "));
    expect(response.status).toBe(201);
    expect(LoanSchema.parse(await response.json()).borrower_uid).toBe("uid-ana");
  });

  it("un ESTUDIANTE con 2 préstamos activos recibe el tercero", async () => {
    const { handler, giveActiveLoans } = setup("BIBLIOTECARIO");
    giveActiveLoans(2);
    expect((await handler(lend())).status).toBe(201);
  });
});

describe("F5 · autorización y orden (Autorización)", () => {
  it.each<Role>(["EXTERNO", "ESTUDIANTE", "DOCENTE"])("un %s recibe 403 y no se crea nada", async (role) => {
    const { handler, loans } = setup(role);
    const response = await handler(lend());
    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe("NO_AUTORIZADO");
    expect(loans.all()).toHaveLength(0);
    expect(loans.availableCopies("libro-1")).toBe(3);
  });

  it("sin sesión recibe 401", async () => {
    const { handler } = setup(null);
    const response = await handler(lend());
    expect(response.status).toBe(401);
    expect((await errorOf(response)).code).toBe("NO_AUTENTICADO");
  });

  it("desde otro origen recibe 403 sin mirar sesión ni cuerpo", async () => {
    const { handler } = setup(null);
    const response = await handler(post("no es json", "https://otro-sitio.com"));
    expect(response.status).toBe(403);
    expect((await errorOf(response)).message).toBe("Origen no permitido.");
  });

  it("sin permiso recibe 403 aunque el cuerpo sea inválido o el libro no exista", async () => {
    const { handler } = setup("ESTUDIANTE");
    expect((await handler(post("no es json"))).status).toBe(403);
    expect((await handler(lend("no-existe", "nadie@correo.test"))).status).toBe(403);
  });

  it("sin sesión recibe 401 aunque el cuerpo sea inválido", async () => {
    const { handler } = setup(null);
    expect((await handler(post("{}"))).status).toBe(401);
  });

  it("el servicio también comprueba el rol", async () => {
    const { service } = setup("BIBLIOTECARIO");
    const input = { book_id: "libro-1", borrower_email: ANA };
    await expect(service.lend(sessionOf("DOCENTE"), input, NOW)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("F5 · a quién y qué se presta (reglas 1.4–1.6)", () => {
  it("un correo sin cuenta recibe 404", async () => {
    const { handler, loans } = setup("BIBLIOTECARIO");
    const response = await handler(lend("libro-1", "nadie@correo.test"));
    expect(response.status).toBe(404);
    const error = await errorOf(response);
    expect(error.code).toBe("NO_ENCONTRADO");
    expect(error.message).toBe("No existe una cuenta con ese correo.");
    expect(loans.availableCopies("libro-1")).toBe(3);
  });

  it.each<Role>(["BIBLIOTECARIO", "ADMINISTRADOR"])("prestarle a un %s recibe 409", async (role) => {
    const { handler, loans } = setup("BIBLIOTECARIO", role);
    const response = await handler(lend());
    expect(response.status).toBe(409);
    expect((await errorOf(response)).message).toBe("El personal no puede recibir préstamos.");
    expect(loans.all()).toHaveLength(0);
  });

  it("un libro que no existe recibe 404", async () => {
    const { handler } = setup("BIBLIOTECARIO");
    const response = await handler(lend("no-existe"));
    expect(response.status).toBe(404);
    expect((await errorOf(response)).message).toBe("No existe ese libro.");
  });
});

describe("F5 · rechazos (regla 3)", () => {
  it.each<[Role, number]>([
    ["EXTERNO", 1],
    ["ESTUDIANTE", 3],
    ["DOCENTE", 5],
  ])("un %s con %i préstamos activos llegó a su límite: 409 y el libro conserva sus disponibles", async (role, limit) => {
    const { handler, loans, giveActiveLoans } = setup("BIBLIOTECARIO", role);
    giveActiveLoans(limit);
    const response = await handler(lend());
    expect(response.status).toBe(409);
    const error = await errorOf(response);
    expect(error.code).toBe("CONFLICTO");
    expect(error.message).toBe("La persona ya alcanzó su límite de préstamos.");
    expect(loans.availableCopies("libro-1")).toBe(3);
    expect(loans.all()).toHaveLength(limit);
  });

  it.each<[Role, number]>([
    ["ESTUDIANTE", 2],
    ["DOCENTE", 4],
  ])("un %s con %i préstamos activos todavía puede: 201", async (role, count) => {
    const { handler, giveActiveLoans } = setup("BIBLIOTECARIO", role);
    giveActiveLoans(count);
    expect((await handler(lend())).status).toBe(201);
  });

  it("con un préstamo activo vencido recibe 409", async () => {
    const { handler, loans, giveActiveLoans } = setup("BIBLIOTECARIO");
    giveActiveLoans(1, -1);
    const response = await handler(lend());
    expect(response.status).toBe(409);
    expect((await errorOf(response)).message).toBe("La persona tiene préstamos vencidos.");
    expect(loans.availableCopies("libro-1")).toBe(3);
  });

  it("un préstamo que vence exactamente ahora no está vencido; un milisegundo antes sí", async () => {
    const onTime = setup("BIBLIOTECARIO");
    onTime.giveActiveLoans(1, 0);
    expect((await onTime.handler(lend())).status).toBe(201);

    const late = setup("BIBLIOTECARIO");
    late.loans.seedLoan({
      book_id: "otro",
      borrower_uid: "uid-ana",
      lent_by_uid: "uid-BIBLIOTECARIO",
      loaned_at: isoDaysFromNow(-14),
      due_at: new Date(NOW.getTime() - 1).toISOString(),
      returned_at: null,
    });
    const response = await late.handler(lend());
    expect(response.status).toBe(409);
    expect((await errorOf(response)).message).toBe("La persona tiene préstamos vencidos.");
  });

  it("si ya tiene prestado ese libro recibe 409", async () => {
    const { handler, loans } = setup("BIBLIOTECARIO");
    expect((await handler(lend())).status).toBe(201);
    const response = await handler(lend());
    expect(response.status).toBe(409);
    expect((await errorOf(response)).message).toBe("La persona ya tiene prestado este libro.");
    expect(loans.availableCopies("libro-1")).toBe(2);
  });

  it("un libro sin disponibles recibe 409", async () => {
    const { handler, loans } = setup("BIBLIOTECARIO");
    loans.setBook("agotado", 0);
    const response = await handler(lend("agotado"));
    expect(response.status).toBe(409);
    expect((await errorOf(response)).message).toBe("No hay ejemplares disponibles de este libro.");
    expect(loans.availableCopies("agotado")).toBe(0);
    expect(loans.all()).toHaveLength(0);
  });

  it("los préstamos devueltos no cuentan para el límite, los vencidos ni el mismo libro", async () => {
    const { handler, loans } = setup("BIBLIOTECARIO", "EXTERNO");
    loans.seedLoan({
      book_id: "libro-1",
      borrower_uid: "uid-ana",
      lent_by_uid: "uid-BIBLIOTECARIO",
      loaned_at: isoDaysFromNow(-30),
      due_at: isoDaysFromNow(-23),
      returned_at: isoDaysFromNow(-10),
    });
    expect((await handler(lend())).status).toBe(201);
  });

  it("los préstamos de otras personas no cuentan", async () => {
    const { handler, loans } = setup("BIBLIOTECARIO", "EXTERNO");
    loans.seedLoan({
      book_id: "libro-1",
      borrower_uid: "uid-otra-persona",
      lent_by_uid: "uid-BIBLIOTECARIO",
      loaned_at: isoDaysFromNow(-30),
      due_at: isoDaysFromNow(-23),
      returned_at: null,
    });
    expect((await handler(lend())).status).toBe(201);
  });
});

describe("F5 · orden de los rechazos (regla 3.5)", () => {
  it("cuenta inexistente antes que libro inexistente", async () => {
    const { handler } = setup("BIBLIOTECARIO");
    const response = await handler(lend("no-existe", "nadie@correo.test"));
    expect((await errorOf(response)).message).toBe("No existe una cuenta con ese correo.");
  });

  it("personal antes que libro inexistente", async () => {
    const { handler } = setup("BIBLIOTECARIO", "ADMINISTRADOR");
    const response = await handler(lend("no-existe"));
    expect((await errorOf(response)).message).toBe("El personal no puede recibir préstamos.");
  });

  it("libro inexistente antes que vencidos", async () => {
    const { handler, giveActiveLoans } = setup("BIBLIOTECARIO");
    giveActiveLoans(1, -1);
    const response = await handler(lend("no-existe"));
    expect((await errorOf(response)).message).toBe("No existe ese libro.");
  });

  it("vencidos antes que mismo libro y que límite", async () => {
    const { handler, loans, giveActiveLoans } = setup("BIBLIOTECARIO", "EXTERNO");
    giveActiveLoans(1, -1);
    loans.seedLoan({
      book_id: "libro-1",
      borrower_uid: "uid-ana",
      lent_by_uid: "uid-BIBLIOTECARIO",
      loaned_at: isoDaysFromNow(-1),
      due_at: isoDaysFromNow(6),
      returned_at: null,
    });
    const response = await handler(lend());
    expect((await errorOf(response)).message).toBe("La persona tiene préstamos vencidos.");
  });

  it("mismo libro antes que límite", async () => {
    const { handler } = setup("BIBLIOTECARIO", "EXTERNO");
    expect((await handler(lend())).status).toBe(201);
    const response = await handler(lend());
    expect((await errorOf(response)).message).toBe("La persona ya tiene prestado este libro.");
  });

  it("límite antes que sin ejemplares", async () => {
    const { handler, loans, giveActiveLoans } = setup("BIBLIOTECARIO", "EXTERNO");
    loans.setBook("agotado", 0);
    giveActiveLoans(1);
    const response = await handler(lend("agotado"));
    expect((await errorOf(response)).message).toBe("La persona ya alcanzó su límite de préstamos.");
  });
});

describe("F5 · atomicidad (regla 4.2)", () => {
  it("dos préstamos simultáneos del último ejemplar: uno 201, otro 409, quedan 0", async () => {
    const { handler, loans, borrowers } = setup("BIBLIOTECARIO");
    loans.setBook("ultimo", 1);
    borrowers.add("uid-luis", "luis@correo.test", "DOCENTE");
    const responses = await Promise.all([handler(lend("ultimo")), handler(lend("ultimo", "luis@correo.test"))]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(loans.availableCopies("ultimo")).toBe(0);
    expect(loans.all()).toHaveLength(1);
  });

  it("dos préstamos simultáneos a un EXTERNO no superan su límite", async () => {
    const { handler, loans } = setup("BIBLIOTECARIO", "EXTERNO");
    loans.setBook("libro-2", 3);
    const responses = await Promise.all([handler(lend("libro-1")), handler(lend("libro-2"))]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(loans.all()).toHaveLength(1);
  });

  it("el servicio lanza ConflictError cuando no hay ejemplares", async () => {
    const { service, loans } = setup("BIBLIOTECARIO");
    loans.setBook("agotado", 0);
    const input = { book_id: "agotado", borrower_email: ANA };
    await expect(service.lend(sessionOf("BIBLIOTECARIO"), input, NOW)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("F5 · validación del cuerpo (Entradas y Bordes)", () => {
  it.each([
    ["sin book_id", { borrower_email: ANA }, ["book_id"]],
    ["sin borrower_email", { book_id: "libro-1" }, ["borrower_email"]],
    ["book_id vacío", { book_id: "", borrower_email: ANA }, ["book_id"]],
    ["book_id de solo espacios", { book_id: "   ", borrower_email: ANA }, ["book_id"]],
    ["book_id de 129 caracteres", { book_id: "a".repeat(129), borrower_email: ANA }, ["book_id"]],
    ["book_id numérico", { book_id: 7, borrower_email: ANA }, ["book_id"]],
    ["correo sin forma de correo", { book_id: "libro-1", borrower_email: "ana" }, ["borrower_email"]],
    [
      "correo de 255 caracteres",
      { book_id: "libro-1", borrower_email: `${"a".repeat(245)}@correo.es` },
      ["borrower_email"],
    ],
  ])("%s → inválido", (_label, input, paths) => {
    expect(fieldPaths(input)).toEqual(paths);
  });

  it("book_id de 128 caracteres es válido y se recortan los espacios", () => {
    expect(LendBookInputSchema.safeParse({ book_id: "a".repeat(128), borrower_email: ANA }).success).toBe(true);
    expect(LendBookInputSchema.parse({ book_id: "  libro-1 ", borrower_email: ANA }).book_id).toBe("libro-1");
  });

  it("un cuerpo inválido recibe 400 con fields", async () => {
    const { handler } = setup("BIBLIOTECARIO");
    const response = await handler(post(JSON.stringify({ book_id: "libro-1", borrower_email: "ana" })));
    expect(response.status).toBe(400);
    const error = await errorOf(response);
    expect(error.code).toBe("VALIDACION");
    expect(error.fields?.map((field) => field.path)).toEqual(["borrower_email"]);
  });

  it("un cuerpo que no es JSON recibe 400", async () => {
    const { handler } = setup("BIBLIOTECARIO");
    const response = await handler(post("no es json"));
    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe("VALIDACION");
  });
});
