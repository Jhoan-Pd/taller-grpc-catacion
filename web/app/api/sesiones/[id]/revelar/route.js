import { unary, respuestaError } from "@/lib/grpc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Unary: RevelarResultados
export async function POST(_req, { params }) {
  const { id } = await params;
  try {
    return Response.json(await unary("RevelarResultados", { sesion_id: id }));
  } catch (e) {
    return respuestaError(e);
  }
}
