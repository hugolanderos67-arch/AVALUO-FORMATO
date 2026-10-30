const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateIncomeApproach } = require('../backend/valuation/income-approach');
const { calculateCapRateMatrix } = require('../backend/valuation/cap-rate');

test('desarrolla renta bruta, deducciones, producto líquido y capitalización', () => {
  const result = calculateIncomeApproach({
    capRate: 0.08,
    income: {
      rentableArea: 100,
      unitMonthlyRent: 150,
      vacancyPercent: 10,
      maintenancePercent: 5,
      administrationPercent: 5,
      propertyTax: 6000,
      insurance: 3000
    }
  });

  assert.equal(result.grossMonthlyRent, 15000);
  assert.equal(result.grossAnnualRent, 180000);
  assert.equal(result.deductions.find(item => item.key === 'vacancyPercent').amount, 18000);
  assert.equal(result.totalDeductions, 45000);
  assert.equal(result.deductionsPercent, 25);
  assert.equal(result.netAnnualIncome, 135000);
  assert.equal(result.value, 1687500);
  assert.equal(result.valuePerRentableM2, 16875);
  assert.match(result.status, /Capitalización calculada/);
});

test('usa la renta bruta mensual total cuando no hay renta por m²', () => {
  const result = calculateIncomeApproach({ capRate: 0.1, income: { monthlyRent: 10000 } });

  assert.equal(result.rentSource, 'Renta bruta mensual total capturada');
  assert.equal(result.grossAnnualRent, 120000);
  assert.equal(result.value, 1200000);
  assert.equal(result.valuePerRentableM2, 0);
});

test('no capitaliza sin tasa ni cuando las deducciones agotan la renta', () => {
  const withoutRate = calculateIncomeApproach({ income: { monthlyRent: 10000 } });
  assert.equal(withoutRate.value, 0);
  assert.match(withoutRate.status, /califique los siete conceptos/);

  const exhausted = calculateIncomeApproach({ capRate: 0.08, income: { monthlyRent: 1000, otherExpenses: 12000 } });
  assert.equal(exhausted.netAnnualIncome, 0);
  assert.equal(exhausted.value, 0);
  assert.match(exhausted.status, /igualan o superan/);
});

test('no estima renta cuando no se captura', () => {
  const result = calculateIncomeApproach({ capRate: 0.08 });
  assert.equal(result.value, 0);
  assert.match(result.status, /no se estimó renta/);
});

test('calcula la tasa de capitalización con la tabla de calificación de características', () => {
  // Edad 0 a 10, uso bueno, conservación buena, proyecto bueno, vida más de 35, intermedio, zona buena.
  const matrix = calculateCapRateMatrix({ age: 0, use: 0, conservation: 0, projectQuality: 1, probableLife: 0, location: 2, zone: 1 });
  assert.equal(matrix.complete, true);
  assert.deepEqual(matrix.counts, [4, 2, 1, 0, 0]);
  assert.deepEqual(matrix.factors, [0.8571, 1, 1.1429, 1.2857, 1.4286]);
  assert.equal(matrix.exactRate, 6.5714);
  assert.equal(matrix.rate, 6.57);

  const sheet = calculateCapRateMatrix({ age: 1, use: 0, conservation: 0, projectQuality: 1, probableLife: 0, location: 2, zone: 1 });
  assert.deepEqual(sheet.counts, [3, 3, 1, 0, 0]);
  assert.deepEqual(sheet.partials, [2.5714, 3, 1.1429, 0, 0]);
  assert.equal(sheet.exactRate, 6.7143);
  assert.equal(sheet.rate, 6.71);

  const partial = calculateCapRateMatrix({ age: 0, use: '' });
  assert.equal(partial.complete, false);
  assert.equal(partial.ratedCount, 1);
  assert.equal(partial.rate, 0);
});

