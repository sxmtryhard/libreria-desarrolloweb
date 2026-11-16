import type { Book } from "../schema";
import { availabilityLabel, CATALOG_MESSAGES, type CatalogQuery, countLabel, showsLimitNote } from "./catalog-view";

/** Formulario de búsqueda: envía por `GET`, así el texto queda en la URL (spec F33, regla 4.2). */
export function CatalogSearchForm({ query }: { query: CatalogQuery }) {
  return (
    <form action="/catalogo" method="get" role="search" className="mt-6 flex flex-col gap-3 md:flex-row md:items-end">
      <p className="flex-1">
        <label htmlFor="catalogo-q" className="font-semibold">
          Título o autor
        </label>
        <input
          id="catalogo-q"
          name="q"
          type="search"
          defaultValue={query.q}
          className="mt-1 block min-h-11 w-full rounded border border-control-border bg-surface px-3 py-2 text-ink"
        />
      </p>
      <button
        type="submit"
        className="min-h-11 rounded bg-primary px-6 py-2 font-semibold text-surface hover:bg-primary-hover"
      >
        Buscar
      </button>
    </form>
  );
}

function BookCard({ book }: { book: Book }) {
  return (
    <article className="h-full rounded-lg border border-line bg-surface-alt p-4">
      <h3 className="break-words text-lg font-semibold text-primary-strong">{book.title}</h3>
      <p className="break-words text-ink">{book.author}</p>
      <dl className="mt-2 text-ink-muted">
        <div className="flex gap-2">
          <dt className="font-semibold">ISBN</dt>
          <dd>{book.isbn}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-semibold">Ejemplares</dt>
          <dd>{availabilityLabel(book)}</dd>
        </div>
      </dl>
    </article>
  );
}

/** Mensaje de texto demasiado largo (regla 4.8). */
export function CatalogTooLong() {
  return (
    <p role="alert" className="mt-6 font-semibold text-danger">
      Error: {CATALOG_MESSAGES.tooLong}
    </p>
  );
}

/** Resultados de la búsqueda (reglas 4.3–4.7). */
export function CatalogResults({ books }: { books: Book[] }) {
  if (books.length === 0) {
    return (
      <section aria-labelledby="catalogo-resultados" className="mt-6">
        <h2 id="catalogo-resultados" className="text-xl font-bold text-primary-strong">
          Resultados
        </h2>
        <p role="status" className="mt-2">
          {CATALOG_MESSAGES.empty}
        </p>
      </section>
    );
  }
  return (
    <section aria-labelledby="catalogo-resultados" className="mt-6">
      <h2 id="catalogo-resultados" className="text-xl font-bold text-primary-strong">
        Resultados
      </h2>
      <p role="status" className="mt-2 text-ink-muted">
        {countLabel(books.length)}
      </p>
      {showsLimitNote(books.length) && <p className="mt-1 text-ink-muted">{CATALOG_MESSAGES.limit}</p>}
      <ul className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {books.map((book) => (
          <li key={book.id}>
            <BookCard book={book} />
          </li>
        ))}
      </ul>
    </section>
  );
}
