import { describe, expect, it } from "vitest";
import type { Role, Session } from "@/shared/schema";
import { ErrorResponseSchema } from "@/shared/schema";
import { ForbiddenError, UnauthenticatedError } from "@/shared/server/errors";
import { OverdueLoansResponseSchema, OverdueQuerySchema } from "../schema";
import { createOverdueLoansHandler } from "../server/overdue-loans-handler";
import { createOverdueService } from "../server/overdue-service";
import {
  createMemoryBookCatalog,
  createMemoryBorrowerDirectory,
  createMemoryLoanRepository,
} from "../server/repository.memory";

const NOW = new Date("2026-11-16T12:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const ANA_EMAIL = "ana@correo.test";
const ANA: Session = { uid: "uid-ana", email: ANA_EMAIL, role: "ESTUDIANTE" };
const LUIS: Session = { uid: "uid-luis", email: "luis@correo.test", role: "DOCENTE" };

function staff(role: Role): Session {
  return { uid: `uid-${role}`, email: `${role.toLowerCase()}@biblioteca.test`, role };
}

function agoIso(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

function setup(session: Session | null) {
  const loans = createMemoryLoanRepository();
  const borrowers = createMemoryBorrowerDirectory();
  const books = createMemoryBookCatalog();
  borrowers.add("uid-ana", ANA_EMAIL, "ESTUDIANTE");
  borrowers.add("uid-luis", "luis@correo.test", "DOCENTE");
  borrowers.add("uid-BIBLIOTECARIO", "bibliotecario@biblioteca.test", "BIBLIOTECARIO");
  books.add("rayuela", "Rayuela", "Julio Cortázar");
  books.add("ficciones", "Ficciones", "Jorge Luis Borges");
  books.add("pedro", "Pedro Páramo", "Juan Rulfo");
  const service = createOverdueService({ loans, borrowers, books });
  const handler = createOverdueLoansHandler({
    service,
    readSession(): Promise<Session> {
      if (session === null) {
        return Promise.reject(new UnauthenticatedError());
      }
      return Promise.resolve(session);
    },
    now: () => NOW,
    rethrow: () => undefined,
  });
  /** Préstamo que venció hace `lateMs` (negativo = aún no vence). `returnedMsAgo` lo marca como devuelto. */
  function seed(bookId: string, lateMs: number, borrowerUid = "uid-ana", returnedMsAgo: number | null = null) {
    let returnedAt: string | null = null;
    if (returnedMsAgo !== null) {
      returnedAt = agoIso(returnedMsAgo);
    }
    return loans.seedLoan({
      book_id: bookId,
      borrower_uid: borrowerUid,
      lent_by_uid: "uid-BIBLIOTECARIO",
      loaned_at: agoIso(lateMs + 14 * DAY_MS),
      due_at: agoIso(lateMs),
      returned_at: returnedAt,
    });
  }
  return { loans, borrowers, books, service, handler, seed };
}

function get(query = ""): Request {
  return new Request(`http://localhost:3000/api/loans/overdue${query}`, { headers: { host: "localhost:3000" } });
}

function forEmail(email: string): Request {
  return get(`?borrower_email=${encodeURIComponent(email)}`);
}

async function listOf(response: Response) {
  expect(response.status).toBe(200);
  return OverdueLoansResponseSchema.parse(await response.json());
}

async function errorOf(response: Response) {
  return ErrorResponseSchema.parse(await response.json()).error;
}

describe("F8 · la lista de vencidos (reglas 1, 2 y 3)", () => {
  it("Ana ve su préstamo vencido hace 2 días y medio con libro, días, multa y total", async () => {
    const { handler, seed } = setup(ANA);
    const loan = seed("rayuela", 2.5 * DAY_MS);
    const body = await listOf(await handler(get()));
    expect(body).toEqual({
      borrower_uid: "uid-ana",
      overdue_loans: [
        {
          loan_id: loan.id,
          book_id: "rayuela",
          book_title: "Rayuela",
          book_author: "Julio Cortázar",
          loaned_at: loan.loaned_at,
          due_at: loan.due_at,
          days_late: 3,
          fine_amount: 3000,
        },
      ],
      total_fine_amount: 3000,
    });
  });

  it("con dos vencidos sale primero el más atrasado y el total es la suma", async () => {
    const { handler, seed } = setup(ANA);
    seed("rayuela", 2 * DAY_MS);
    seed("ficciones", 10 * DAY_MS);
    const body = await listOf(await handler(get()));
    expect(body.overdue_loans.map((loan) => loan.book_title)).toEqual(["Ficciones", "Rayuela"]);
    expect(body.overdue_loans.map((loan) => loan.fine_amount)).toEqual([10_000, 2000]);
    expect(body.total_fine_amount).toBe(12_000);
  });

  it("no entran los que aún no vencen ni los devueltos tarde: lista vacía y total 0", async () => {
    const { handler, seed } = setup(ANA);
    seed("rayuela", -3 * DAY_MS);
    seed("ficciones", 5 * DAY_MS, "uid-ana", 2 * DAY_MS);
    const body = await listOf(await handler(get()));
    expect(body).toEqual({ borrower_uid: "uid-ana", overdue_loans: [], total_fine_amount: 0 });
  });

  it("sin ningún préstamo la lista está vacía", async () => {
    const { handler } = setup(ANA);
    expect((await listOf(await handler(get()))).overdue_loans).toEqual([]);
  });

  it("un préstamo que vence exactamente ahora no entra; un milisegundo después entra con 1 día", async () => {
    const { handler, seed } = setup(ANA);
    seed("rayuela", 0);
    seed("ficciones", 1);
    const body = await listOf(await handler(get()));
    expect(body.overdue_loans.map((loan) => loan.book_id)).toEqual(["ficciones"]);
    expect(body.overdue_loans[0]?.days_late).toBe(1);
    expect(body.total_fine_amount).toBe(1000);
  });

  it("un vencido de hace 45 días tiene days_late 45 y la multa en el tope", async () => {
    const { handler, seed } = setup(ANA);
    seed("rayuela", 45 * DAY_MS);
    const body = await listOf(await handler(get()));
    expect(body.overdue_loans[0]).toMatchObject({ days_late: 45, fine_amount: 30_000 });
    expect(body.total_fine_amount).toBe(30_000);
  });

  it("los vencidos de otras personas no aparecen en la lista de Ana", async () => {
    const { handler, seed } = setup(ANA);
    seed("rayuela", 3 * DAY_MS, "uid-luis");
    seed("ficciones", DAY_MS);
    const body = await listOf(await handler(get()));
    expect(body.overdue_loans.map((loan) => loan.book_id)).toEqual(["ficciones"]);
  });

  it("si el libro ya no existe, título y autor van en null y el préstamo sigue en la lista", async () => {
    const { handler, seed } = setup(ANA);
    seed("libro-borrado", 2 * DAY_MS);
    const body = await listOf(await handler(get()));
    expect(body.overdue_loans[0]).toMatchObject({
      book_id: "libro-borrado",
      book_title: null,
      book_author: null,
      fine_amount: 2000,
    });
  });

  it("dos vencidos con el mismo due_at se ordenan por loan_id", async () => {
    const { handler, seed } = setup(ANA);
    const first = seed("rayuela", DAY_MS);
    const second = seed("ficciones", DAY_MS);
    const body = await listOf(await handler(get()));
    expect(body.overdue_loans.map((loan) => loan.loan_id)).toEqual([first.id, second.id].sort());
  });

  it("tres vencidos salen del más antiguo al más reciente", async () => {
    const { handler, seed } = setup(ANA);
    seed("rayuela", 3 * DAY_MS);
    seed("pedro", 20 * DAY_MS);
    seed("ficciones", 7 * DAY_MS);
    const body = await listOf(await handler(get()));
    expect(body.overdue_loans.map((loan) => loan.book_id)).toEqual(["pedro", "ficciones", "rayuela"]);
    expect(body.total_fine_amount).toBe(30_000);
  });

  it("cada elemento tiene exactamente los campos de la spec", async () => {
    const { handler, seed } = setup(ANA);
    seed("rayuela", DAY_MS);
    const body = await listOf(await handler(get()));
    expect(Object.keys(body).sort()).toEqual(["borrower_uid", "overdue_loans", "total_fine_amount"]);
    expect(Object.keys(body.overdue_loans[0] ?? {}).sort()).toEqual([
      "book_author",
      "book_id",
      "book_title",
      "days_late",
      "due_at",
      "fine_amount",
      "loan_id",
      "loaned_at",
    ]);
  });

  it("consultar no cambia ningún dato", async () => {
    const { handler, seed, loans } = setup(ANA);
    seed("rayuela", 3 * DAY_MS);
    const before = JSON.stringify(loans.all());
    await handler(get());
    expect(JSON.stringify(loans.all())).toBe(before);
  });
});

describe("F8 · quién ve qué (regla 4)", () => {
  it("sin sesión recibe 401", async () => {
    const { handler } = setup(null);
    const response = await handler(get());
    expect(response.status).toBe(401);
    expect((await errorOf(response)).code).toBe("NO_AUTENTICADO");
  });

  it("sin sesión recibe 401 aunque el correo tenga mala forma", async () => {
    const { handler } = setup(null);
    expect((await handler(forEmail("no-es-correo"))).status).toBe(401);
  });

  it.each<Role>(["BIBLIOTECARIO", "ADMINISTRADOR"])("un %s ve con el correo de Ana lo mismo que Ana", async (role) => {
    const asStaff = setup(staff(role));
    asStaff.seed("rayuela", 2.5 * DAY_MS);
    const asAna = setup(ANA);
    asAna.seed("rayuela", 2.5 * DAY_MS);
    const fromStaff = await listOf(await asStaff.handler(forEmail(ANA_EMAIL)));
    const fromAna = await listOf(await asAna.handler(get()));
    expect(fromStaff).toEqual(fromAna);
    expect(fromStaff.total_fine_amount).toBe(3000);
  });

  it("el personal busca el correo sin espacios y en minúsculas", async () => {
    const { handler, seed } = setup(staff("BIBLIOTECARIO"));
    seed("rayuela", DAY_MS);
    const body = await listOf(await handler(forEmail("  Ana@Correo.TEST ")));
    expect(body.borrower_uid).toBe("uid-ana");
    expect(body.overdue_loans).toHaveLength(1);
  });

  it("un prestatario que pide los de otra persona recibe 403", async () => {
    const { handler, seed } = setup(LUIS);
    seed("rayuela", 3 * DAY_MS);
    const response = await handler(forEmail(ANA_EMAIL));
    expect(response.status).toBe(403);
    const text = await response.text();
    expect(ErrorResponseSchema.parse(JSON.parse(text)).error.code).toBe("NO_AUTORIZADO");
    expect(text).not.toContain("Rayuela");
  });

  it("un prestatario que pide los de un correo sin cuenta también recibe 403", async () => {
    const { handler } = setup(LUIS);
    expect((await handler(forEmail("nadie@correo.test"))).status).toBe(403);
  });

  it("un prestatario puede enviar su propio correo, con mayúsculas y espacios", async () => {
    const { handler, seed } = setup(ANA);
    seed("rayuela", DAY_MS);
    const body = await listOf(await handler(forEmail("  ANA@correo.test ")));
    expect(body.borrower_uid).toBe("uid-ana");
    expect(body.overdue_loans).toHaveLength(1);
  });

  it("la identidad del prestatario sale de la sesión", async () => {
    const { handler, seed } = setup(LUIS);
    seed("rayuela", DAY_MS);
    seed("ficciones", 2 * DAY_MS, "uid-luis");
    const body = await listOf(await handler(get()));
    expect(body.borrower_uid).toBe("uid-luis");
    expect(body.overdue_loans.map((loan) => loan.book_id)).toEqual(["ficciones"]);
  });

  it("el personal sin borrower_email recibe 400 con fields borrower_email", async () => {
    const { handler } = setup(staff("BIBLIOTECARIO"));
    const response = await handler(get());
    expect(response.status).toBe(400);
    const error = await errorOf(response);
    expect(error.code).toBe("VALIDACION");
    expect(error.fields?.map((field) => field.path)).toEqual(["borrower_email"]);
  });

  it("el personal con un correo sin cuenta recibe 404", async () => {
    const { handler } = setup(staff("ADMINISTRADOR"));
    const response = await handler(forEmail("nadie@correo.test"));
    expect(response.status).toBe(404);
    expect((await errorOf(response)).message).toBe("No existe una cuenta con ese correo.");
  });

  it("el personal que consulta a otra cuenta del personal recibe 200 con la lista vacía", async () => {
    const { handler } = setup(staff("ADMINISTRADOR"));
    const body = await listOf(await handler(forEmail("bibliotecario@biblioteca.test")));
    expect(body).toEqual({ borrower_uid: "uid-BIBLIOTECARIO", overdue_loans: [], total_fine_amount: 0 });
  });

  it("el servicio también rechaza a un prestatario que pide los de otro", async () => {
    const { service } = setup(LUIS);
    await expect(service.list(LUIS, { borrower_email: ANA_EMAIL }, NOW)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("no hace falta cabecera Origin: es una consulta", async () => {
    const { handler } = setup(ANA);
    expect((await handler(get())).status).toBe(200);
  });
});

describe("F8 · validación del parámetro (Entradas y Bordes)", () => {
  it.each<[string, Session]>([
    ["un prestatario", ANA],
    ["el personal", staff("BIBLIOTECARIO")],
  ])("borrower_email sin forma de correo recibe 400 para %s", async (_label, session) => {
    const { handler } = setup(session);
    const response = await handler(forEmail("no-es-correo"));
    expect(response.status).toBe(400);
    expect((await errorOf(response)).fields?.map((field) => field.path)).toEqual(["borrower_email"]);
  });

  it("un correo de 255 caracteres es inválido", () => {
    const long = `${"a".repeat(245)}@correo.es`;
    expect(OverdueQuerySchema.safeParse({ borrower_email: long }).success).toBe(false);
  });

  it("sin parámetro el correo queda sin definir", () => {
    expect(OverdueQuerySchema.parse({}).borrower_email).toBeUndefined();
  });

  it("si borrower_email se repite en la URL vale el primero", async () => {
    const { handler, seed } = setup(staff("BIBLIOTECARIO"));
    seed("rayuela", DAY_MS);
    const body = await listOf(
      await handler(get("?borrower_email=ana%40correo.test&borrower_email=luis%40correo.test")),
    );
    expect(body.borrower_uid).toBe("uid-ana");
  });
});
