import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { currentSession, currentTime, overdueService } from "@/features/container";
import { BorrowerRoleSchema } from "@/features/loans/schema";
import { MyOverdueList, StaffNotice } from "@/features/loans/ui/my-loans-list";

export const metadata: Metadata = {
  title: "Mis vencidos · Biblioteca de préstamos",
};

/** Quién ve qué (spec F35, regla 1): sin sesión → `/ingresar`; personal → aviso; prestatario → sus vencidos. */
async function MyOverdue() {
  const session = await currentSession();
  if (session === null) {
    redirect("/ingresar");
  }
  if (!BorrowerRoleSchema.safeParse(session.role).success) {
    return <StaffNotice />;
  }
  // Sin correo: el servicio de F8 lista los de la propia sesión.
  const overdue = await overdueService.list(session, {}, currentTime());
  return <MyOverdueList overdue={overdue} />;
}

export default function MyOverduePage() {
  return (
    <section aria-labelledby="mis-vencidos-titulo">
      <h1 id="mis-vencidos-titulo" className="text-3xl font-bold text-primary-strong">
        Mis vencidos
      </h1>
      <p className="mt-2 text-ink-muted">Los libros que ya debías devolver y lo que debes hasta hoy.</p>
      <Suspense fallback={<p role="status">Cargando…</p>}>
        <MyOverdue />
      </Suspense>
    </section>
  );
}
