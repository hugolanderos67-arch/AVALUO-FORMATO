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

module.exports = { homologateComparables, LAND_FACTOR_KEYS, RENT_FACTOR_KEYS };
