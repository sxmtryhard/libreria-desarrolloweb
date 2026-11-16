import { ZodError, type z } from "zod";
import type { ErrorField, ErrorResponse } from "@/shared/schema";
import { AppError, ForbiddenError, INTERNAL_ERROR_MESSAGE, ValidationError } from "./errors";

const VALIDATION_MESSAGE = "Los datos enviados no son válidos.";
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function errorResponse(status: number, body: ErrorResponse): Response {
  return Response.json(body, { status });
}

function fieldsOf(error: ZodError): ErrorField[] {
  return error.issues.map((issue) => ({ path: issue.path.map(String).join("."), message: issue.message }));
}

/**
 * Traduce cualquier error a la respuesta HTTP de la API (spec F0, reglas 1.1–1.5).
 * Un error inesperado nunca filtra su detalle: solo queda en el registro del servidor.
 */
export function errorToResponse<T>(error: T): Response {
  if (error instanceof AppError) {
    return errorResponse(error.status, { error: { code: error.code, message: error.message } });
  }
  if (error instanceof ZodError) {
    return errorResponse(400, {
      error: { code: "VALIDACION", message: VALIDATION_MESSAGE, fields: fieldsOf(error) },
    });
  }
  console.error("Error inesperado:", error);
  return errorResponse(500, { error: { code: "ERROR_INTERNO", message: INTERNAL_ERROR_MESSAGE } });
}

function hostOfOrigin(origin: string | null): string | null {
  if (origin === null || !URL.canParse(origin)) {
    return null;
  }
  return new URL(origin).host;
}

/**
 * Valida el origen de una petición que modifica datos (spec F0, reglas 2.1–2.3).
 * Llámala antes de leer la sesión y el cuerpo (regla 2.4).
 */
export function assertSameOrigin(request: Request): void {
  if (!MUTATING_METHODS.has(request.method.toUpperCase())) {
    return;
  }
  const originHost = hostOfOrigin(request.headers.get("origin"));
  const requestHost = request.headers.get("host") ?? new URL(request.url).host;
  if (originHost === null || originHost.length === 0 || originHost !== requestHost) {
    throw new ForbiddenError("Origen no permitido.");
  }
}

async function readJson(request: Request): Promise<z.core.util.JSONType> {
  const text = await request.text();
  try {
    return JSON.parse(text) as z.core.util.JSONType;
  } catch {
    throw new ValidationError("El cuerpo de la petición no es JSON válido.");
  }
}

/** Lee y valida el cuerpo JSON de una petición (spec F0, regla 1.6). Un ZodError se traduce a 400. */
export async function readJsonBody<S extends z.ZodType>(request: Request, schema: S): Promise<z.output<S>> {
  return schema.parse(await readJson(request));
}
