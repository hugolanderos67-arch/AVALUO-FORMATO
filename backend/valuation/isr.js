// Tarifa mensual del I.S.R. (art. 96 de la Ley del ISR) que se usa para estimar el impuesto sobre la renta
// de arrendamiento en el enfoque de ingresos. Actualícela cuando el SAT publique una tarifa nueva.
const ISR_MONTHLY_TABLE = [
  { lower: 0.01, upper: 578.52, fixedFee: 0, rate: 1.92 },
  { lower: 578.53, upper: 4910.18, fixedFee: 11.11, rate: 6.40 },
  { lower: 4910.19, upper: 8629.20, fixedFee: 288.33, rate: 10.88 },
  { lower: 8629.21, upper: 10031.07, fixedFee: 692.96, rate: 16.00 },
  { lower: 10031.08, upper: 12009.94, fixedFee: 917.26, rate: 17.92 },
  { lower: 12009.95, upper: 24222.31, fixedFee: 1271.87, rate: 21.36 },
  { lower: 24222.32, upper: 38177.69, fixedFee: 3880.44, rate: 23.52 },
  { lower: 38177.70, upper: 72887.50, fixedFee: 7162.74, rate: 30.00 },
  { lower: 72887.51, upper: 97183.33, fixedFee: 17575.69, rate: 32.00 },
  { lower: 97183.34, upper: 291550.00, fixedFee: 25350.35, rate: 34.00 },
  { lower: 291550.01, upper: null, fixedFee: 91435.02, rate: 35.00 }
];

// I.S.R. mensual = (base − límite inferior) × % sobre el excedente + cuota fija.
function calculateMonthlyIsr(taxableBase) {
  const base = Number(taxableBase) > 0 ? Number(taxableBase) : 0;
  const index = base > 0 ? ISR_MONTHLY_TABLE.findLastIndex(row => base >= row.lower) : -1;
  if (index < 0) return { bracketIndex: -1, lower: 0, upper: 0, fixedFee: 0, rate: 0, excess: 0, marginalTax: 0, tax: 0 };
  const bracket = ISR_MONTHLY_TABLE[index];
  const excess = base - bracket.lower;
  const marginalTax = excess * bracket.rate / 100;
  return { bracketIndex: index, ...bracket, excess, marginalTax, tax: marginalTax + bracket.fixedFee };
}

module.exports = { ISR_MONTHLY_TABLE, calculateMonthlyIsr };
