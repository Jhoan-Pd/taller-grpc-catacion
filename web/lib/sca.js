// Formulario SCA compartido por la web y las rutas API.
export const ESCALA = [
  { campo: "fragancia", nombre: "Fragancia / Aroma", ayuda: "Lo que hueles en seco y al romper la costra" },
  { campo: "sabor", nombre: "Sabor", ayuda: "Intensidad y calidad de los sabores en boca" },
  { campo: "residual", nombre: "Sabor residual", ayuda: "Lo que queda después de escupir" },
  { campo: "acidez", nombre: "Acidez", ayuda: "Brillo y vivacidad (cítrica, málica…)" },
  { campo: "cuerpo", nombre: "Cuerpo", ayuda: "Textura y peso en la boca" },
  { campo: "balance", nombre: "Balance", ayuda: "Cómo se complementan los atributos" },
  { campo: "puntaje_catador", nombre: "Puntaje del catador", ayuda: "Tu impresión global" },
];

export const TAZAS = [
  { campo: "uniformidad", nombre: "Uniformidad" },
  { campo: "taza_limpia", nombre: "Taza limpia" },
  { campo: "dulzor", nombre: "Dulzor" },
];

export function atributosIniciales() {
  return {
    fragancia: 8, sabor: 8, residual: 8, acidez: 8, cuerpo: 8, balance: 8, puntaje_catador: 8,
    uniformidad: 5, taza_limpia: 5, dulzor: 5,
  };
}

export function calcularTotal(a, tazasDefectuosas = 0, intensidad = 0) {
  const escala = ESCALA.reduce((s, { campo }) => s + Number(a[campo]), 0);
  const tazas = 2 * TAZAS.reduce((s, { campo }) => s + Number(a[campo]), 0);
  return Math.round((escala + tazas - tazasDefectuosas * intensidad) * 100) / 100;
}

export function clasificar(p) {
  if (p >= 90) return "Especialidad · Excepcional";
  if (p >= 85) return "Especialidad · Excelente";
  if (p >= 80) return "Especialidad · Muy bueno";
  return "No especialidad";
}

export const MUESTRAS_EJEMPLO = [
  { finca: "Finca El Mirador", productor: "Rosa Delia Erazo", region: "Nariño", variedad: "Caturra", proceso: "Lavado" },
  { finca: "Finca La Cumbre", productor: "Hernán Quintero", region: "Huila", variedad: "Geisha", proceso: "Natural" },
  { finca: "Finca Los Guaduales", productor: "Familia Ospina", region: "Quindío", variedad: "Castillo", proceso: "Lavado" },
  { finca: "Finca Monte Alto", productor: "Asociación Serranía", region: "Sierra Nevada", variedad: "Típica", proceso: "Lavado" },
  { finca: "Finca El Recreo", productor: "Ernesto Perdomo", region: "Huila", variedad: "Bourbon rosado", proceso: "Honey" },
  { finca: "Finca La Palma", productor: "Luz Mery Chantre", region: "Cauca", variedad: "Colombia", proceso: "Natural" },
];