test('aplica la tasa de la tabla cuando no se captura la tasa y respeta la capturada', () => {
  const capRateRatings = { age: 1, use: 0, conservation: 0, projectQuality: 1, probableLife: 0, location: 2, zone: 1 };
  const fromMatrix = calculateIncomeApproach({ capRateRatings, income: { monthlyRent: 10000 } });
  assert.equal(fromMatrix.capRateSource, 'matrix');
  assert.equal(fromMatrix.capRate, 0.0671);
  assert.equal(fromMatrix.value, 1788375.56);

  const captured = calculateIncomeApproach({ capRate: 0.08, capRateRatings, income: { monthlyRent: 10000 } });
  assert.equal(captured.capRateSource, 'captured');
  assert.equal(captured.value, 1500000);

  const incomplete = calculateIncomeApproach({ capRateRatings: { age: 1 }, income: { monthlyRent: 10000 } });
  assert.equal(incomplete.capRateSource, 'none');
  assert.equal(incomplete.value, 0);
  assert.match(incomplete.status, /califique los siete conceptos/);
});

test('calcula el I.S.R. con la tarifa mensual', () => {
  const { calculateMonthlyIsr } = require('../backend/valuation/isr');
  const isr = calculateMonthlyIsr(3153.33);
  assert.equal(isr.lower, 578.53);
  assert.equal(isr.fixedFee, 11.11);
  assert.equal(Number(isr.marginalTax.toFixed(2)), 164.79);
  assert.equal(Number(isr.tax.toFixed(2)), 175.9);
  assert.equal(calculateMonthlyIsr(0).tax, 0);
  assert.equal(calculateMonthlyIsr(400000).rate, 35);
});

test('desarrolla las deducciones fiscales, la base gravable y el I.S.R. como la hoja de cálculo', () => {
  const result = calculateIncomeApproach({
    capRate: 0.06714,
    physicalConstructionValue: 1770696.31,
    physicalValue: 2535840,
    income: { monthlyRent: 13767.70, deductionMethod: 'fiscal' }
  });
  const fiscal = result.fiscal;
  assert.equal(result.deductionMethod, 'fiscal');
  assert.equal(fiscal.vacancyPercent, 4.17);
  assert.equal(fiscal.vacancy, 573.65);
  assert.equal(fiscal.ibme, 13194.05);
  assert.equal(fiscal.depreciation, 7377.9);
  assert.equal(fiscal.propertyTax, 395.59);
  assert.equal(fiscal.administration, 395.82);
  assert.equal(fiscal.maintenance, 395.82);
  assert.equal(fiscal.insurance, 1475.58);
  assert.equal(fiscal.authorizedDeductions, 10040.72);
  assert.equal(fiscal.optionalDeduction, 4617.92);
  assert.equal(fiscal.deductionUsed, 'authorized');
  assert.equal(fiscal.taxableBase, 3153.33);
  assert.equal(fiscal.isr.tax, 175.9);
  assert.equal(fiscal.totalMonthlyDeductions, 3412.37);
  assert.equal(fiscal.monthlyDeductionsPercent, 24.79);
  assert.equal(fiscal.netMonthlyIncome, 10355.33);
  // La hoja da 124,263.99 y 1,850,818.98; la diferencia de centavos viene del valor físico supuesto en la prueba.
  assert.ok(Math.abs(result.netAnnualIncome - 124263.99) < 0.05);
  assert.ok(Math.abs(result.value - 1850818.98) < 1);
});

test('usa la deducción opcional cuando es mayor que las autorizadas', () => {
  const result = calculateIncomeApproach({ capRate: 0.08, income: { monthlyRent: 20000, deductionMethod: 'fiscal' } });
  assert.equal(result.fiscal.deductionUsed, 'optional');
  assert.ok(Math.abs(result.fiscal.taxableBase - result.fiscal.ibme * 0.65) < 0.01);
  assert.match(result.status, /sin valor de construcciones/);
});
