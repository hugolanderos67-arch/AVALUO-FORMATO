// Tasa de capitalización por calificación de características: cada concepto se califica en una de cinco
// columnas (tasas de 6 a 10 %) y la tasa aplicable es el promedio de las columnas elegidas.
const CAP_RATE_COLUMNS = [6, 7, 8, 9, 10];

const CAP_RATE_CONCEPTS = [
  { key: 'age', label: 'Edad (años) o última reparación', options: ['0 a 10', '10 a 20', '20 a 30', '30 a 40', '40 o más'] },
  { key: 'use', label: 'Uso', options: ['Bueno', 'Adecuado', 'Regular', 'Deficiente', 'Malo'] },
  { key: 'conservation', label: 'Estado de conservación', options: ['Bueno', 'Normal', 'Regular', 'Malo', 'Ruinoso'] },
  { key: 'projectQuality', label: 'Calidad de proyecto', options: ['Muy bueno', 'Bueno', 'Regular', 'Deficiente', 'Malo'] },
  { key: 'probableLife', label: 'Vida probable (años)', options: ['Más de 35', '30 a 35', '25 a 30', '20 a 25', 'Menos de 20'] },
  { key: 'location', label: 'Ubicación', options: ['Esquina comercial', 'Esquina residencial', 'Intermedio', 'Interior comercial', 'Interior'] },
  { key: 'zone', label: 'Zona de ubicación', options: ['Muy buena', 'Buena', 'Regular', 'Deficiente', 'Mala'] }
];

function round(value, decimals) {
  return Number(value.toFixed(decimals));
}

// ratings: { age: 0..4, use: 0..4, ... } con el índice de la columna elegida para cada concepto.
function calculateCapRateMatrix(ratings = {}) {
  const rows = CAP_RATE_CONCEPTS.map(({ key, label, options }) => {
    const raw = ratings[key];
    const index = raw === '' || raw === null || raw === undefined ? -1 : Number(raw);
    const valid = Number.isInteger(index) && index >= 0 && index < CAP_RATE_COLUMNS.length;
    return { key, label, options, index: valid ? index : -1, option: valid ? options[index] : '', column: valid ? CAP_RATE_COLUMNS[index] : 0 };
  });
  const rated = rows.filter(row => row.index >= 0);
  const conceptCount = CAP_RATE_CONCEPTS.length;
  const counts = CAP_RATE_COLUMNS.map((_, index) => rows.filter(row => row.index === index).length);
  const factors = CAP_RATE_COLUMNS.map(column => round(column / conceptCount, 4));
  const partials = counts.map((count, index) => round(count * CAP_RATE_COLUMNS[index] / conceptCount, 4));
  const complete = rated.length === conceptCount;
  const exactRate = complete ? round(rated.reduce((sum, row) => sum + row.column, 0) / conceptCount, 4) : 0;

  return {
    columns: CAP_RATE_COLUMNS,
    rows,
    ratedCount: rated.length,
    conceptCount,
    complete,
    counts,
    factors,
    partials,
    exactRate,
    // Tasa en números redondos (%), la que se aplica en la capitalización.
    rate: complete ? round(exactRate, 2) : 0
  };
}

module.exports = { CAP_RATE_COLUMNS, CAP_RATE_CONCEPTS, calculateCapRateMatrix };
