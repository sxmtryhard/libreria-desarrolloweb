import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BookForm } from "@/features/catalog/ui/book-form";
import { currentSession } from "@/features/container";
import { StaffOnly } from "@/shared/ui/staff-only";

export const metadata: Metadata = {
  title: "Registrar libro · Biblioteca de préstamos",
};

/** Sin sesión → `/ingresar`; sin ser personal → aviso; personal → formulario (spec F36, regla 1.2). */
async function BookFormGate() {
  const session = await currentSession();
  if (session === null) {
    redirect("/ingresar");
  }
  return (
    <StaffOnly role={session.role}>
      <BookForm />
    </StaffOnly>
  );
}

export default function NewBookPage() {
  return (
    <section aria-labelledby="registrar-libro-titulo" className="mx-auto w-full max-w-2xl">
      <h1 id="registrar-libro-titulo" className="text-3xl font-bold text-primary-strong">
        Registrar libro
      </h1>
      <p className="mt-2 text-ink-muted">Escribe los datos del libro y cuántos ejemplares tiene la biblioteca.</p>
      <Suspense fallback={<p role="status">Cargando…</p>}>
        <BookFormGate />
      </Suspense>
    </section>
  );
}
