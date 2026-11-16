import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Página no encontrada · Biblioteca de préstamos",
};

/** Cualquier dirección que no existe (spec F33, regla 5). La cabecera y el pie los pone el layout. */
export default function NotFound() {
  return (
    <section aria-labelledby="no-encontrada-titulo">
      <h1 id="no-encontrada-titulo" className="text-3xl font-bold text-primary-strong">
        Página no encontrada
      </h1>
      <p className="mt-2">La dirección que abriste no existe.</p>
      <p className="mt-4">
        <Link href="/" className="inline-flex min-h-11 items-center underline">
          Volver al inicio
        </Link>
      </p>
    </section>
  );
}
