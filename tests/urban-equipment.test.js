const test = require('node:test');
const assert = require('node:assert/strict');
const { lookupUrbanEquipment, summarizeElements, buildQuery, formatDistance } = require('../backend/valuation/urban-equipment');

const ORIGIN = { latitude: 19.0414, longitude: -98.2063 };
// Desplazamiento aproximado hacia el norte: 0.001° de latitud ≈ 111 m.
const north = meters => ({ lat: ORIGIN.latitude + meters / 111195, lon: ORIGIN.longitude });

test('formatea distancias en metros y kilómetros', () => {
  assert.equal(formatDistance(3), '10 m');
  assert.equal(formatDistance(347), '350 m');
  assert.equal(formatDistance(1460), '1.5 km');
});

test('agrupa por casilla, conserva el más cercano de cada tipo y ordena por distancia', () => {
  const { fields, categories } = summarizeElements([
    { type: 'node', ...north(100), tags: { amenity: 'pharmacy', name: 'Farmacia A' } },
    { type: 'node', ...north(300), tags: { amenity: 'pharmacy', name: 'Farmacia B' } },
    { type: 'way', center: north(800), tags: { amenity: 'hospital', name: 'Hospital General' } },
    { type: 'node', ...north(150), tags: { highway: 'bus_stop' } },
    { type: 'node', ...north(50), tags: { amenity: 'parking' } }
  ], ORIGIN, new Date('2026-10-15T18:00:00Z'));

  assert.deepEqual(categories.urbSalud.map(item => item.name), ['Farmacia A', 'Hospital General']);
  assert.equal(fields.urbSalud, '💊 Farmacia A — 100 m\n🏥 Hospital General — 800 m\nFuente: OpenStreetMap, 15/10/2026 · distancias en línea recta.');
  assert.match(fields.urbTransporte, /^🚏 Parada de autobús — 150 m\n/);
  assert.match(fields.urbSeguridad, /^Sin registro a menos de 2 km\./);
  assert.match(fields.urbServicios, /Agua, drenaje, electricidad y alumbrado: verificar en campo\./);
  assert.match(fields.equipamientoUrbano, /^💊 Farmacia A — 100 m$/m);
  assert.match(fields.equipamientoUrbano, /^Seguridad pública: sin registro/m);
});

test('consulta un servidor alternativo cuando el primero está saturado', async () => {
  const called = [];
  const fetchImpl = async url => {
    called.push(new URL(url).hostname);
    if (called.length === 1) return new Response('saturado', { status: 504 });
    return new Response(JSON.stringify({ elements: [{ type: 'node', ...north(200), tags: { amenity: 'school', name: 'Primaria' } }] }), { status: 200 });
  };
  const result = await lookupUrbanEquipment(ORIGIN.latitude + 0.5, ORIGIN.longitude, { fetchImpl });
  assert.equal(called.length, 2);
  assert.equal(result.elementCount, 1);
  assert.match(result.fields.urbEducacion, /^🏫 Primaria — /);
});

test('explica cuando ningún servidor responde', async () => {
  const fetchImpl = async () => new Response('error', { status: 502 });
  await assert.rejects(lookupUrbanEquipment(ORIGIN.latitude + 0.7, ORIGIN.longitude, { fetchImpl }), error => error.statusCode === 503 && /saturados/.test(error.message));
});

test('la consulta incluye todas las categorías dentro del radio', () => {
  const query = buildQuery(ORIGIN);
  assert.match(query, /around:2000,19\.0414,-98\.2063/);
  ['amenity', 'shop', 'leisure', 'highway', 'railway', 'tourism', 'public_transport'].forEach(key => assert.match(query, new RegExp(`"${key}"`)));
});
