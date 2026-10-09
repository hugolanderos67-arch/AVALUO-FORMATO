const test = require('node:test');
const assert = require('node:assert/strict');
const descriptions = require('../frontend/technical-descriptions');

test('describe los catálogos de cimentación, estructura, entrepiso y techumbre', () => {
  const result = descriptions.generateConstructionDescriptions({
    cimentacion: 'Zapata aislada',
    estructuraVertical: 'Marcos de acero',
    entrepisos: 'Losa maciza',
    techumbres: 'Cubierta de teja'
  });

  assert.match(result.cimentacion, /Zapata aislada/);
  assert.match(result.estructuraVertical, /perfiles de acero estructural/);
  assert.match(result.entrepisos, /concreto armado/);
  assert.match(result.techumbres, /teja/);
});

test('genera hidráulica con solo los componentes seleccionados', () => {
  const result = descriptions.generateHydraulicDescription({
    materialRedHidraulica: 'Cobre',
    abastecimientoHidraulico: 'Red municipal',
    almacenamientoHidraulico: 'Tinaco',
    aguaCalienteHidraulica: '',
    estadoConservacionHidraulica: 'B'
  });

  assert.match(result, /tubería de cobre/);
  assert.match(result, /abastecida por red municipal/);
  assert.match(result, /almacenamiento en tinaco/);
  assert.doesNotMatch(result, /calentador/);
});

test('no describe instalación fija cuando gas indica que no cuenta', () => {
  const result = descriptions.generateGasDescription({
    combustibleGas: 'No cuenta',
    almacenamientoGas: 'Tanque estacionario',
    equiposGas: ['Estufa']
  });

  assert.equal(result, 'Instalación de gas: no se cuenta con una instalación fija de gas.');
  assert.doesNotMatch(result, /tanque estacionario|estufa/);
});

test('distingue gas LP y gas natural de cilindro y tanque estacionario', () => {
  const lp = descriptions.generateGasDescription({ combustibleGas: 'Gas LP', almacenamientoGas: 'Cilindro portátil' });
  const natural = descriptions.generateGasDescription({ combustibleGas: 'Gas natural', almacenamientoGas: 'Red municipal' });
  const inconsistent = descriptions.generateGasDescription({ combustibleGas: 'Gas natural', almacenamientoGas: 'Tanque estacionario' });

  assert.match(lp, /Gas LP, suministro mediante cilindro portátil/);
  assert.match(natural, /Gas natural, suministro mediante red municipal/);
  assert.doesNotMatch(inconsistent, /tanque estacionario/);
  assert.doesNotMatch(natural, /Gas LP/);
});

test('no afirma tierra física ni funcionamiento si no se confirma', () => {
  const result = descriptions.generateElectricDescription({
    alimentacionElectrica: 'Monofásica',
    conductoresElectricos: 'Cobre',
    tierraFisicaElectrica: '',
    proteccionElectrica: '',
    estadoConservacionElectrica: 'ND'
  });

  assert.match(result, /monofásica/);
  assert.doesNotMatch(result, /tierra física|puesta a tierra|protección mediante|funcionamiento/);
});

test('incluye las nueve categorías, estados comunes y funcionamiento especial', () => {
  assert.equal(descriptions.SPECIAL_INSTALLATIONS.length, 9);
  assert.deepEqual(descriptions.CONSERVATION_STATES.map(item => item.value), ['B', 'R', 'M', 'O', 'NV', 'ND']);
  const outOfService = descriptions.generateSpecialDescription({
    description: 'Sistema fotovoltaico.',
    conservation: 'O',
    functionStatus: 'out_of_service'
  });
  const unverified = descriptions.generateSpecialDescription({
    description: 'Elevador de pasajeros.',
    conservation: 'ND',
    functionStatus: 'normal'
  });

  assert.match(outOfService, /fuera de servicio/);
  assert.doesNotMatch(unverified, /funcionamiento aparente normal/);
});