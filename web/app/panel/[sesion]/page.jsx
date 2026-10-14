"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Ranking from "@/components/Ranking";

export default function Panel() {
  const { sesion: id } = useParams();
  const [ranking, setRanking] = useState([]);
  const [eventos, setEventos] = useState([]);
  const [conexion, setConexion] = useState("conectando");
  const [error, setError] = useState("");
  const [nombre, setNombre] = useState("");

  useEffect(() => {
    fetch(`/api/sesiones/${id}`).then((r) => r.json()).then((d) => d.nombre && setNombre(d.nombre)).catch(() => {});

    // Server streaming de gRPC, reenviado por la ruta API como Server-Sent Events
    const fuente = new EventSource(`/api/sesiones/${id}/eventos`);
    fuente.addEventListener("evento", (e) => {
      const ev = JSON.parse(e.data);
      setConexion("en vivo");
      setError("");
      setRanking(ev.ranking);
      if (ev.tipo !== "CONEXION") {
        setEventos((xs) => [{ hora: new Date(), texto: ev.mensaje }, ...xs].slice(0, 12));
      }
      if (ev.tipo === "RESULTADOS_REVELADOS") {
        setConexion("finalizada");
        fuente.close();
      }
    });
    fuente.addEventListener("fallo", (e) => {
      const d = JSON.parse(e.data);
      setError(d.error);
      if (d.codigo === "NOT_FOUND") fuente.close();
    });
    fuente.onerror = () => setConexion((c) => (c === "finalizada" ? c : "reconectando"));
    return () => fuente.close();
  }, [id]);

  const revelado = ranking.some((p) => p.finca);
  const ganador = ranking[0];
  const calificaciones = ranking.reduce((s, p) => s + p.calificaciones, 0);

  return (
    <div className="pila">
      <div className="botones" style={{ justifyContent: "space-between", alignItems: "end" }}>
        <div>
          <span className="etiqueta">Panel en vivo · <span className="rpc">SeguirSesion · server streaming</span></span>
          <h1>{nombre || "Catación"} <span className="codigo" style={{ fontSize: "1.2rem", verticalAlign: "middle" }}>{id}</span></h1>
        </div>
        <span className="peque sutil">
          <span className={`punto ${conexion === "en vivo" || conexion === "finalizada" ? "ok" : conexion === "reconectando" ? "mal" : ""}`} />{" "}
          {conexion} · {calificaciones} calificaciones
        </span>
      </div>

      {error && <div className="aviso error">{error}</div>}

      {revelado && ganador?.calificaciones > 0 && (
        <div className="banner-ganador">
          <span className="etiqueta" style={{ color: "var(--papel)" }}>Mejor taza · {ganador.promedio.toFixed(2)} puntos</span>
          <h2>{ganador.finca}</h2>
          <div>{[ganador.productor, ganador.region, ganador.variedad, ganador.proceso].filter(Boolean).join(" · ")}</div>
        </div>
      )}

      <div className="rejilla panel-rejilla">
        <div className="tarjeta"><Ranking ranking={ranking} revelado={revelado} /></div>
        <div className="tarjeta">
          <h3>Actividad</h3>
          {eventos.length ? (
            <ul className="feed">
              {eventos.map((e, i) => (
                <li key={i}><time>{e.hora.toLocaleTimeString("es-CO", { hour12: false })}</time>{e.texto}</li>
              ))}
            </ul>
          ) : <p className="sutil peque">Esperando que los jueces empiecen…</p>}
        </div>
      </div>
    </div>
  );
}
