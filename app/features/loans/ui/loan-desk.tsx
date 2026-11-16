"use client";

import { type FormEvent, useState } from "react";
import type { Book } from "@/features/catalog/schema";
import { availabilityLabel } from "@/features/catalog/ui/catalog-view";
import type { OverdueLoansResponse } from "../schema";
import { type DeskResult, lendBook, listOverdue, returnBook, searchBooks } from "./desk-api";
import {
  DESK_MESSAGES,
  formatDateTime,
  formatPesos,
  lendSuccessMessage,
  overdueBookTitle,
  readyToAct,
  returnSuccessMessage,
} from "./desk-messages";

const FIELD_CLASS = "mt-1 block min-h-11 w-full rounded border border-control-border bg-surface px-3 py-2 text-ink";
const PRIMARY_BUTTON =
  "min-h-11 rounded bg-primary px-6 py-2 font-semibold text-surface hover:bg-primary-hover disabled:bg-primary-strong";
const SECONDARY_BUTTON =
  "min-h-11 rounded border border-control-border bg-surface px-6 py-2 font-semibold text-primary-strong hover:bg-surface-strong";
const SECTION_CLASS = "mt-6 rounded-lg border border-line bg-surface-alt p-4";
const HEADING_CLASS = "text-xl font-bold text-primary-strong";

interface Notice {
  kind: "ok" | "error";
  text: string;
}

function NoticeText({ notice }: { notice: Notice | null }) {
  if (notice === null) {
    return null;
  }
  if (notice.kind === "ok") {
    return (
      <p role="status" className="mt-3 font-semibold text-success">
        Listo: {notice.text}
      </p>
    );
  }
  return (
    <p role="alert" className="mt-3 font-semibold text-danger">
      Error: {notice.text}
    </p>
  );
}

function OverdueList({ overdue }: { overdue: OverdueLoansResponse | null }) {
  if (overdue === null) {
    return null;
  }
  if (overdue.overdue_loans.length === 0) {
    return (
      <p role="status" className="mt-3">
        {DESK_MESSAGES.noOverdue}
      </p>
    );
  }
  return (
    <>
      <ul className="mt-3 space-y-2">
        {overdue.overdue_loans.map((loan) => (
          <li key={loan.loan_id} className="rounded border border-line bg-surface p-3">
            <strong className="break-words">{overdueBookTitle(loan)}</strong>
            <p className="text-ink-muted">
              Venció el <time dateTime={loan.due_at}>{formatDateTime(loan.due_at)}</time> · {loan.days_late} días de
              retraso · Multa: {formatPesos(loan.fine_amount)}
            </p>
          </li>
        ))}
      </ul>
      <p role="status" className="mt-3 font-semibold">
        Total de multas: {formatPesos(overdue.total_fine_amount)}
      </p>
    </>
  );
}

interface PersonSectionProps {
  email: string;
  onEmail(value: string): void;
  overdue: OverdueLoansResponse | null;
  notice: Notice | null;
  onShowOverdue(event: FormEvent<HTMLFormElement>): void;
}

function PersonSection({ email, onEmail, overdue, notice, onShowOverdue }: PersonSectionProps) {
  return (
    <section aria-labelledby="mostrador-persona" className={SECTION_CLASS}>
      <h2 id="mostrador-persona" className={HEADING_CLASS}>
        1. Persona
      </h2>
      <form onSubmit={onShowOverdue} noValidate className="mt-3 flex flex-col gap-3 md:flex-row md:items-end">
        <p className="flex-1">
          <label htmlFor="mostrador-correo" className="font-semibold">
            Correo de la persona
          </label>
          <input
            id="mostrador-correo"
            name="borrower_email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(event) => onEmail(event.target.value)}
            className={FIELD_CLASS}
          />
        </p>
        <button type="submit" className={SECONDARY_BUTTON}>
          Ver vencidos
        </button>
      </form>
      <NoticeText notice={notice} />
      <OverdueList overdue={overdue} />
    </section>
  );
}

interface BookListProps {
  books: Book[] | null;
  selectedId: string | null;
  onSelect(bookId: string): void;
}

