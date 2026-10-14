// Tabla de posiciones. Antes de revelar solo hay códigos; después, las fincas.
export default function Ranking({ ranking = [], revelado = false }) {
  if (!ranking.length) return <p className="sutil">Todavía no hay muestras en la mesa.</p>;
  return (
    <div className="tabla-envoltura">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Muestra</th>
            {revelado && <th>Origen</th>}
            <th className="num">Puntaje</th>
            <th style={{ width: "22%" }} />
            <th className="num" title="Desviación entre jueces">±</th>
            <th className="num">Jueces</th>
            <th>Clasificación</th>
          </tr>
        </thead>
        <tbody>
          {ranking.map((p) => (
            <tr key={p.codigo} className={revelado && p.puesto === 1 && p.calificaciones ? "ganador" : ""}>
              <td><span className="puesto">{p.puesto}</span></td>
              <td>
                <span className="codigo">{p.codigo}</span>
                {revelado && <div style={{ fontWeight: 600, marginTop: 4 }}>{p.finca}</div>}
              </td>
              {revelado && (
                <td className="peque">
                  {p.productor && <div>{p.productor}</div>}
                  <div className="sutil">{[p.region, p.variedad, p.proceso].filter(Boolean).join(" · ")}</div>
                </td>
              )}
              <td className="num mono" style={{ fontWeight: 700, fontSize: "1.05rem" }}>
                {p.calificaciones ? p.promedio.toFixed(2) : "—"}
              </td>
              <td>
                <div className="barra-puntaje">
                  <span style={{ width: `${p.calificaciones ? Math.max(0, (p.promedio - 70) / 30) * 100 : 0}%` }} />
                </div>
              </td>
              <td className="num mono sutil">{p.calificaciones > 1 ? p.desviacion.toFixed(2) : "—"}</td>
              <td className="num mono">{p.calificaciones}</td>
              <td className="peque">{p.clasificacion.replace(" - ", " · ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
