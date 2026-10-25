const LAND_FACTOR_KEYS = ['negotiation', 'zone', 'location', 'surface', 'shape', 'topography'];
const RENT_FACTOR_KEYS = ['negotiation', 'zone', 'location', 'surface', 'age'];

function round(value, decimals = 2) {
  return Number(value.toFixed(decimals));
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

// Homologa comparables por valor unitario: (precio / superficie) × producto de factores. Un factor vacío o no positivo vale 1.
function homologateComparables(rows, factorKeys) {
  const table = (Array.isArray(rows) ? rows : [])
    .map((row, index) => {
      const price = positive(row.price);
      const surface = positive(row.surface);
      const factors = Object.fromEntries(factorKeys.map(key => [key, positive(row.factors?.[key]) || 1]));
      const factorProduct = Object.values(factors).reduce((product, factor) => product * factor, 1);
      const unitValue = price > 0 && surface > 0 ? price / surface : 0;
      return {
        id: row.id ?? index + 1,
        address: String(row.address || `Comparable ${index + 1}`),
        price: round(price),
        surface: round(surface),
        factors,
        factorProduct: round(factorProduct, 4),
        unitValue: round(unitValue),
        homologatedUnitValue: round(unitValue * factorProduct),
        valid: unitValue > 0
      };
    })
    .filter(row => row.price > 0 || row.surface > 0);

  const valid = table.filter(row => row.valid);
  return {
    rows: table,
    validCount: valid.length,
    averageUnitValue: valid.length ? round(valid.reduce((sum, row) => sum + row.homologatedUnitValue, 0) / valid.length) : 0
  };
}

// Factores de homologación de comparables de construcción (enfoque comparativo de mercado), en el orden del cuadro
// "Análisis por homologación y ajustes". Construcción y Acabados conservan los nombres de campo con que se guardaban
// (terrainFactor y shapeFactor), para que los avalúos anteriores se abran con sus factores.
const CONSTRUCTION_FACTORS = [
  { key: 'zone', field: 'zoneFactor', code: 'FZo', label: 'Factor de Zona' },
  { key: 'location', field: 'locationFactor', code: 'FUb', label: 'Factor de Ubicación' },
  { key: 'surface', field: 'surfaceFactor', code: 'FSu', label: 'Factor de Superficie' },
  { key: 'age', field: 'ageFactor', code: 'FEd', label: 'Factor de Edad' },
  { key: 'conservation', field: 'conservationFactor', code: 'FCo', label: 'Factor de Conservación' },
  { key: 'project', field: 'projectFactor', code: 'FPr', label: 'Factor por Proyecto' },
  { key: 'construction', field: 'terrainFactor', code: 'FCn', label: 'Factor de Construcción' },
  { key: 'finish', field: 'shapeFactor', code: 'FAc', label: 'Factor de Acabados' },
  { key: 'other', field: 'otherFactor', code: 'FOt', label: 'Factor Otro' },
  { key: 'negotiation', field: 'negotiationFactor', code: 'FNeg', label: 'Factor de Negociación' }
];

// Ponderación (%) de los comparables válidos. Sin ninguna capturada, todos pesan igual. Si se capturó alguna,
// las vacías valen 0 y, si no suman 100 %, se ajustan en proporción para que sumen 100 %.
function resolveWeights(rows) {
  if (!rows.length) return { weights: [], mode: 'none', capturedTotal: 0 };
  const captured = rows.map(row => (row.weightInput === null || row.weightInput === undefined || row.weightInput === '' ? null : Number(row.weightInput)));
  const anyCaptured = captured.some(value => Number.isFinite(value) && value > 0);
  if (!anyCaptured) return { weights: rows.map(() => 100 / rows.length), mode: 'equal', capturedTotal: 0 };
  const raw = captured.map(value => (Number.isFinite(value) && value > 0 ? value : 0));
  const total = raw.reduce((sum, value) => sum + value, 0);
  return {
    weights: raw.map(value => (value * 100) / total),
    mode: Math.abs(total - 100) < 0.005 ? 'captured' : 'normalized',
    capturedTotal: round(total)
  };
}

// Por comparable: valor unitario = precio / superficie; FRe = producto de factores (vacío o no positivo vale 1);
// valor ajustado = valor unitario × FRe; componente = valor ajustado × ponderación.
// Valor unitario ajustado y ponderado = suma de componentes.
function homologateConstructionComparables(rows) {
  const table = (Array.isArray(rows) ? rows : []).map((row, index) => {
    const salePrice = positive(row.salePrice);
    const surface = positive(row.surface);
    const factors = Object.fromEntries(CONSTRUCTION_FACTORS.map(({ key, field }) => [key, positive(row[field]) || 1]));
    const factorProduct = Object.values(factors).reduce((product, factor) => product * factor, 1);
    const unitValue = salePrice > 0 && surface > 0 ? salePrice / surface : 0;
    const adjustedUnitValue = unitValue * factorProduct;
    return {
      ...row,
      id: row.id ?? index + 1,
      salePrice,
      surface,
      unitValue,
      factors,
      factorProduct,
      adjustedUnitValue,
      adjustedValue: adjustedUnitValue * surface,
      weightInput: row.weight,
      valid: unitValue > 0
    };
  });
  const valid = table.filter(row => row.valid);
  const { weights, mode, capturedTotal } = resolveWeights(valid);
  valid.forEach((row, index) => {
    row.weight = weights[index];
    row.component = row.adjustedUnitValue * (weights[index] / 100);
  });
  table.filter(row => !row.valid).forEach(row => {
    row.weight = null;
    row.component = 0;
  });
  const weightedUnitValue = valid.reduce((sum, row) => sum + row.component, 0);
  return { rows: table, validCount: valid.length, weightedUnitValue, weightingMode: mode, weightsCapturedTotal: capturedTotal };
}

module.exports = { homologateComparables, homologateConstructionComparables, CONSTRUCTION_FACTORS, LAND_FACTOR_KEYS, RENT_FACTOR_KEYS };
