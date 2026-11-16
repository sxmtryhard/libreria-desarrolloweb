import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { RegisterForm } from "@/features/accounts/ui/register-form";
import { currentSession } from "@/features/container";

export const metadata: Metadata = {
  title: "Crear cuenta · Biblioteca de préstamos",
};

/** Quien ya ingresó va al inicio; los demás ven el formulario (spec F10, regla 4.7). */
async function RegisterGate() {
  const session = await currentSession();
  if (session !== null) {
    redirect("/");
  }
  return <RegisterForm />;
}

export default function RegisterPage() {
  return (
    <section aria-labelledby="registrarse-titulo" className="mx-auto w-full max-w-md">
      <h1 id="registrarse-titulo" className="text-3xl font-bold text-primary-strong">
        Crear cuenta
      </h1>
      <p className="mt-2 text-ink-muted">Regístrate para pedir libros prestados en la biblioteca.</p>
      <Suspense fallback={<p role="status">Cargando…</p>}>
        <RegisterGate />
      </Suspense>
      <p className="mt-6">
        <Link href="/ingresar" className="inline-flex min-h-11 items-center underline">
          ¿Ya tienes cuenta? Ingresa
        </Link>
      </p>
    </section>
  );
}
