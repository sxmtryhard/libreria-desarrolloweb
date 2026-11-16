import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SignInForm } from "@/features/accounts/ui/sign-in-form";
import { currentSession } from "@/features/container";

export const metadata: Metadata = {
  title: "Ingresar · Biblioteca de préstamos",
};

/** Quien ya ingresó va al inicio; los demás ven el formulario (spec F4, regla 3). */
async function SignInGate() {
  const session = await currentSession();
  if (session !== null) {
    redirect("/");
  }
  return <SignInForm />;
}

export default function SignInPage() {
  return (
    <section aria-labelledby="ingresar-titulo" className="mx-auto w-full max-w-md">
      <h1 id="ingresar-titulo" className="text-3xl font-bold text-primary-strong">
        Ingresar
      </h1>
      <p className="mt-2 text-ink-muted">Escribe el correo y la contraseña de tu cuenta de la biblioteca.</p>
      <Suspense fallback={<p role="status">Cargando…</p>}>
        <SignInGate />
      </Suspense>
      <p className="mt-6">
        <Link href="/" className="inline-flex min-h-11 items-center underline">
          Volver al inicio
        </Link>
      </p>
    </section>
  );
}
