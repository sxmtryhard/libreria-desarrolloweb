"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { ErrorResponseSchema } from "@/shared/schema";
import { reasonProblem, TEACHER_REQUEST_MESSAGES, teacherRequestFailureMessage } from "./teacher-request-view";

const FIELD_ID = "solicitud-motivo";
const ERROR_ID = "solicitud-error";

async function serverMessageOf(response: Response): Promise<string | null> {
  try {
    return ErrorResponseSchema.parse(await response.json()).error.message;
  } catch {
    return null;
  }
}

/** Envía la solicitud; devuelve el mensaje de error o `null` si salió bien (regla 5.6). */
async function sendRequest(reason: string): Promise<string | null> {
  try {
    const response = await fetch("/api/teacher-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    if (response.ok) {
      return null;
    }
    return teacherRequestFailureMessage(response.status, await serverMessageOf(response));
  } catch {
    return TEACHER_REQUEST_MESSAGES.failed;
  }
}

function buttonLabel(pending: boolean): string {
  if (pending) {
    return "Enviando…";
  }
  return "Enviar solicitud";
}

function describedBy(error: string | null): string | undefined {
  if (error === null) {
    return undefined;
  }
  return ERROR_ID;
}

/**
 * Formulario para pedir el rol de docente (spec F11, reglas 5.5–5.7). La página lo deja siempre montado
 * y le dice con `showForm` si hay que mostrarlo: así «Solicitud enviada.» sigue a la vista tras refrescar.
 */
export function TeacherRequestForm({ showForm }: { showForm: boolean }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const problem = reasonProblem(reason);
    if (problem !== null) {
      setError(problem);
      return;
    }
    setPending(true);
    setError(null);
    const failure = await sendRequest(reason.trim());
    setPending(false);
    if (failure !== null) {
      setError(failure);
      return;
    }
    setSent(true);
    setReason("");
    router.refresh();
  }

  if (sent) {
    return (
      <p role="status" className="mt-6 font-semibold text-success">
        {TEACHER_REQUEST_MESSAGES.sent}
      </p>
    );
  }
  if (!showForm) {
    return null;
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="mt-6 space-y-4 rounded-lg border border-line bg-surface-alt p-4"
    >
      <p>
        <label htmlFor={FIELD_ID} className="font-semibold">
          Motivo
        </label>
        <textarea
          id={FIELD_ID}
          rows={5}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={pending}
          aria-describedby={describedBy(error)}
          className="mt-1 block min-h-11 w-full rounded border border-control-border bg-surface px-3 py-2 text-ink disabled:bg-surface-alt"
        />
      </p>
      {error !== null && (
        <p id={ERROR_ID} role="alert" className="font-semibold text-danger">
          Error: {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 w-full rounded bg-primary px-4 py-2 font-semibold text-surface hover:bg-primary-hover disabled:bg-primary-strong md:w-auto"
      >
        {buttonLabel(pending)}
      </button>
    </form>
  );
}
