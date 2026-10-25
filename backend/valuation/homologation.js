const { calculateIncomeApproach } = require('./income-approach');
const { homologateComparables, homologateConstructionComparables, CONSTRUCTION_FACTORS, LAND_FACTOR_KEYS, RENT_FACTOR_KEYS } = require('./market-comparables');

const FINAL_APPROACH_LABELS = {
  market: 'Comparativo de mercado',
  physical: 'Físico o directo',
  income: 'Ingresos (capitalización de rentas)'
};

function roundCurrency(value) {
  return Number(value.toFixed(2));
}

function calculateHomologation(input) {
  const { comparableSales = [], subject = {} } = input;

  // Homologación de comparables de construcción: factores, factor resultante (FRe) y ponderación.
  const construction = homologateConstructionComparables(comparableSales);
  const homologatedValues = construction.rows;
  const validComparables = homologatedValues.filter(item => item.valid);
  const averageUnitValue = construction.weightedUnitValue;
  const weightingNote = {
    equal: ' Ponderación igual para cada comparable.',
    captured: ' Ponderación capturada (suma 100 %).',
    normalized: ` Las ponderaciones capturadas sumaban ${construction.weightsCapturedTotal} %; se ajustaron en proporción a 100 %.`
  }[construction.weightingMode] || '';
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
          : `${validComparables.length} comparable(s) con precio y superficie capturados; confirmar ubicación, fecha, fuente, características y homologación.${weightingNote}`,
      physicalValuationStatus: terrainValue > 0 || constructionValue > 0 || accessoryValue > 0
        ? `El enfoque físico incluye solo los componentes capturados. ${terrainSurface > 0 && Number(subject.unitLandValue) <= 0 ? 'Falta valor unitario documentado de terreno. ' : ''}${constructionSurface > 0 && constructionValue <= 0 ? 'Falta costo nuevo de reposición y depreciación documentados para construcción. ' : ''}${accessoryValue <= 0 ? 'No se capturó valor depreciado de accesorios. ' : ''}Verificar fuentes, fecha, depreciación y alcance.`
        : 'Enfoque físico pendiente: capture superficies y valores unitarios documentados de terreno, construcción o accesorios; no se estimó costo de reposición.',
      incomeValuationStatus: incomeApproach.status,
      weightingMode: construction.weightingMode,
      weightsCapturedTotal: construction.weightsCapturedTotal
    },
    constructionFactors: CONSTRUCTION_FACTORS.map(({ key, code, label }) => ({ key, code, label })),
    incomeApproach,
    landComparables: homologateComparables(input.landComparables, LAND_FACTOR_KEYS),
    rentComparables: homologateComparables(input.rentComparables, RENT_FACTOR_KEYS),
    // Cuadro "Análisis por homologación y ajustes": unitValue = precio / superficie; factorProduct = FRe;
    // unitValuePerM2 = valor unitario ajustado (unitValue × FRe); weight en %; component = ajustado × ponderación.
    homologationTable: homologatedValues.map(item => ({
      id: item.id,
      address: item.address,
      salePrice: item.salePrice,
      surface: item.surface,
      unitValue: roundCurrency(item.unitValue),
      factors: item.factors,
      factorProduct: Number(item.factorProduct.toFixed(4)),
      adjustedValue: roundCurrency(item.adjustedValue),
      unitValuePerM2: roundCurrency(item.adjustedUnitValue),
      weight: item.weight === null ? null : Number(item.weight.toFixed(2)),
      component: roundCurrency(item.component),
      valid: item.valid,
      distanceKm: roundCurrency(item.distanceKm ?? 0)
    })),
    comparables: homologatedValues.map(item => ({
      id: item.id,
      address: item.address,
      salePrice: item.salePrice,
      adjustedValue: roundCurrency(item.adjustedValue),
      unitValuePerM2: roundCurrency(item.adjustedUnitValue),
      distanceKm: roundCurrency(item.distanceKm ?? 0)
    }))
  };
}

module.exports = { calculateHomologation };
