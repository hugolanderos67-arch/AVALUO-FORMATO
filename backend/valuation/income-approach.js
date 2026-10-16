function roundCurrency(value) {
  return Number(value.toFixed(2));
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

const PERCENT_DEDUCTIONS = [
  { key: 'vacancyPercent', label: 'Vacíos (desocupación)' },
  { key: 'maintenancePercent', label: 'Conservación y mantenimiento' },
  { key: 'administrationPercent', label: 'Administración' }
];

const AMOUNT_DEDUCTIONS = [
  { key: 'propertyTax', label: 'Impuesto predial' },
  { key: 'waterService', label: 'Servicio de agua' },
  { key: 'electricity', label: 'Energía eléctrica (áreas comunes)' },
  { key: 'insurance', label: 'Seguros' },
  { key: 'otherExpenses', label: 'Otros gastos de operación' },
  { key: 'incomeTax', label: 'Impuesto sobre la renta (I.S.R.)' }
];

// Desarrollo del enfoque de ingresos: renta bruta → deducciones → producto líquido anual → capitalización.
function calculateIncomeApproach(subject = {}) {
  const income = subject.income || {};
  const rentableArea = positive(income.rentableArea);
  const unitMonthlyRent = positive(income.unitMonthlyRent);
  const capturedMonthlyRent = positive(income.monthlyRent);
  const capRate = positive(subject.capRate);

  // Compatibilidad: sin desglose de rentas se toma el ingreso anual neto capturado como producto líquido.
  if (!rentableArea && !unitMonthlyRent && !capturedMonthlyRent && positive(subject.annualIncome)) {
    const netAnnualIncome = roundCurrency(positive(subject.annualIncome));
    const value = capRate > 0 ? roundCurrency(netAnnualIncome / capRate) : 0;
    return {
      rentSource: 'Ingreso anual neto capturado directamente',
      rentableArea: 0,
      unitMonthlyRent: 0,
      grossMonthlyRent: 0,
      grossAnnualRent: 0,
      deductions: [],
      totalDeductions: 0,
      deductionsPercent: 0,
      netAnnualIncome,
      capRate,
      value,
      valuePerRentableM2: 0,
      status: value > 0
        ? 'Capitalización calculada con ingreso anual neto y tasa capturados; verificar soporte y tasa aplicable.'
        : 'Capitalización pendiente: capture ingreso anual neto y tasa documentados; no se estimó renta ni tasa.'
    };
  }

  const usesUnitRent = rentableArea > 0 && unitMonthlyRent > 0;
  const grossMonthlyRent = roundCurrency(usesUnitRent ? rentableArea * unitMonthlyRent : capturedMonthlyRent);
  const grossAnnualRent = roundCurrency(grossMonthlyRent * 12);

  const deductions = [
    ...PERCENT_DEDUCTIONS.map(({ key, label }) => {
      const percent = positive(income[key]);
      return { key, label, percent, amount: roundCurrency(grossAnnualRent * percent / 100) };
    }),
    ...AMOUNT_DEDUCTIONS.map(({ key, label }) => {
      const amount = roundCurrency(positive(income[key]));
      return { key, label, percent: grossAnnualRent > 0 ? roundCurrency(amount / grossAnnualRent * 100) : 0, amount };
    })
  ];
  const totalDeductions = roundCurrency(deductions.reduce((sum, item) => sum + item.amount, 0));
  const netAnnualIncome = roundCurrency(grossAnnualRent - totalDeductions);
  const value = netAnnualIncome > 0 && capRate > 0 ? roundCurrency(netAnnualIncome / capRate) : 0;

  let status;
  if (grossAnnualRent <= 0) {
    status = 'Capitalización pendiente: capture superficie rentable y renta unitaria mensual, o la renta bruta mensual total, con soporte documental; no se estimó renta.';
  } else if (netAnnualIncome <= 0) {
    status = 'Capitalización no aplicable: las deducciones capturadas igualan o superan la renta bruta anual; revise los importes.';
  } else if (capRate <= 0) {
    status = 'Capitalización pendiente: capture la tasa de capitalización aplicable y su justificación; no se estimó tasa.';
  } else {
    status = 'Capitalización calculada con rentas, deducciones y tasa capturadas; verificar contratos o comparables de renta, gastos y justificación de la tasa.';
  }

  return {
    rentSource: usesUnitRent ? 'Superficie rentable × renta unitaria mensual' : 'Renta bruta mensual total capturada',
    rentableArea,
    unitMonthlyRent,
    grossMonthlyRent,
    grossAnnualRent,
    deductions,
    totalDeductions,
    deductionsPercent: grossAnnualRent > 0 ? roundCurrency(totalDeductions / grossAnnualRent * 100) : 0,
    netAnnualIncome,
    capRate,
    value,
    valuePerRentableM2: value > 0 && rentableArea > 0 ? roundCurrency(value / rentableArea) : 0,
    status
  };
}

module.exports = { calculateIncomeApproach };
