import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { currentSession } from "@/features/container";
import { DESK_MESSAGES } from "@/features/loans/ui/desk-messages";
import { LoanDesk } from "@/features/loans/ui/loan-desk";
import { roleLinksFor } from "@/shared/ui/navigation";

export const metadata: Metadata = {
  title: "Préstamos · Biblioteca de préstamos",
};

/** Quién ve qué (spec F34, regla 1): sin sesión → `/ingresar`; sin ser personal → aviso; personal → mostrador. */
async function DeskGate() {
  const session = await currentSession();
  if (session === null) {
    redirect("/ingresar");
  }
  const isStaff = roleLinksFor(session.role).some((link) => link.href === "/prestamos");
  if (!isStaff) {
    return (
      <p role="alert" className="mt-6 font-semibold text-danger">
        Error: {DESK_MESSAGES.forbiddenScreen}
      </p>
    );
  }
  return <LoanDesk />;
}

export default function LoansPage() {
  return (
    <section aria-labelledby="prestamos-titulo">
      <h1 id="prestamos-titulo" className="text-3xl font-bold text-primary-strong">
        Préstamos y devoluciones
      </h1>
      <p className="mt-2 text-ink-muted">Elige a la persona y el libro, y registra el préstamo o la devolución.</p>
      <Suspense fallback={<p role="status">Cargando…</p>}>
        <DeskGate />
      </Suspense>
    </section>
  );
}
