const { calculateCapRateMatrix } = require('./cap-rate');
const { ISR_MONTHLY_TABLE, calculateMonthlyIsr } = require('./isr');

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

function numberOr(value, fallback) {
  return value === '' || value === null || value === undefined || !Number.isFinite(Number(value)) ? fallback : Number(value);
}

// Análisis fiscal mensual: renta bruta → vacíos → ingresos brutos mensuales efectivos (IBME) → deducciones
// fiscales autorizadas o deducción opcional → base gravable → I.S.R. Los gastos reales son vacíos, predial,
// administración, mantenimiento, seguro e I.S.R.; la depreciación fiscal solo reduce la base gravable.
function calculateFiscalDeductions(income, grossMonthlyRent, buildingsValue, physicalValue) {
  const vacancyMonths = positive(numberOr(income.vacancyMonths, 1));
  const vacancyPeriod = positive(numberOr(income.vacancyPeriod, 24));
  const propertyTaxPerThousand = positive(numberOr(income.propertyTaxPerThousand, 2.34));
  const propertyTaxBasePercent = positive(numberOr(income.propertyTaxBasePercent, 80));
  const administrationPercent = positive(numberOr(income.fiscalAdministrationPercent, 3));
  const maintenancePercent = positive(numberOr(income.fiscalMaintenancePercent, 3));
  const insurancePercent = positive(numberOr(income.insurancePercent, 1));
  const depreciationPercent = positive(numberOr(income.depreciationPercent, 5));
  const optionalDeductionPercent = positive(numberOr(income.optionalDeductionPercent, 35));

  const vacancyPercent = vacancyPeriod > 0 ? vacancyMonths / vacancyPeriod * 100 : 0;
  const vacancy = grossMonthlyRent * vacancyPercent / 100;
  const ibme = grossMonthlyRent - vacancy;
  const depreciation = buildingsValue * depreciationPercent / 100 / 12;
  const propertyTax = physicalValue * propertyTaxBasePercent / 100 * propertyTaxPerThousand / 1000 / 12;
  const administration = ibme * administrationPercent / 100;
  const maintenance = ibme * maintenancePercent / 100;
  const insurance = buildingsValue * insurancePercent / 100 / 12;
  const authorizedDeductions = depreciation + propertyTax + administration + maintenance + insurance;
  const optionalDeduction = ibme * optionalDeductionPercent / 100;
  const deductionUsed = authorizedDeductions >= optionalDeduction ? 'authorized' : 'optional';
  const taxableBase = Math.max(0, ibme - Math.max(authorizedDeductions, optionalDeduction));
  const isr = calculateMonthlyIsr(taxableBase);

  const monthly = [
    { key: 'vacancy', label: 'Vacíos', amount: vacancy },
    { key: 'propertyTax', label: 'Impuesto predial', amount: propertyTax },
    { key: 'administration', label: 'Administración', amount: administration },
    { key: 'maintenance', label: 'Mantenimiento', amount: maintenance },
    { key: 'insurance', label: 'Seguros', amount: insurance },
    { key: 'incomeTax', label: 'I.S.R.', amount: isr.tax }
  ];
  const totalMonthly = monthly.reduce((sum, item) => sum + item.amount, 0);
  const share = amount => (grossMonthlyRent > 0 ? roundCurrency(amount / grossMonthlyRent * 100) : 0);
  const r = roundCurrency;

  return {
    totalMonthly,
    deductions: monthly.map(item => ({ key: item.key, label: item.label, percent: share(item.amount), monthlyAmount: r(item.amount), amount: r(item.amount * 12) })),
    fiscal: {
      vacancyMonths, vacancyPeriod, vacancyPercent: r(vacancyPercent), vacancy: r(vacancy), ibme: r(ibme),
      buildingsValue: r(buildingsValue), physicalValue: r(physicalValue),
      depreciationPercent, depreciation: r(depreciation),
      propertyTaxPerThousand, propertyTaxBasePercent, propertyTax: r(propertyTax),
      administrationPercent, administration: r(administration),
      maintenancePercent, maintenance: r(maintenance),
      insurancePercent, insurance: r(insurance),
      authorizedDeductions: r(authorizedDeductions),
      optionalDeductionPercent, optionalDeduction: r(optionalDeduction),
      deductionUsed, taxableBase: r(taxableBase),
      isr: { ...isr, excess: r(isr.excess), marginalTax: r(isr.marginalTax), tax: r(isr.tax) },
      isrTable: ISR_MONTHLY_TABLE,
      totalMonthlyDeductions: r(totalMonthly),
      monthlyDeductionsPercent: share(totalMonthly),
      netMonthlyIncome: r(grossMonthlyRent - totalMonthly)
    }
  };
}

