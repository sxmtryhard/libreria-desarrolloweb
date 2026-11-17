import { describe, expect, it } from "vitest";
import type { Session } from "@/shared/schema";
import { ErrorResponseSchema } from "@/shared/schema";
import { ConflictError } from "@/shared/server/errors";
import { LendBookInputSchema } from "../schema";
import { createLoanService } from "../server/loan-service";
import { createMemoryBorrowerDirectory, createMemoryLoanRepository } from "../server/repository.memory";
import { createReturnBookHandler } from "../server/return-book-handler";

const NOW = new Date("2026-11-16T15:00:00.000Z");
const LIBRARIAN: Session = { uid: "uid-bib", email: "bib@biblioteca.test", role: "BIBLIOTECARIO" };
const ANA = "ana@correo.test";

/** Ana desactivada (spec F14) y el libro `libro-1` con 3 ejemplares disponibles. */
function setup() {
  const loans = createMemoryLoanRepository();
  const borrowers = createMemoryBorrowerDirectory();
  loans.setBook("libro-1", 3);
  borrowers.add("uid-ana", ANA, "ESTUDIANTE", false);
  const service = createLoanService({ loans, borrowers });
  return { loans, service };
}

describe("F14 · préstamos de una cuenta desactivada (reglas 3.3 y 3.4)", () => {
  it("prestar a una cuenta desactivada → ConflictError «La cuenta está desactivada.» y no se presta", async () => {
    const { service, loans } = setup();
    const input = LendBookInputSchema.parse({ book_id: "libro-1", borrower_email: ANA });
    const attempt = service.lend(LIBRARIAN, input, NOW);
    await expect(attempt).rejects.toBeInstanceOf(ConflictError);
    await expect(attempt).rejects.toThrow("La cuenta está desactivada.");
    expect(loans.availableCopies("libro-1")).toBe(3);
  });

  it("la devolución de un préstamo de una cuenta desactivada funciona como siempre", async () => {
    const { service, loans } = setup();
    loans.seedLoan({
      book_id: "libro-1",
      borrower_uid: "uid-ana",
      lent_by_uid: "uid-bib",
      loaned_at: "2026-11-10T15:00:00.000Z",
      due_at: "2026-11-20T15:00:00.000Z",
      returned_at: null,
    });
    const handler = createReturnBookHandler({
      service,
      readSession: () => Promise.resolve(LIBRARIAN),
      now: () => NOW,
      rethrow: () => undefined,
    });
    const response = await handler(
      new Request("http://localhost:3000/api/loans/return", {
        method: "POST",
        headers: { host: "localhost:3000", origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify({ book_id: "libro-1", borrower_email: ANA }),
      }),
    );
    expect(response.status).toBe(200);
    expect(ErrorResponseSchema.safeParse(await response.json()).success).toBe(false);
  });
});
