const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateHomologation } = require('../backend/valuation/homologation');

test('calcula homologación con al menos 5 comparables', () => {
  const payload = {
    subject: { surface: 120, constructionSurface: 90 },
    comparableSales: [
      { id: 1, address: 'A', salePrice: 1000000, zoneFactor: 1.05, locationFactor: 1.02, terrainFactor: 1.01, ageFactor: 0.98, shapeFactor: 1.00, surface: 100 },
      { id: 2, address: 'B', salePrice: 1100000, zoneFactor: 1.03, locationFactor: 1.01, terrainFactor: 1.02, ageFactor: 0.99, shapeFactor: 1.00, surface: 110 },
      { id: 3, address: 'C', salePrice: 1050000, zoneFactor: 1.04, locationFactor: 1.00, terrainFactor: 1.00, ageFactor: 0.97, shapeFactor: 0.99, surface: 105 },
      { id: 4, address: 'D', salePrice: 1080000, zoneFactor: 1.02, locationFactor: 1.03, terrainFactor: 1.01, ageFactor: 0.98, shapeFactor: 1.00, surface: 108 },
      { id: 5, address: 'E', salePrice: 950000, zoneFactor: 1.06, locationFactor: 1.02, terrainFactor: 1.00, ageFactor: 0.96, shapeFactor: 1.01, surface: 95 }
    ]
  };

  const result = calculateHomologation(payload);
  assert.equal(result.comparables.length, 5);
  assert.ok(result.summary.finalValue > 0);
});

test('no fabrica comparables cuando no se capturan ventas verificables', () => {
  const payload = {
    subject: {
      surface: 140,
      latitude: 19.4326,
      longitude: -99.1332
    }
  };

  const result = calculateHomologation(payload);
  assert.equal(result.comparables.length, 0);
  assert.equal(result.summary.averageUnitValuePerM2, 0);
  assert.equal(result.summary.valorMercado, 0);
  assert.match(result.summary.marketValuationStatus, /Sin comparables completos/);
});

test('genera mercado e ingresos con datos capturados y deja físico pendiente sin costos', () => {
  const payload = {
    subject: {
      surface: 140,
      constructionSurface: 90,
      capRate: 0.08,
      annualIncome: 120000,
      latitude: 19.4326,
      longitude: -99.1332
    },
    comparableSales: [{ id: 1, address: 'Comparable verificado', salePrice: 1000000, surface: 100 }]
  };

  const result = calculateHomologation(payload);
  assert.equal(result.summary.valorFisico, 0);
  assert.ok(result.summary.valorMercado > 0);
  assert.ok(result.summary.valorCapitalizacion > 0);
  assert.match(result.summary.physicalValuationStatus, /no se estimó costo de reposición/);
});

test('no calcula valor de mercado con comparables incompletos', () => {
  const result = calculateHomologation({
    subject: { surface: 120, constructionSurface: 90 },
    comparableSales: [{ id: 1, address: 'Pendiente', salePrice: 0, surface: 0 }]
  });

  assert.equal(result.summary.averageUnitValuePerM2, 0);
  assert.equal(result.summary.valorMercado, 0);
  assert.match(result.summary.marketValuationStatus, /Sin comparables completos/);
});

test('no calcula valor unitario para comparables sin superficie positiva', () => {
  const result = calculateHomologation({
    subject: { surface: 100, constructionSurface: 80 },
    comparableSales: [{ id: 1, address: 'Sin superficie', salePrice: 1000000, surface: 0 }]
  });

  assert.equal(result.homologationTable[0].unitValuePerM2, 0);
  assert.equal(result.summary.averageUnitValuePerM2, 0);
  assert.equal(result.summary.valorMercado, 0);
});

test('no inventa costo físico, renta ni tasa cuando faltan datos documentados', () => {
  const result = calculateHomologation({
    subject: { surface: 100, constructionSurface: 80 },
    comparableSales: [{ id: 1, address: 'Comparable', salePrice: 1000000, surface: 100 }]
  });

  assert.ok(result.summary.valorMercado > 0);
  assert.equal(result.summary.valorFisico, 0);
  assert.equal(result.summary.valorCapitalizacion, 0);
  assert.match(result.summary.physicalValuationStatus, /no se estimó costo de reposición/);
  assert.match(result.summary.incomeValuationStatus, /no se estimó renta ni tasa/);
});

test('deja pendiente mercado si falta superficie de construcción del sujeto', () => {
  const result = calculateHomologation({
    subject: { surface: 100 },
    comparableSales: [{ id: 1, address: 'Comparable', salePrice: 1000000, surface: 100 }]
  });

  assert.equal(result.summary.valorMercado, 0);
  assert.match(result.summary.marketValuationStatus, /falta superficie de construcción/);
});

test('usa costos capturados para el enfoque físico', () => {
  const result = calculateHomologation({
    subject: {
      surface: 100,
      constructionSurface: 90,
      unitLandValue: 5000,
      physicalConstructionValue: 800000,
      physicalAccessoryValue: 100000,
      annualIncome: 120000,
      capRate: 0.08
    },
    comparableSales: [{ id: 1, address: 'Comparable', salePrice: 2000000, surface: 100 }]
  });

  assert.equal(result.summary.valorFisico, 1400000);
  assert.equal(result.summary.valorMercado, 1800000);
  assert.match(result.summary.physicalValuationStatus, /componentes capturados/);
});
