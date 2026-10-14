import { cargarMuestras, respuestaError } from "@/lib/grpc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAMPOS = ["finca", "productor", "region", "variedad", "proceso"];

// Client streaming: CargarMuestras (una muestra por mensaje)
export async function POST(req, { params }) {
  const { id } = await params;
  const { muestras } = await req.json().catch(() => ({}));
  if (!Array.isArray(muestras) || muestras.length === 0 || muestras.length > 30) {
    return Response.json({ error: "Envía entre 1 y 30 muestras" }, { status: 400 });
  }
  const limpias = muestras
    .map((m) => Object.fromEntries(CAMPOS.map((c) => [c, String(m?.[c] ?? "").trim().slice(0, 60)])))
    .filter((m) => m.finca);
  if (!limpias.length) {
    return Response.json({ error: "Cada muestra necesita al menos el nombre de la finca" }, { status: 400 });
  }
  try {
    return Response.json(await cargarMuestras(id, limpias));
  } catch (e) {
    return respuestaError(e);
  }
}
