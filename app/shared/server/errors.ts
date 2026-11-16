import type { ErrorCode } from "@/shared/schema";

/** Errores de dominio (spec F0, regla 1.1). Cada clase fija su código y su estado HTTP. */
export abstract class AppError extends Error {
  abstract readonly code: ErrorCode;
  abstract readonly status: number;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  readonly code = "VALIDACION";
  readonly status = 400;

  constructor(message = "Los datos enviados no son válidos.") {
    super(message);
  }
}

export class UnauthenticatedError extends AppError {
  readonly code = "NO_AUTENTICADO";
  readonly status = 401;

  constructor(message = "Debes iniciar sesión.") {
    super(message);
  }
}

export class ForbiddenError extends AppError {
  readonly code = "NO_AUTORIZADO";
  readonly status = 403;

  constructor(message = "No tienes permiso para hacer esto.") {
    super(message);
  }
}

export class NotFoundError extends AppError {
  readonly code = "NO_ENCONTRADO";
  readonly status = 404;

  constructor(message = "No se encontró lo que buscabas.") {
    super(message);
  }
}

export class ConflictError extends AppError {
  readonly code = "CONFLICTO";
  readonly status = 409;

  constructor(message = "La operación no se puede completar en el estado actual.") {
    super(message);
  }
}

export const INTERNAL_ERROR_MESSAGE = "Ocurrió un error inesperado.";
