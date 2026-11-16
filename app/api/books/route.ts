import { registerBookHandler, searchBooksHandler } from "@/features/container";

/** Buscar libros por título o autor (spec F2). Público. */
export async function GET(request: Request): Promise<Response> {
  return searchBooksHandler(request);
}

/** Registrar un libro (spec F1). */
export async function POST(request: Request): Promise<Response> {
  return registerBookHandler(request);
}
