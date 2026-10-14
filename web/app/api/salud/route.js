import { unary, destino, grpc } from "@/lib/grpc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Verifica que la web alcance el servidor gRPC. Pedimos una sesión que no
// existe: si responde NOT_FOUND, el servidor está vivo.
export async function GET() {
  const inicio = Date.now();
  try {
    await unary("ObtenerSesion", { sesion_id: "SALUD" }, 8);
    return Response.json({ ok: true, servidor: destino(), ms: Date.now() - inicio });
  } catch (e) {
    if (e.code === grpc.status.NOT_FOUND) {
      return Response.json({ ok: true, servidor: destino(), ms: Date.now() - inicio });
    }
    return Response.json(
      { ok: false, servidor: destino(), error: e.details || e.message, codigo: grpc.status[e.code] },
      { status: 503 },
    );
  }
}
