import { reactivateAccountHandler } from "@/features/container";

/** Reactiva una cuenta; solo el personal (spec F14). */
export async function POST(request: Request): Promise<Response> {
  return reactivateAccountHandler(request);
}
