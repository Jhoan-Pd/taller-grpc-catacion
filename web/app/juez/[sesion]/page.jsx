"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ESCALA, TAZAS, atributosIniciales, calcularTotal, clasificar } from "@/lib/sca";

const CLAVE_JUEZ = "catacion-juez";

function Tazas({ valor, onChange, nombre }) {
  return (
    <div className="tazas" role="group" aria-label={nombre}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" className={`taza ${i <= valor ? "" : "vacia"}`}
          aria-label={`${i} tazas`} aria-pressed={i <= valor}
          onClick={() => onChange(i === valor ? i - 1 : i)} />
      ))}
    </div>
  );
}

function Retro({ r }) {
  const clase = !r.aceptada ? "rechazada" : r.calibrado ? "" : "descalibrado";
  return (
    <div className={`tarjeta retro ${clase}`}>
      {!r.aceptada ? (
        <>
          <strong style={{ color: "var(--error)" }}>Calificación rechazada</strong>
          <ul>{r.errores.map((e) => <li key={e}>{e}</li>)}</ul>
        </>
      ) : (
        <>
          <div className="botones" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
            <strong style={{ color: r.calibrado ? "var(--ok)" : "var(--alerta)" }}>
              {r.calibrado ? "✓ " : "⚠ "}
              {r.otros_jueces >= 3 ? (r.calibrado ? "Calibrado con el panel" : "Descalibrado") : "Recibida"}
            </strong>
            <span className="mono">
              {r.puntaje_total.toFixed(2)}
              {r.otros_jueces > 0 && <span className="sutil"> · panel {r.promedio_panel.toFixed(2)}</span>}
            </span>
          </div>
          <ul className="peque">{r.observaciones.map((o) => <li key={o}>{o}</li>)}</ul>
        </>
      )}
    </div>
  );
}

