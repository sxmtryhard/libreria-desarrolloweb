import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DeskAccountForm } from "@/features/accounts/ui/desk-account-form";
import { currentSession } from "@/features/container";
import { StaffOnly } from "@/shared/ui/staff-only";

export const metadata: Metadata = {
  title: "Registrar cuenta · Biblioteca de préstamos",
};

/** Sin sesión → `/ingresar`; sin ser personal → aviso; personal → formulario (spec F36, regla 1.2). */
async function AccountFormGate() {
  const session = await currentSession();
  if (session === null) {
    redirect("/ingresar");
  }
  return (
    <StaffOnly role={session.role}>
      <DeskAccountForm />
    </StaffOnly>
  );
}

export default function NewAccountPage() {
  return (
    <section aria-labelledby="registrar-cuenta-titulo" className="mx-auto w-full max-w-2xl">
      <h1 id="registrar-cuenta-titulo" className="text-3xl font-bold text-primary-strong">
        Registrar cuenta
      </h1>
      <p className="mt-2 text-ink-muted">
        Crea la cuenta de una persona que va a pedir libros prestados y dale su contraseña inicial.
      </p>
      <Suspense fallback={<p role="status">Cargando…</p>}>
        <AccountFormGate />
      </Suspense>
    </section>
  );
}
