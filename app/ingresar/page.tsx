import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PASSWORD_CHANGED_PARAM, signInNotice } from "@/features/accounts/ui/password-view";
import { SignInForm } from "@/features/accounts/ui/sign-in-form";
import { currentSession } from "@/features/container";

export const metadata: Metadata = {
  title: "Ingresar · Biblioteca de préstamos",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Quien ya ingresó va al inicio; los demás ven el formulario (spec F4, regla 3) y, tras cambiar la contraseña, el aviso de F15 (regla 4.6). */
async function SignInGate({ searchParams }: { searchParams: SearchParams }) {
  const session = await currentSession();
  if (session !== null) {
    redirect("/");
  }
  const notice = signInNotice((await searchParams)[PASSWORD_CHANGED_PARAM]);
  return (
    <>
      {notice !== null && (
        <p role="status" className="mt-6 font-semibold text-success">
          {notice}
        </p>
      )}
      <SignInForm />
    </>
  );
}

export default function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <section aria-labelledby="ingresar-titulo" className="mx-auto w-full max-w-md">
      <h1 id="ingresar-titulo" className="text-3xl font-bold text-primary-strong">
        Ingresar
      </h1>
      <p className="mt-2 text-ink-muted">Escribe el correo y la contraseña de tu cuenta de la biblioteca.</p>
      <Suspense fallback={<p role="status">Cargando…</p>}>
        <SignInGate searchParams={searchParams} />
      </Suspense>
      <p className="mt-6">
        <Link href="/registrarse" className="inline-flex min-h-11 items-center underline">
          ¿No tienes cuenta? Regístrate
        </Link>
      </p>
      <p>
        <Link href="/" className="inline-flex min-h-11 items-center underline">
          Volver al inicio
        </Link>
      </p>
    </section>
  );
}
