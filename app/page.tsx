import Link from "next/link";

/** Inicio: bienvenida de la biblioteca (spec F33, regla 3). La sesión se ve en la cabecera. */
export default function HomePage() {
  return (
    <section aria-labelledby="inicio-titulo" className="rounded-lg bg-surface-alt p-6 md:p-10">
      <h1 id="inicio-titulo" className="text-3xl font-bold text-primary-strong md:text-4xl">
        Biblioteca de préstamos
      </h1>
      <p className="mt-4 max-w-3xl text-lg">Busca libros en el catálogo y lleva el control de tus préstamos.</p>
      <p className="mt-6">
        <Link
          href="/catalogo"
          className="inline-flex min-h-11 items-center rounded bg-primary px-6 py-2 font-semibold text-surface underline hover:bg-primary-hover hover:text-surface"
        >
          Buscar en el catálogo
        </Link>
      </p>
    </section>
  );
}