// Desarrollo del enfoque de ingresos: renta bruta → deducciones → producto líquido anual → capitalización.
function calculateIncomeApproach(subject = {}) {
  const income = subject.income || {};
  const rentableArea = positive(income.rentableArea);
  const unitMonthlyRent = positive(income.unitMonthlyRent);
  const capturedMonthlyRent = positive(income.monthlyRent);
  // Tasa: la capturada o, si se dejó vacía, la calculada con la tabla de calificación de características.
  const capRateMatrix = calculateCapRateMatrix(subject.capRateRatings);
  const capturedCapRate = positive(subject.capRate);
  const capRate = capturedCapRate > 0 ? capturedCapRate : Number((capRateMatrix.rate / 100).toFixed(4));
  const capRateSource = capturedCapRate > 0 ? 'captured' : capRateMatrix.complete ? 'matrix' : 'none';
  const capRateFields = { capRate, capRateSource, capRateMatrix };

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
      ...capRateFields,
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
  const fiscalMethod = income.deductionMethod === 'fiscal';
  const buildingsValue = positive(subject.physicalConstructionValue) + positive(subject.physicalAccessoryValue);
  const fiscalResult = fiscalMethod ? calculateFiscalDeductions(income, grossMonthlyRent, buildingsValue, positive(subject.physicalValue)) : null;

  const deductions = fiscalResult ? fiscalResult.deductions : [
    ...PERCENT_DEDUCTIONS.map(({ key, label }) => {
      const percent = positive(income[key]);
      return { key, label, percent, amount: roundCurrency(grossAnnualRent * percent / 100) };
    }),
    ...AMOUNT_DEDUCTIONS.map(({ key, label }) => {
      const amount = roundCurrency(positive(income[key]));
      return { key, label, percent: grossAnnualRent > 0 ? roundCurrency(amount / grossAnnualRent * 100) : 0, amount };
    })
  ];
  const totalDeductions = roundCurrency(fiscalResult ? fiscalResult.totalMonthly * 12 : deductions.reduce((sum, item) => sum + item.amount, 0));
  const netAnnualIncome = roundCurrency(fiscalResult ? (grossMonthlyRent - fiscalResult.totalMonthly) * 12 : grossAnnualRent - totalDeductions);
  const value = netAnnualIncome > 0 && capRate > 0 ? roundCurrency(netAnnualIncome / capRate) : 0;

  let status;
  if (grossAnnualRent <= 0) {
    status = 'Capitalización pendiente: capture superficie rentable y renta unitaria mensual, o la renta bruta mensual total, con soporte documental; no se estimó renta.';
  } else if (netAnnualIncome <= 0) {
    const overLimit = deductions.filter(item => PERCENT_DEDUCTIONS.some(({ key }) => key === item.key) && item.percent > 100);
    status = `Capitalización no aplicable: las deducciones (${totalDeductions.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}) igualan o superan la renta bruta anual (${grossAnnualRent.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}).${overLimit.length ? ` ${overLimit.map(item => `${item.label}: ${item.percent} %`).join(', ')} supera el 100 % de la renta.` : ''} Revise los importes.`;
  } else if (capRate <= 0) {
    status = 'Capitalización pendiente: califique los siete conceptos de la tabla de la tasa de capitalización o capture la tasa aplicable con su justificación.';
  } else {
    status = fiscalResult && !(buildingsValue > 0)
      ? 'Capitalización calculada, pero sin valor de construcciones del enfoque físico: la depreciación fiscal y el seguro quedaron en cero. Capture las construcciones en el enfoque físico.'
      : capRateSource === 'matrix'
      ? 'Capitalización calculada con rentas y deducciones capturadas y tasa obtenida por calificación de características; verificar contratos o comparables de renta y gastos.'
      : 'Capitalización calculada con rentas, deducciones y tasa capturadas; verificar contratos o comparables de renta, gastos y justificación de la tasa.';
  }

  return {
    deductionMethod: fiscalResult ? 'fiscal' : 'manual',
    fiscal: fiscalResult ? fiscalResult.fiscal : null,
    rentSource: usesUnitRent ? 'Superficie rentable × renta unitaria mensual' : 'Renta bruta mensual total capturada',
    rentableArea,
    unitMonthlyRent,
    grossMonthlyRent,
    grossAnnualRent,
    deductions,
    totalDeductions,
    deductionsPercent: grossAnnualRent > 0 ? roundCurrency(totalDeductions / grossAnnualRent * 100) : 0,
    netAnnualIncome,
    ...capRateFields,
    value,
    valuePerRentableM2: value > 0 && rentableArea > 0 ? roundCurrency(value / rentableArea) : 0,
    status
  };
}

module.exports = { calculateIncomeApproach };
