import type { z } from "zod";
import { ErrorResponseSchema } from "@/shared/schema";
import { FORM_MESSAGES, formFailureMessage } from "./form-messages";

/** Resultado de enviar un formulario: lo creado, o el mensaje de error para mostrar (spec F36, regla 4). */
export type PostOutcome<T> = { ok: true; value: T } | { ok: false; message: string };

async function serverMessageOf(response: Response): Promise<string | null> {
  try {
    return ErrorResponseSchema.parse(await response.json()).error.message;
  } catch {
    return null;
  }
}

/** Envía `body` como JSON y valida la respuesta con `schema` en el mismo punto (AGENTS.md, regla de código 1). */
export async function postForm<S extends z.ZodType>(
  url: string,
  body: object,
  schema: S,
): Promise<PostOutcome<z.output<S>>> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      return { ok: false, message: formFailureMessage(response.status, await serverMessageOf(response)) };
    }
    return { ok: true, value: schema.parse(await response.json()) };
  } catch {
    return { ok: false, message: FORM_MESSAGES.failed };
  }
}
