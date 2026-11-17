"use client";

import { type FormEvent, useState } from "react";
import { FORM_CLASS, FormFeedback, FormField, SUBMIT_CLASS } from "@/shared/ui/form-field";
import { FORM_MESSAGES } from "@/shared/ui/form-messages";
import { postForm } from "@/shared/ui/post-form";
import { BookSchema } from "../schema";
import {
  type BookForm as BookFormData,
  bookProblem,
  bookSuccessMessage,
  INITIAL_COPIES,
  toRegisterBookBody,
} from "./book-form-view";

const ERROR_ID = "libro-error";
const EMPTY: BookFormData = { title: "", author: "", isbn: "", copies: INITIAL_COPIES };

function buttonLabel(pending: boolean): string {
  if (pending) {
    return FORM_MESSAGES.pending;
  }
  return "Registrar libro";
}

function describedBy(error: string | null): string | undefined {
  if (error === null) {
    return undefined;
  }
  return ERROR_ID;
}

/** Formulario para registrar un libro (spec F36, reglas 2 y 4). Usa `POST /api/books` (F1). */
export function BookForm() {
  const [form, setForm] = useState<BookFormData>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function update(field: keyof BookFormData): (value: string) => void {
    return (value) => setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSuccess(null);
    const problem = bookProblem(form);
    if (problem !== null) {
      setError(problem);
      return;
    }
    setPending(true);
    setError(null);
    const outcome = await postForm("/api/books", toRegisterBookBody(form), BookSchema);
    setPending(false);
    if (!outcome.ok) {
      setError(outcome.message);
      return;
    }
    setSuccess(bookSuccessMessage(outcome.value.title, outcome.value.total_copies));
    setForm(EMPTY);
  }

  const common = { disabled: pending, describedBy: describedBy(error) };
  return (
    <form onSubmit={handleSubmit} noValidate className={FORM_CLASS}>
      <FormField
        id="libro-titulo"
        label="Título"
        type="text"
        autoComplete="off"
        value={form.title}
        onChange={update("title")}
        {...common}
      />
      <FormField
        id="libro-autor"
        label="Autor"
        type="text"
        autoComplete="off"
        value={form.author}
        onChange={update("author")}
        {...common}
      />
      <FormField
        id="libro-isbn"
        label="ISBN"
        type="text"
        autoComplete="off"
        value={form.isbn}
        onChange={update("isbn")}
        {...common}
      />
      <FormField
        id="libro-ejemplares"
        label="Ejemplares"
        type="number"
        inputMode="numeric"
        autoComplete="off"
        value={form.copies}
        onChange={update("copies")}
        {...common}
      />
      <FormFeedback errorId={ERROR_ID} error={error} success={success} />
      <button type="submit" disabled={pending} className={SUBMIT_CLASS}>
        {buttonLabel(pending)}
      </button>
    </form>
  );
}
