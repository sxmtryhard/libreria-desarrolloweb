import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { currentSession, currentTime, myLoansService } from "@/features/container";
import { BorrowerRoleSchema } from "@/features/loans/schema";
import { MyLoansList, StaffNotice } from "@/features/loans/ui/my-loans-list";

export const metadata: Metadata = {
  title: "Mis préstamos · Biblioteca de préstamos",
};

/** Quién ve qué (spec F35, regla 1): sin sesión → `/ingresar`; personal → aviso; prestatario → sus préstamos. */
async function MyLoans() {
  const session = await currentSession();
  if (session === null) {
    redirect("/ingresar");
  }
  if (!BorrowerRoleSchema.safeParse(session.role).success) {
    return <StaffNotice />;
  }
  const now = currentTime();
  const { loans } = await myLoansService.listActive(session, now);
  return <MyLoansList loans={loans} now={now} />;
}

export default function MyLoansPage() {
  return (
    <section aria-labelledby="mis-prestamos-titulo">
      <h1 id="mis-prestamos-titulo" className="text-3xl font-bold text-primary-strong">
        Mis préstamos
      </h1>
      <p className="mt-2 text-ink-muted">Los libros que tienes ahora y cuándo vence cada uno.</p>
      <Suspense fallback={<p role="status">Cargando…</p>}>
        <MyLoans />
      </Suspense>
    </section>
  );
}
