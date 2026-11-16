import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { CatalogResults, CatalogSearchForm, CatalogTooLong } from "@/features/catalog/ui/catalog-search";
import { readCatalogQuery } from "@/features/catalog/ui/catalog-view";
import { bookService } from "@/features/container";

export const metadata: Metadata = {
  title: "Catálogo · Biblioteca de préstamos",
};

/** Formulario y resultados (spec F33, regla 4). Lee `searchParams`: va dentro de Suspense. */
async function CatalogSearch({ searchParams }: Pick<PageProps<"/catalogo">, "searchParams">) {
  // Firestore usa valores aleatorios al consultar: con Cache Components la consulta va después de `connection()`.
  await connection();
  const params = await searchParams;
  const query = readCatalogQuery(params.q);
  if (query.tooLong) {
    return (
      <>
        <CatalogSearchForm query={query} />
        <CatalogTooLong />
      </>
    );
  }
  const books = await bookService.search({ q: query.q });
  return (
    <>
      <CatalogSearchForm query={query} />
      <CatalogResults books={books} />
    </>
  );
}

export default function CatalogPage({ searchParams }: PageProps<"/catalogo">) {
  return (
    <section aria-labelledby="catalogo-titulo">
      <h1 id="catalogo-titulo" className="text-3xl font-bold text-primary-strong">
        Catálogo
      </h1>
      <p className="mt-2 text-ink-muted">Busca libros por título o por autor.</p>
      <Suspense fallback={<p role="status">Cargando el catálogo…</p>}>
        <CatalogSearch searchParams={searchParams} />
      </Suspense>
    </section>
  );
}
