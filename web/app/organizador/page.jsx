"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Ranking from "@/components/Ranking";
import EstadoServidor from "@/components/EstadoServidor";
import { MUESTRAS_EJEMPLO } from "@/lib/sca";

const CLAVE = "catacion-organizador";
const VACIA = { finca: "", productor: "", region: "", variedad: "", proceso: "" };

async function api(url, cuerpo) {
  const r = await fetch(url, {
    method: cuerpo === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(datos.error || `Error ${r.status}`);
  return datos;
}

function Paso({ n, hecho, titulo, rpc, children }) {
  return (
    <div className={`tarjeta paso ${hecho ? "hecho" : ""}`}>
      <div className="paso-num">{hecho ? "✓" : n}</div>
      <div className="paso-cuerpo pila">
        <div className="botones" style={{ alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>{titulo}</h3>
          {rpc && <span className="rpc">{rpc}</span>}
        </div>
        {children}
      </div>
    </div>
  );
}

export default function Organizador() {
  const [nombre, setNombre] = useState("Catación del taller");
  const [sesion, setSesion] = useState(null);
  const [muestras, setMuestras] = useState(MUESTRAS_EJEMPLO);
  const [asignaciones, setAsignaciones] = useState([]);
  const [simulacion, setSimulacion] = useState(null);
  const [resultados, setResultados] = useState(null);
  const [ocupado, setOcupado] = useState("");
  const [error, setError] = useState("");
  const [copiado, setCopiado] = useState("");

  // Recuperar la sesión si se recarga la página
  useEffect(() => {
    try {
      const guardado = JSON.parse(localStorage.getItem(CLAVE) || "null");
      if (guardado?.sesion) {
        setSesion(guardado.sesion);
        setAsignaciones(guardado.asignaciones || []);
      }
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem(CLAVE, JSON.stringify({ sesion, asignaciones })); } catch {}
  }, [sesion, asignaciones]);

  async function ejecutar(etiqueta, fn) {
    setOcupado(etiqueta);
    setError("");
    try { await fn(); } catch (e) { setError(e.message); } finally { setOcupado(""); }
  }

  const crear = () => ejecutar("crear", async () => {
    const s = await api("/api/sesiones", { nombre });
    setSesion(s); setAsignaciones([]); setSimulacion(null); setResultados(null);
  });
  const servir = () => ejecutar("servir", async () => {
    const r = await api(`/api/sesiones/${sesion.id}/muestras`, { muestras: muestras.filter((m) => m.finca.trim()) });
    setAsignaciones((prev) => [...prev, ...r.asignaciones]);
  });
  const simular = () => ejecutar("simular", async () => {
    setSimulacion(await api(`/api/sesiones/${sesion.id}/simulacion`, { jueces: 5 }));
  });
  const revelar = () => ejecutar("revelar", async () => {
    setResultados(await api(`/api/sesiones/${sesion.id}/revelar`, {}));
  });
  const nueva = () => {
    setSesion(null); setAsignaciones([]); setSimulacion(null); setResultados(null); setError("");
  };

  const editar = (i, campo, valor) =>
    setMuestras((ms) => ms.map((m, j) => (j === i ? { ...m, [campo]: valor } : m)));

  const enlace = (ruta) => (typeof window === "undefined" ? ruta : `${window.location.origin}${ruta}`);
  const copiar = async (texto, que) => {
    try { await navigator.clipboard.writeText(texto); setCopiado(que); setTimeout(() => setCopiado(""), 1500); } catch {}
  };

  const descalibradas = simulacion?.retroalimentacion.filter((r) => r.aceptada && !r.calibrado) ?? [];
  const ganador = resultados?.ranking?.[0];

  return (
    <div className="pila">
      <div>
        <span className="etiqueta">Organizador</span>
        <h1>Montar la mesa de catación</h1>
        <EstadoServidor />
      </div>

      {error && <div className="aviso error">{error}</div>}

      <Paso n={1} hecho={!!sesion} titulo="Abrir la sesión" rpc="CrearSesion · unary">
        {sesion ? (
          <div className="pila">
            <div className="botones" style={{ alignItems: "center" }}>
              <span className="sutil">Código de la sesión</span>
              <span className="codigo" style={{ fontSize: "1.4rem" }}>{sesion.id}</span>
              <span className="sutil">{sesion.nombre}</span>
            </div>
            <div className="botones">
              <Link className="boton secundario peque" href={`/panel/${sesion.id}`} target="_blank">Abrir panel ↗</Link>
              <button className="boton secundario peque" onClick={() => copiar(enlace(`/juez/${sesion.id}`), "juez")}>
                {copiado === "juez" ? "¡Copiado!" : "Copiar enlace para jueces"}
              </button>
              <button className="boton secundario peque" onClick={nueva}>Nueva sesión</button>
            </div>
          </div>
        ) : (
          <div className="fila">
            <div>
              <label htmlFor="nombre">Nombre de la catación</label>
              <input id="nombre" type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div style={{ flex: "none" }}>
              <button className="boton" onClick={crear} disabled={!!ocupado}>
                {ocupado === "crear" ? "Creando…" : "Crear sesión"}
              </button>
            </div>
          </div>
        )}
      </Paso>

      {sesion && (
        <Paso n={2} hecho={asignaciones.length > 0} titulo="Servir las muestras" rpc="CargarMuestras · client streaming">
          {asignaciones.length > 0 ? (
            <div className="pila">
              <p className="sutil peque" style={{ margin: 0 }}>
                Marca cada taza con su código. Solo tú ves esta correspondencia.
              </p>
              <div className="rejilla rejilla-3">
                {asignaciones.map((a) => (
                  <div key={a.codigo} className="botones" style={{ alignItems: "center" }}>
                    <span className="codigo">{a.codigo}</span><span>{a.finca}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <p className="sutil peque">Cada fila viaja como un mensaje del stream. Puedes editar o quitar fincas.</p>
              {muestras.map((m, i) => (
                <div key={i} className="muestra-fila">
                  <input type="text" placeholder="Finca" value={m.finca} onChange={(e) => editar(i, "finca", e.target.value)} />
                  <input type="text" placeholder="Productor" value={m.productor} onChange={(e) => editar(i, "productor", e.target.value)} />
                  <input type="text" placeholder="Región" value={m.region} onChange={(e) => editar(i, "region", e.target.value)} />
                  <input type="text" placeholder="Variedad" value={m.variedad} onChange={(e) => editar(i, "variedad", e.target.value)} />
                  <input type="text" placeholder="Proceso" value={m.proceso} onChange={(e) => editar(i, "proceso", e.target.value)} />
                  <button className="boton secundario peque" aria-label="Quitar"
                    onClick={() => setMuestras((ms) => ms.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
              <div className="botones" style={{ marginTop: 12 }}>
                <button className="boton secundario peque" onClick={() => setMuestras((ms) => [...ms, { ...VACIA }])}>+ Agregar finca</button>
                <button className="boton" onClick={servir} disabled={!!ocupado || !muestras.some((m) => m.finca.trim())}>
                  {ocupado === "servir" ? "Enviando…" : "Servir la mesa"}
                </button>
              </div>
            </div>
          )}
        </Paso>
      )}

      {sesion && asignaciones.length > 0 && (
        <Paso n={3} hecho={!!simulacion} titulo="Calificar" rpc="Catar · bidirectional">
          <p className="sutil peque" style={{ margin: 0 }}>
            Comparte el enlace con los jueces reales, o simula un panel de 5 Q-Graders más un juez novato
            que sobrevalora la acidez. Cada juez abre su propio stream bidireccional.
          </p>
          <div className="botones">
            <button className="boton" onClick={simular} disabled={!!ocupado || !!resultados}>
              {ocupado === "simular" ? "Los jueces están catando…" : "Simular panel de jueces"}
            </button>
            <Link className="boton secundario" href={`/juez/${sesion.id}`} target="_blank">Calificar yo ↗</Link>
          </div>
          {simulacion && (
            <div className={`aviso ${descalibradas.length ? "alerta" : "ok"}`}>
              {simulacion.retroalimentacion.length} calificaciones recibidas de {simulacion.jueces.length} jueces.
              {descalibradas.length > 0 && (
                <> El servidor detectó <strong>{descalibradas.length}</strong> calificaciones descalibradas de:{" "}
                  <strong>{[...new Set(descalibradas.map((r) => r.juez))].join(", ")}</strong>.</>
              )}
            </div>
          )}
        </Paso>
      )}

      {sesion && asignaciones.length > 0 && (
        <Paso n={4} hecho={!!resultados} titulo="Revelar las fincas" rpc="RevelarResultados · unary">
          {!resultados ? (
            <div className="botones">
              <button className="boton" onClick={revelar} disabled={!!ocupado}>
                {ocupado === "revelar" ? "Revelando…" : "Revelar resultados"}
              </button>
            </div>
          ) : (
            <div className="pila">
              {ganador?.calificaciones > 0 && (
                <div className="banner-ganador">
                  <span className="etiqueta" style={{ color: "var(--papel)" }}>Mejor taza</span>
                  <h2>{ganador.finca}</h2>
                  <div>{[ganador.productor, ganador.region, ganador.variedad].filter(Boolean).join(" · ")} — {ganador.promedio.toFixed(2)} puntos</div>
                </div>
              )}
              <Ranking ranking={resultados.ranking} revelado />
            </div>
          )}
        </Paso>
      )}
    </div>
  );
}
