const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateHomologation } = require('../backend/valuation/homologation');

test('calcula homologación con al menos 5 comparables', () => {
  const payload = {
    subject: { surface: 120 },
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

test('selecciona comparables automáticamente por georreferenciación', () => {
  const payload = {
    subject: {
      surface: 140,
      latitude: 19.4326,
      longitude: -99.1332
    }
  };

  const result = calculateHomologation(payload);
  assert.ok(result.comparables.length >= 5);
  assert.ok(result.homologationTable.every(item => typeof item.distanceKm === 'number'));
});

test('genera resumen de dictamen con valores físico, mercado y capitalización', () => {
  const payload = {
    subject: {
      surface: 140,
      constructionSurface: 90,
      capRate: 0.08,
      annualIncome: 120000,
      latitude: 19.4326,
      longitude: -99.1332
    }
  };

  const result = calculateHomologation(payload);
  assert.ok(result.summary.valorFisico > 0);
  assert.ok(result.summary.valorMercado > 0);
  assert.ok(result.summary.valorCapitalizacion > 0);
});
