const { calculateIncomeApproach } = require('./income-approach');
const { homologateComparables, LAND_FACTOR_KEYS, RENT_FACTOR_KEYS } = require('./market-comparables');

const FINAL_APPROACH_LABELS = {
  market: 'Comparativo de mercado',
  physical: 'Físico o directo',
  income: 'Ingresos (capitalización de rentas)'
};

function roundCurrency(value) {
  return Number(value.toFixed(2));
}

function calculateHomologation(input) {
  const {
    comparableSales = [],
    subject = {},
    weights = { zone: 0.3, location: 0.25, terrain: 0.15, age: 0.15, shape: 0.15 }
  } = input;

  const selectedComparables = Array.isArray(comparableSales) ? comparableSales : [];

  const homologatedValues = selectedComparables.map(item => {
    const zoneFactor = item.zoneFactor ?? 1;
    const locationFactor = item.locationFactor ?? 1;
    const terrainFactor = item.terrainFactor ?? 1;
    const ageFactor = item.ageFactor ?? 1;
    const shapeFactor = item.shapeFactor ?? 1;

    const adjustedValue = item.salePrice * zoneFactor * locationFactor * terrainFactor * ageFactor * shapeFactor;
    const comparableSurface = Number(item.surface);
    return {
      ...item,
      adjustedValue,
      unitValuePerM2: comparableSurface > 0 ? adjustedValue / comparableSurface : 0
    };
  });

  const validComparables = homologatedValues.filter(item => Number(item.salePrice) > 0 && Number(item.surface) > 0);
  const averageUnitValue = validComparables.length
    ? validComparables.reduce((sum, item) => sum + item.unitValuePerM2, 0) / validComparables.length
    : 0;
  const terrainSurface = Number(subject.surface) || 0;
  const constructionSurface = Number(subject.constructionSurface) || 0;
  const terrainValue = roundCurrency(terrainSurface * (Number(subject.unitLandValue) || 0));
  const hasMarketInputs = validComparables.length > 0 && constructionSurface > 0;
  const marketValueBeforeAdjustment = hasMarketInputs ? roundCurrency(averageUnitValue * constructionSurface) : 0;
  const marketAdjustment = Number(subject.marketAdjustment) > 0 ? Number(subject.marketAdjustment) : 1;
  const valorMercado = roundCurrency(marketValueBeforeAdjustment * marketAdjustment);
  const constructionValue = roundCurrency(Number(subject.physicalConstructionValue) > 0 ? Number(subject.physicalConstructionValue) : 0);
  const accessoryValue = roundCurrency(Number(subject.physicalAccessoryValue) || 0);
  const valorFisico = roundCurrency(terrainValue + constructionValue + accessoryValue);
  const incomeApproach = calculateIncomeApproach(subject);
  const valorCapitalizacion = incomeApproach.value;
  const approachValues = { market: valorMercado, physical: valorFisico, income: valorCapitalizacion };
  const finalApproach = Object.hasOwn(FINAL_APPROACH_LABELS, subject.finalApproach) ? subject.finalApproach : 'market';
  const finalValue = approachValues[finalApproach];

  return {
    summary: {
      averageUnitValuePerM2: roundCurrency(averageUnitValue),
      finalValue,
      finalApproach,
      finalApproachLabel: FINAL_APPROACH_LABELS[finalApproach],
      valorTerreno: terrainValue,
      valorConstruccion: constructionValue,
      valorFisico,
      valorMercado,
      valorCapitalizacion,
      valorAccesorios: accessoryValue,
      marketValuationStatus: !validComparables.length
        ? 'Sin comparables completos con precio y superficie positiva; no se emitió una conclusión cuantitativa de mercado.'
        : constructionSurface <= 0
          ? `${validComparables.length} comparable(s) válidos, pero falta superficie de construcción del inmueble sujeto; valor de mercado pendiente.`
          : `${validComparables.length} comparable(s) con precio y superficie capturados; confirmar ubicación, fecha, fuente, características y homologación.`,
      physicalValuationStatus: terrainValue > 0 || constructionValue > 0 || accessoryValue > 0
        ? `El enfoque físico incluye solo los componentes capturados. ${terrainSurface > 0 && Number(subject.unitLandValue) <= 0 ? 'Falta valor unitario documentado de terreno. ' : ''}${constructionSurface > 0 && constructionValue <= 0 ? 'Falta costo nuevo de reposición y depreciación documentados para construcción. ' : ''}${accessoryValue <= 0 ? 'No se capturó valor depreciado de accesorios. ' : ''}Verificar fuentes, fecha, depreciación y alcance.`
        : 'Enfoque físico pendiente: capture superficies y valores unitarios documentados de terreno, construcción o accesorios; no se estimó costo de reposición.',
      incomeValuationStatus: incomeApproach.status,
      weights
    },
    incomeApproach,
    landComparables: homologateComparables(input.landComparables, LAND_FACTOR_KEYS),
    rentComparables: homologateComparables(input.rentComparables, RENT_FACTOR_KEYS),
    homologationTable: homologatedValues.map(item => ({
      id: item.id,
      address: item.address,
      salePrice: item.salePrice,
      adjustedValue: roundCurrency(item.adjustedValue),
      unitValuePerM2: roundCurrency(item.unitValuePerM2),
      distanceKm: roundCurrency(item.distanceKm ?? 0)
    })),
    comparables: homologatedValues.map(item => ({
      id: item.id,
      address: item.address,
      salePrice: item.salePrice,
      adjustedValue: roundCurrency(item.adjustedValue),
      unitValuePerM2: roundCurrency(item.unitValuePerM2),
      distanceKm: roundCurrency(item.distanceKm ?? 0)
    }))
  };
}

module.exports = { calculateHomologation };
