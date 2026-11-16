import { lendBookHandler } from "@/features/container";

/** Prestar un libro físico (spec F5). */
export async function POST(request: Request): Promise<Response> {
  return lendBookHandler(request);
}
