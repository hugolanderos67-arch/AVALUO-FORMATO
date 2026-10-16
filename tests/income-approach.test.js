const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateIncomeApproach } = require('../backend/valuation/income-approach');

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
  assert.match(withoutRate.status, /no se estimó tasa/);

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
