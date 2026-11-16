import { returnBookHandler } from "@/features/container";

/** Devolver un libro (spec F6). */
export async function POST(request: Request): Promise<Response> {
  return returnBookHandler(request);
}
