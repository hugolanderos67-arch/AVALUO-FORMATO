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
  assert.match(result.summary.incomeValuationStatus, /no se estimó renta/);
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

test('concluye con el enfoque seleccionado y usa mercado por omisión', () => {
  const subject = {
    surface: 100,
    constructionSurface: 90,
    unitLandValue: 5000,
    physicalConstructionValue: 800000,
    capRate: 0.08,
    income: { monthlyRent: 10000 }
  };
  const comparableSales = [{ id: 1, address: 'Comparable', salePrice: 2000000, surface: 100 }];

  const byDefault = calculateHomologation({ subject, comparableSales });
  assert.equal(byDefault.summary.finalApproach, 'market');
  assert.equal(byDefault.summary.finalValue, 1800000);

  const physical = calculateHomologation({ subject: { ...subject, finalApproach: 'physical' }, comparableSales });
  assert.equal(physical.summary.finalValue, 1300000);
  assert.equal(physical.summary.finalApproachLabel, 'Físico o directo');

  const income = calculateHomologation({ subject: { ...subject, finalApproach: 'income' }, comparableSales });
  assert.equal(income.summary.finalValue, 1500000);

  const unknown = calculateHomologation({ subject: { ...subject, finalApproach: 'otro' }, comparableSales });
  assert.equal(unknown.summary.finalApproach, 'market');
});

test('cuadro de homologación: factores de construcción, factor resultante y ponderación capturada', () => {
  const result = calculateHomologation({
    subject: { constructionSurface: 150 },
    comparableSales: [
      { id: 1, address: 'A', salePrice: 2000000, surface: 100, zoneFactor: 1.05, surfaceFactor: 0.98, conservationFactor: 1.02, negotiationFactor: 0.95, weight: 60 },
      { id: 2, address: 'B', salePrice: 1800000, surface: 90, projectFactor: 1.1, otherFactor: 0.9, weight: 40 }
    ]
  });
  const [a, b] = result.homologationTable;
  assert.equal(a.unitValue, 20000);
  assert.equal(a.factorProduct, 0.9971, 'FRe = 1.05 × 0.98 × 1.02 × 0.95');
  assert.equal(a.unitValuePerM2, 19942.02);
  assert.equal(a.weight, 60);
  assert.equal(a.component, 11965.21);
  assert.equal(b.factorProduct, 0.99);
  assert.equal(b.component, 7920);
  assert.equal(result.summary.averageUnitValuePerM2, 19885.21, 'valor unitario ajustado y ponderado');
  assert.equal(result.summary.valorMercado, 2982781.8);
  assert.equal(result.summary.weightingMode, 'captured');
  assert.deepEqual(result.constructionFactors.map(factor => factor.code), ['FZo', 'FUb', 'FSu', 'FEd', 'FCo', 'FPr', 'FCn', 'FAc', 'FOt', 'FNeg']);
});

test('ponderación: igual sin captura, ajustada a 100 % si no suma y 0 para las vacías', () => {
  const comparables = weights => [
    { id: 1, address: 'A', salePrice: 1000000, surface: 100, weight: weights[0] },
    { id: 2, address: 'B', salePrice: 1200000, surface: 100, weight: weights[1] },
    { id: 3, address: 'Sin precio', salePrice: 0, surface: 100, weight: weights[2] }
  ];
  const equal = calculateHomologation({ subject: { constructionSurface: 100 }, comparableSales: comparables([null, null, null]) });
  assert.equal(equal.summary.weightingMode, 'equal');
  assert.equal(equal.summary.averageUnitValuePerM2, 11000);
  assert.equal(equal.homologationTable[2].weight, null, 'el comparable sin precio no pondera');

  const normalized = calculateHomologation({ subject: { constructionSurface: 100 }, comparableSales: comparables([30, 30, 40]) });
  assert.equal(normalized.summary.weightingMode, 'normalized');
  assert.equal(normalized.summary.weightsCapturedTotal, 60);
  assert.deepEqual(normalized.homologationTable.slice(0, 2).map(row => row.weight), [50, 50]);
  assert.match(normalized.summary.marketValuationStatus, /sumaban 60 %/);

  const partial = calculateHomologation({ subject: { constructionSurface: 100 }, comparableSales: comparables([100, '', null]) });
  assert.deepEqual(partial.homologationTable.slice(0, 2).map(row => row.weight), [100, 0]);
  assert.equal(partial.summary.averageUnitValuePerM2, 10000);
});

test('los factores de construcción y acabados de avalúos anteriores se siguen aplicando', () => {
  const result = calculateHomologation({
    subject: { constructionSurface: 100 },
    comparableSales: [{ id: 1, address: 'A', salePrice: 1000000, surface: 100, terrainFactor: 1.1, shapeFactor: 0.9 }]
  });
  assert.equal(result.homologationTable[0].factors.construction, 1.1);
  assert.equal(result.homologationTable[0].factors.finish, 0.9);
  assert.equal(result.summary.averageUnitValuePerM2, 9900);
});