export default function Juez() {
  const { sesion: id } = useParams();
  const [sesion, setSesion] = useState(null);
  const [error, setError] = useState("");
  const [nombre, setNombre] = useState("");
  const [listo, setListo] = useState(false);
  const [activa, setActiva] = useState(null);
  const [formularios, setFormularios] = useState({});
  const [retros, setRetros] = useState({});
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    try { setNombre(localStorage.getItem(CLAVE_JUEZ) || ""); } catch {}
    fetch(`/api/sesiones/${id}`).then(async (r) => {
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setSesion(d);
      setActiva(d.codigos_muestras[0] ?? null);
    }).catch((e) => setError(e.message));
  }, [id]);

  const form = (activa && formularios[activa]) || { atributos: atributosIniciales(), defectos: 0, intensidad: 2, notas: "" };
  const actualizar = (cambio) => setFormularios((f) => ({ ...f, [activa]: { ...form, ...cambio } }));
  const setAtributo = (campo, v) => actualizar({ atributos: { ...form.atributos, [campo]: v } });
  const total = useMemo(
    () => calcularTotal(form.atributos, form.defectos, form.defectos ? form.intensidad : 0),
    [form],
  );

  async function enviar() {
    setEnviando(true);
    setError("");
    try {
      const r = await fetch(`/api/sesiones/${id}/calificaciones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          juez: nombre.trim(), codigo_muestra: activa, atributos: form.atributos,
          tazas_defectuosas: form.defectos, intensidad_defecto: form.defectos ? form.intensidad : 0,
          notas: form.notas,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setRetros((x) => ({ ...x, [activa]: d }));
      if (d.aceptada) {
        const siguiente = sesion.codigos_muestras.find((c) => c !== activa && !retros[c]);
        if (siguiente) setTimeout(() => setActiva(siguiente), 1800);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  }

  if (error && !sesion) {
    return (
      <div className="pila">
        <div className="aviso error">{error}</div>
        <Link href="/">← Volver</Link>
      </div>
    );
  }
  if (!sesion) return <p className="sutil">Cargando la mesa…</p>;

  if (!listo) {
    return (
      <div className="tarjeta pila" style={{ maxWidth: 480, margin: "0 auto" }}>
        <span className="etiqueta">Sesión <span className="codigo">{sesion.id}</span></span>
        <h2>{sesion.nombre}</h2>
        <p className="sutil">{sesion.codigos_muestras.length} muestras en la mesa. ¿Cómo te llamas?</p>
        <form className="pila" onSubmit={(e) => {
          e.preventDefault();
          if (!nombre.trim()) return;
          try { localStorage.setItem(CLAVE_JUEZ, nombre.trim()); } catch {}
          setListo(true);
        }}>
          <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tu nombre de juez" maxLength={40} autoFocus />
          <button className="boton" disabled={!nombre.trim() || sesion.revelada}>Empezar a catar</button>
          {sesion.revelada && <div className="aviso alerta">Esta sesión ya fue revelada.</div>}
        </form>
      </div>
    );
  }

  if (!sesion.codigos_muestras.length) {
    return <div className="aviso alerta">La mesa todavía no tiene muestras. Recarga cuando el organizador las sirva.</div>;
  }

  const hechas = Object.values(retros).filter((r) => r.aceptada).length;

  return (
    <div className="pila">
      <div className="botones" style={{ justifyContent: "space-between", alignItems: "end" }}>
        <div>
          <span className="etiqueta">Juez · {nombre} · <span className="rpc">Catar · bidirectional</span></span>
          <h1 style={{ fontSize: "2rem" }}>{sesion.nombre}</h1>
        </div>
        <span className="sutil peque">{hechas} de {sesion.codigos_muestras.length} tazas calificadas</span>
      </div>

      <div className="pestanas">
        {sesion.codigos_muestras.map((c) => (
          <button key={c} className={`pestana ${c === activa ? "activa" : ""} ${retros[c]?.aceptada ? "hecha" : ""}`}
            onClick={() => setActiva(c)}>{c}</button>
        ))}
      </div>

      {error && <div className="aviso error">{error}</div>}

      <div className="rejilla rejilla-2" style={{ alignItems: "start" }}>
        <div className="tarjeta">
          <h3>Muestra <span className="codigo">{activa}</span></h3>
          {ESCALA.map(({ campo, nombre: n, ayuda }) => (
            <div key={campo} className="atributo">
              <label htmlFor={campo} style={{ margin: 0 }}>{n}</label>
              <span className="valor">{form.atributos[campo].toFixed(2)}</span>
              <input id={campo} type="range" min={6} max={10} step={0.25} value={form.atributos[campo]}
                onChange={(e) => setAtributo(campo, Number(e.target.value))} />
              <span className="ayuda">{ayuda}</span>
            </div>
          ))}
          {TAZAS.map(({ campo, nombre: n }) => (
            <div key={campo} className="atributo">
              <label style={{ margin: 0 }}>{n} <span className="sutil">(tazas buenas)</span></label>
              <Tazas nombre={n} valor={form.atributos[campo]} onChange={(v) => setAtributo(campo, v)} />
            </div>
          ))}
          <div className="atributo">
            <label style={{ margin: 0 }}>Tazas con defecto</label>
            <Tazas nombre="Tazas con defecto" valor={form.defectos} onChange={(v) => actualizar({ defectos: v })} />
            {form.defectos > 0 && (
              <select value={form.intensidad} onChange={(e) => actualizar({ intensidad: Number(e.target.value) })}
                style={{ gridColumn: "1 / -1" }}>
                <option value={2}>Defecto leve (−2 por taza)</option>
                <option value={4}>Falla grave (−4 por taza)</option>
              </select>
            )}
          </div>
          <div style={{ marginTop: 12 }}>
            <label htmlFor="notas">Notas de taza</label>
            <textarea id="notas" rows={2} placeholder="panela, mandarina, cacao…" value={form.notas}
              onChange={(e) => actualizar({ notas: e.target.value })} />
          </div>
        </div>

        <div className="pila" style={{ position: "sticky", top: 76 }}>
          <div className="tarjeta pila">
            <span className="etiqueta">Puntaje total</span>
            <div className="total-grande">{total.toFixed(2)}</div>
            <div className="sutil">{clasificar(total)}</div>
            <button className="boton" onClick={enviar} disabled={enviando}>
              {enviando ? "Enviando por gRPC…" : retros[activa]?.aceptada ? "Corregir calificación" : "Enviar calificación"}
            </button>
          </div>
          {retros[activa] && <Retro r={retros[activa]} />}
          <Link className="peque" href={`/panel/${id}`} target="_blank">Ver el panel en vivo ↗</Link>
        </div>
      </div>
    </div>
  );
}