function BookList({ books, selectedId, onSelect }: BookListProps) {
  if (books === null) {
    return null;
  }
  if (books.length === 0) {
    return (
      <p role="status" className="mt-3">
        {DESK_MESSAGES.noBooks}
      </p>
    );
  }
  return (
    <fieldset className="mt-3">
      <legend className="font-semibold">Elige un libro</legend>
      <ul className="mt-2 grid gap-2 md:grid-cols-2">
        {books.map((book) => (
          <li key={book.id}>
            <label className="flex min-h-11 items-start gap-3 rounded border border-control-border bg-surface p-3">
              <input
                type="radio"
                name="book_id"
                value={book.id}
                checked={selectedId === book.id}
                onChange={() => onSelect(book.id)}
                className="mt-1 size-5"
              />
              <strong className="break-words">{book.title}</strong>
              <em className="break-words not-italic text-ink-muted">
                {book.author} · {availabilityLabel(book)}
              </em>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

interface BookSectionProps extends BookListProps {
  query: string;
  onQuery(value: string): void;
  notice: Notice | null;
  selected: Book | null;
  onSearch(event: FormEvent<HTMLFormElement>): void;
}

function BookSection(props: BookSectionProps) {
  return (
    <section aria-labelledby="mostrador-libro" className={SECTION_CLASS}>
      <h2 id="mostrador-libro" className={HEADING_CLASS}>
        2. Libro
      </h2>
      <form onSubmit={props.onSearch} role="search" className="mt-3 flex flex-col gap-3 md:flex-row md:items-end">
        <p className="flex-1">
          <label htmlFor="mostrador-libro-q" className="font-semibold">
            Título o autor
          </label>
          <input
            id="mostrador-libro-q"
            name="q"
            type="search"
            maxLength={100}
            value={props.query}
            onChange={(event) => props.onQuery(event.target.value)}
            className={FIELD_CLASS}
          />
        </p>
        <button type="submit" className={SECONDARY_BUTTON}>
          Buscar libro
        </button>
      </form>
      <NoticeText notice={props.notice} />
      <BookList books={props.books} selectedId={props.selectedId} onSelect={props.onSelect} />
      {props.selected !== null && (
        <p role="status" className="mt-3 font-semibold">
          Libro elegido: {props.selected.title}, de {props.selected.author}
        </p>
      )}
    </section>
  );
}

interface ActionSectionProps {
  pending: boolean;
  notice: Notice | null;
  onLend(): void;
  onReturn(): void;
}

function ActionSection({ pending, notice, onLend, onReturn }: ActionSectionProps) {
  return (
    <section aria-labelledby="mostrador-accion" className={SECTION_CLASS}>
      <h2 id="mostrador-accion" className={HEADING_CLASS}>
        3. Prestar o devolver
      </h2>
      <p className="mt-3 flex flex-col gap-3 md:flex-row">
        <button type="button" disabled={pending} onClick={onLend} className={PRIMARY_BUTTON}>
          Prestar
        </button>
        <button type="button" disabled={pending} onClick={onReturn} className={PRIMARY_BUTTON}>
          Registrar devolución
        </button>
      </p>
      <NoticeText notice={notice} />
    </section>
  );
}

function errorNotice(text: string): Notice {
  return { kind: "error", text };
}

/** Pantalla del mostrador: persona, libro y las dos acciones (spec F34, reglas 2–4). */
export function LoanDesk() {
  const [email, setEmail] = useState("");
  const [overdue, setOverdue] = useState<OverdueLoansResponse | null>(null);
  const [personNotice, setPersonNotice] = useState<Notice | null>(null);
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState<string | null>(null);
  const [books, setBooks] = useState<Book[] | null>(null);
  const [bookNotice, setBookNotice] = useState<Notice | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<Notice | null>(null);
  const [pending, setPending] = useState(false);

  /** Busca libros y quita el elegido (regla 3.5). */
  async function loadBooks(text: string): Promise<void> {
    setSelectedId(null);
    const result = await searchBooks(text);
    if (!result.ok) {
      setBooks(null);
      setBookNotice(errorNotice(result.message));
      return;
    }
    setSearched(text);
    setBooks(result.data);
    setBookNotice(null);
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await loadBooks(query.trim());
  }

  async function handleShowOverdue(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setOverdue(null);
    const trimmed = email.trim();
    if (trimmed.length === 0) {
      setPersonNotice(errorNotice(DESK_MESSAGES.missingEmail));
      return;
    }
    const result = await listOverdue(trimmed);
    if (!result.ok) {
      setPersonNotice(errorNotice(result.message));
      return;
    }
    setPersonNotice(null);
    setOverdue(result.data);
  }

  /** Ejecuta prestar o devolver y deja la pantalla lista para la siguiente acción (reglas 4.2, 4.7 y 4.8). */
  async function act<T>(run: typeof lendBook | typeof returnBook, describe: (data: T) => string): Promise<void> {
    const input = readyToAct(email, selectedId);
    if (input === null) {
      setActionNotice(errorNotice(DESK_MESSAGES.missingData));
      return;
    }
    setPending(true);
    setActionNotice(null);
    const result = (await run(input)) as DeskResult<T>;
    if (!result.ok) {
      setActionNotice(errorNotice(result.message));
      setPending(false);
      return;
    }
    setActionNotice({ kind: "ok", text: describe(result.data) });
    setOverdue(null);
    setPersonNotice(null);
    await loadBooks(searched ?? "");
    setPending(false);
  }

  const selected = books?.find((book) => book.id === selectedId) ?? null;

  return (
    <>
      <PersonSection
        email={email}
        onEmail={setEmail}
        overdue={overdue}
        notice={personNotice}
        onShowOverdue={handleShowOverdue}
      />
      <BookSection
        query={query}
        onQuery={setQuery}
        notice={bookNotice}
        books={books}
        selectedId={selectedId}
        selected={selected}
        onSelect={setSelectedId}
        onSearch={handleSearch}
      />
      <ActionSection
        pending={pending}
        notice={actionNotice}
        onLend={() => act(lendBook, lendSuccessMessage)}
        onReturn={() => act(returnBook, returnSuccessMessage)}
      />
    </>
  );
}
