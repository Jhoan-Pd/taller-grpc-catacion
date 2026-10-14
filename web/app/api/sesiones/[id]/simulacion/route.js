import { unary, catar, respuestaError } from "@/lib/grpc";
import { ESCALA } from "@/lib/sca";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const cuarto = (v) => Math.min(10, Math.max(6, Math.round(v * 4) / 4));
function gauss(media, desv) {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return media + desv * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const barajar = (xs) => xs.map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);

// Simula un panel: N Q-Graders + un "Juez Novato" que sobrevalora acidez y sabor.
// Cada juez abre su propio stream bidireccional Catar y envía todas sus tazas.
export async function POST(req, { params }) {
  const { id } = await params;
  const { jueces = 5 } = await req.json().catch(() => ({}));
  const n = Math.min(10, Math.max(2, Number(jueces) || 5));
  try {
    const sesion = await unary("ObtenerSesion", { sesion_id: id });
    const codigos = sesion.codigos_muestras;
    if (!codigos.length) {
      return Response.json({ error: "La mesa todavía no tiene muestras" }, { status: 409 });
    }
    const calidad = Object.fromEntries(codigos.map((c) => [c, 7 + Math.random() * 2.1]));
    const irregulares = new Set(codigos.filter(() => Math.random() < 0.15));
    const panel = Array.from({ length: n }, (_, i) => ({ nombre: `Q-Grader ${i + 1}`, sesgo: {} }));
    panel.push({ nombre: "Juez Novato", sesgo: { acidez: 1.5, sabor: 1, puntaje_catador: 1 } });

    const resultados = await Promise.all(panel.map(({ nombre, sesgo }) => {
      const tazas = barajar(codigos).map((codigo) => ({
        sesion_id: id,
        juez: nombre,
        codigo_muestra: codigo,
        atributos: {
          ...Object.fromEntries(ESCALA.map(({ campo }) =>
            [campo, cuarto(gauss(calidad[codigo] + (sesgo[campo] || 0), 0.15))])),
          uniformidad: irregulares.has(codigo) ? 4 : 5,
          taza_limpia: 5,
          dulzor: 5,
        },
      }));
      return catar(tazas, { pausaMs: () => 250 + Math.random() * 700 });
    }));
    return Response.json({ jueces: panel.map((p) => p.nombre), retroalimentacion: resultados.flat() });
  } catch (e) {
    return respuestaError(e);
  }
}
