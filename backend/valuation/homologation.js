function roundCurrency(value) {
  return Number(value.toFixed(2));
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = value => (value * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getDefaultComparablePool(subject) {
  const baseLat = subject.latitude ?? 19.4326;
  const baseLon = subject.longitude ?? -99.1332;

  return [
    { id: 1, address: 'Insurgentes 100, Roma Norte', salePrice: 1000000, zoneFactor: 1.05, locationFactor: 1.02, terrainFactor: 1.01, ageFactor: 0.98, shapeFactor: 1.00, surface: 100, latitude: 19.4235, longitude: -99.1613 },
    { id: 2, address: 'Av. Chapultepec 250, Condesa', salePrice: 1100000, zoneFactor: 1.03, locationFactor: 1.01, terrainFactor: 1.02, ageFactor: 0.99, shapeFactor: 1.00, surface: 110, latitude: 19.4122, longitude: -99.1738 },
    { id: 3, address: 'Paseo de la Reforma 300, Juárez', salePrice: 1050000, zoneFactor: 1.04, locationFactor: 1.00, terrainFactor: 1.00, ageFactor: 0.97, shapeFactor: 0.99, surface: 105, latitude: 19.4266, longitude: -99.1558 },
    { id: 4, address: 'Coyoacán 400, Del Valle', salePrice: 1080000, zoneFactor: 1.02, locationFactor: 1.03, terrainFactor: 1.01, ageFactor: 0.98, shapeFactor: 1.00, surface: 108, latitude: 19.3936, longitude: -99.1753 },
    { id: 5, address: 'Eje 1 Norte 150, Anzures', salePrice: 950000, zoneFactor: 1.06, locationFactor: 1.02, terrainFactor: 1.00, ageFactor: 0.96, shapeFactor: 1.01, surface: 95, latitude: 19.4457, longitude: -99.1604 },
    { id: 6, address: 'Alfonso Reyes 80, Narvarte', salePrice: 980000, zoneFactor: 1.04, locationFactor: 1.01, terrainFactor: 1.00, ageFactor: 0.97, shapeFactor: 1.00, surface: 98, latitude: 19.4056, longitude: -99.1458 }
  ].map(item => ({
    ...item,
    distanceKm: haversineKm(baseLat, baseLon, item.latitude, item.longitude)
  })).sort((a, b) => a.distanceKm - b.distanceKm);
}

function calculateHomologation(input) {
  const {
    comparableSales = [],
    subject = {},
    weights = { zone: 0.3, location: 0.25, terrain: 0.15, age: 0.15, shape: 0.15 }
  } = input;

  const selectedComparables = Array.isArray(comparableSales) && comparableSales.length > 0
    ? comparableSales
    : getDefaultComparablePool(subject).slice(0, 5);

  const homologatedValues = selectedComparables.map(item => {
    const zoneFactor = item.zoneFactor ?? 1;
    const locationFactor = item.locationFactor ?? 1;
    const terrainFactor = item.terrainFactor ?? 1;
    const ageFactor = item.ageFactor ?? 1;
    const shapeFactor = item.shapeFactor ?? 1;

    const adjustedValue = item.salePrice * zoneFactor * locationFactor * terrainFactor * ageFactor * shapeFactor;
    return {
      ...item,
      adjustedValue,
      unitValuePerM2: adjustedValue / (item.surface || 1)
    };
  });

  const validComparables = homologatedValues.filter(item => Number(item.salePrice) > 0 && Number(item.surface) > 0);
  const averageUnitValue = validComparables.length
    ? validComparables.reduce((sum, item) => sum + item.unitValuePerM2, 0) / validComparables.length
    : 0;
  const terrainSurface = Number(subject.surface) || 0;
  const constructionSurface = Number(subject.constructionSurface) || 0;
  const terrainValue = roundCurrency(terrainSurface * (Number(subject.unitLandValue) || 0));
  const marketValueBeforeAdjustment = roundCurrency(averageUnitValue * constructionSurface);
  const valorMercado = roundCurrency(marketValueBeforeAdjustment * (Number(subject.marketAdjustment) || 1));
  const hasPhysicalCostInputs = Number(subject.unitLandValue) > 0 || Number(subject.physicalConstructionValue) > 0 || Number(subject.physicalAccessoryValue) > 0;
  const constructionValue = roundCurrency(Number(subject.physicalConstructionValue) > 0
    ? Number(subject.physicalConstructionValue)
    : (hasPhysicalCostInputs ? 0 : constructionSurface * averageUnitValue * 0.8));
  const accessoryValue = roundCurrency(Number(subject.physicalAccessoryValue) || 0);
  const valorFisico = roundCurrency(terrainValue + constructionValue + accessoryValue);
  const annualIncome = Number(subject.annualIncome) || (valorMercado * 0.08);
  const capRate = subject.capRate || 0.08;
  const valorCapitalizacion = roundCurrency(annualIncome / capRate);
  const hasIncomeInputs = Number(subject.annualIncome) > 0 && Number(subject.capRate) > 0;
  const finalValue = valorMercado;

  return {
    summary: {
      averageUnitValuePerM2: roundCurrency(averageUnitValue),
      finalValue,
      valorTerreno: terrainValue,
      valorConstruccion: constructionValue,
      valorFisico,
      valorMercado,
      valorCapitalizacion,
      valorAccesorios: accessoryValue,
      marketValuationStatus: validComparables.length
        ? `${validComparables.length} comparable(s) con precio y superficie capturados; confirmar ubicación, fecha, fuente, características y homologación.`
        : 'Sin comparables completos; no se emitió una conclusión cuantitativa de mercado.',
      physicalValuationStatus: hasPhysicalCostInputs
        ? `El enfoque físico incorpora únicamente los componentes capturados. ${Number(subject.unitLandValue) > 0 ? '' : 'Falta valor unitario de terreno; no se asignó valor a ese componente. '}${Number(subject.physicalConstructionValue) > 0 ? '' : 'Falta valor de reposición de construcciones; no se asignó valor a ese componente. '}${Number(subject.physicalAccessoryValue) > 0 ? '' : 'No se capturó valor depreciado de accesorios. '}Verificar fuentes, fecha, depreciación y alcance.`
        : 'Enfoque físico provisional: faltan valores unitarios documentados; la construcción se aproxima con el promedio de comparables (no es costo de reposición) y el terreno no se valora sin fuente unitaria.',
      incomeValuationStatus: hasIncomeInputs
        ? 'Capitalización calculada con ingreso anual neto y tasa capturados; verificar soporte y tasa aplicable.'
        : 'Capitalización ilustrativa: no se capturaron ambos, ingreso anual neto y tasa; se usó ingreso derivado del mercado y/o tasa provisional.',
      weights
    },
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
