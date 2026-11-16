import { overdueLoansHandler } from "@/features/container";

/** Listar los préstamos vencidos de una persona (spec F8). */
export async function GET(request: Request): Promise<Response> {
  return overdueLoansHandler(request);
}
