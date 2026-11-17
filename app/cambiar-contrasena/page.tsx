import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PasswordForm } from "@/features/accounts/ui/password-form";
import { currentSession } from "@/features/container";

export const metadata: Metadata = {
  title: "Cambiar contraseña · Biblioteca de préstamos",
};

/** Sin sesión → `/ingresar` (spec F15, regla 4.2). */
async function PasswordGate() {
  const session = await currentSession();
  if (session === null) {
    redirect("/ingresar");
  }
  return <PasswordForm />;
}

export default function ChangePasswordPage() {
  return (
    <section aria-labelledby="contrasena-titulo" className="mx-auto w-full max-w-md">
      <h1 id="contrasena-titulo" className="text-3xl font-bold text-primary-strong">
        Cambiar contraseña
      </h1>
      <p className="mt-2 text-ink-muted">Al cambiarla se cierran todas tus sesiones y vuelves a ingresar.</p>
      <Suspense fallback={<p role="status">Cargando…</p>}>
        <PasswordGate />
      </Suspense>
    </section>
  );
}
