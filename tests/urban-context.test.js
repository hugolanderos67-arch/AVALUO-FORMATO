const test = require('node:test');
const assert = require('node:assert/strict');
const { mapReverseGeocode, normalizeCoordinates } = require('../backend/valuation/urban-context');

test('mapea la respuesta geográfica a campos de ubicación con atribución', () => {
  const result = mapReverseGeocode({
    category: 'place',
    type: 'house',
    display_name: '83, Calle Mariano Matamoros, De San Vicente, Irapuato, Guanajuato, México',
    address: {
      house_number: '83',
      road: 'Calle Mariano Matamoros',
      quarter: 'De San Vicente',
      city: 'Irapuato',
      county: 'Irapuato',
      state: 'Guanajuato',
      country: 'México',
      country_code: 'mx'
    }
  }, normalizeCoordinates('20.671850', '-101.341790'));

  assert.equal(result.fields.calle, '83 Calle Mariano Matamoros');
  assert.equal(result.fields.colonia, 'De San Vicente');
  assert.equal(result.fields.municipio, 'Irapuato');
  assert.equal(result.fields.estado, 'Guanajuato');
  assert.match(result.fields.poblacion, /sin cifra censal/);
  assert.match(result.fields.vialidades, /Calle Mariano Matamoros/);
  assert.match(result.fields.urbGeorreferenciacion, /OpenStreetMap/);
  assert.match(result.attribution, /OpenStreetMap contributors/);
});

test('no inventa clasificación oficial ni datos urbanos ausentes de la fuente', () => {
  const result = mapReverseGeocode({
    category: 'place',
    type: 'house',
    address: { road: 'Calle Principal', city: 'Irapuato', state: 'Guanajuato', country_code: 'mx' }
  }, normalizeCoordinates(20.67, -101.34));

  for (const key of ['clasificacionZona', 'construccionDominante', 'nivelSocioeconomico', 'indiceSaturacion', 'densidadHabitacional', 'usoSueloPot', 'anchoCalle', 'banquetas', 'equipamientoUrbano']) {
    assert.equal(result.fields[key], undefined);
  }
});

test('valida coordenadas dentro de límites WGS84', () => {
  assert.deepEqual(normalizeCoordinates('20.671850', '-101.341790'), {
    latitude: 20.67185,
    longitude: -101.34179
  });
  assert.throws(() => normalizeCoordinates(91, -101), /rango WGS84/);
  assert.throws(() => normalizeCoordinates(20, -181), /rango WGS84/);
});
