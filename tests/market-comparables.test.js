const test = require('node:test');
const assert = require('node:assert/strict');
const { homologateComparables, LAND_FACTOR_KEYS, RENT_FACTOR_KEYS } = require('../backend/valuation/market-comparables');
const { calculateHomologation } = require('../backend/valuation/homologation');

test('homologa valor unitario con el producto de factores capturados', () => {
  const result = homologateComparables([
    { id: 1, address: 'Lote A', price: 1000000, surface: 200, factors: { negotiation: 0.95, zone: 1.1 } },
    { id: 2, address: 'Lote B', price: 900000, surface: 150, factors: {} }
  ], LAND_FACTOR_KEYS);

  assert.equal(result.validCount, 2);
  assert.equal(result.rows[0].unitValue, 5000);
  assert.equal(result.rows[0].factorProduct, 1.045);
  assert.equal(result.rows[0].homologatedUnitValue, 5225);
  assert.equal(result.rows[0].factors.topography, 1);
  assert.equal(result.rows[1].homologatedUnitValue, 6000);
  assert.equal(result.averageUnitValue, 5612.5);
});

test('omite comparables vacíos y no promedia los incompletos', () => {
  const result = homologateComparables([
    { id: 1, price: 0, surface: 0 },
    { id: 2, price: 500000, surface: 0 },
    { id: 3, price: 600000, surface: 100, factors: { zone: 0 } }
  ], LAND_FACTOR_KEYS);

  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].valid, false);
  assert.equal(result.validCount, 1);
  assert.equal(result.averageUnitValue, 6000);
});

test('integra comparables de terreno y renta en el resultado', () => {
  const result = calculateHomologation({
    subject: {},
    landComparables: [{ id: 1, price: 1000000, surface: 200 }],
    rentComparables: [{ id: 1, price: 12000, surface: 80, factors: { negotiation: 0.9 } }]
  });

  assert.equal(result.landComparables.averageUnitValue, 5000);
  assert.equal(result.rentComparables.averageUnitValue, 135);
  assert.equal(result.homologationTable.length, 0);
});

test('terreno y renta: ponderación igual sin captura, capturada o ajustada a 100 %', () => {
  const rows = weights => [
    { id: 1, address: 'Lote A', price: 1000000, surface: 200, weight: weights[0] },
    { id: 2, address: 'Lote B', price: 1200000, surface: 200, weight: weights[1] },
    { id: 3, address: 'Incompleto', price: 500000, surface: 0, weight: weights[2] }
  ];
  const equal = homologateComparables(rows([null, null, null]), LAND_FACTOR_KEYS);
  assert.equal(equal.weightingMode, 'equal');
  assert.equal(equal.averageUnitValue, 5500);
  assert.deepEqual(equal.rows.map(row => row.weight), [50, 50, null]);

  const captured = homologateComparables(rows([70, 30, 100]), LAND_FACTOR_KEYS);
  assert.equal(captured.weightingMode, 'captured', 'el incompleto no cuenta para la suma');
  assert.equal(captured.rows[0].component, 3500);
  assert.equal(captured.rows[1].component, 1800);
  assert.equal(captured.averageUnitValue, 5300);

  const normalized = homologateComparables(rows([1, 3, null]), RENT_FACTOR_KEYS);
  assert.equal(normalized.weightingMode, 'normalized');
  assert.equal(normalized.weightsCapturedTotal, 4);
  assert.deepEqual(normalized.rows.slice(0, 2).map(row => row.weight), [25, 75]);
  assert.equal(normalized.averageUnitValue, 5750);
});
