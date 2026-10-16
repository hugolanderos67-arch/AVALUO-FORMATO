const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createAvaluosRepository } = require('../backend/db/avaluos-repository');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function createTempRepository(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'banco-'));
  const options = { databasePath: path.join(dir, 'avaluos.db'), filesDir: path.join(dir, 'archivos') };
  let repository = createAvaluosRepository(options);
  t.after(() => {
    repository.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return {
    dir,
    get repository() { return repository; },
    reopen() {
      repository.close();
      repository = createAvaluosRepository(options);
      return repository;
    }
  };
}

function avaluoWithComparables() {
  return {
    fields: { tipoInmueble: 'Casa habitación', colonia: 'La Paz', municipio: 'Puebla', estado: 'Puebla', fechaAvaluo: '2026-09-01', latitud: '19.05', longitud: '-98.22' },
    constructionComparables: [
      { index: '0', field: 'address', value: 'Av. Juárez 100' },
      { index: '0', field: 'salePrice', value: '2400000' },
      { index: '0', field: 'surface', value: '120' },
      { index: '0', field: 'tipoDato', value: 'Oferta' },
      { index: '0', field: 'fuente', value: 'https://portal.example/anuncio/1' },
      { index: '0', field: 'latitud', value: '19.06' },
      { index: '0', field: 'longitud', value: '-98.21' },
      { index: '1', field: 'address', value: 'Sin precio' },
      { index: '1', field: 'salePrice', value: '0' },
      { index: '1', field: 'surface', value: '100' }
    ],
    marketComparables: [
      { group: 'land', index: '0', field: 'address', value: 'Lote 5' },
      { group: 'land', index: '0', field: 'price', value: '900000' },
      { group: 'land', index: '0', field: 'surface', value: '200' },
      { group: 'rent', index: '0', field: 'price', value: '12000' },
      { group: 'rent', index: '0', field: 'surface', value: '80' },
      { group: 'rent', index: '0', field: 'fechaDato', value: '2026-08-15' }
    ],
    comparablePhotos: { construction: [[{ name: 'c1.png', preview: PNG }]], land: [], rent: [] }
  };
}

test('al guardar un avalúo sus comparables completos pasan al banco', t => {
  const context = createTempRepository(t);
  const saved = context.repository.save(null, { datos: avaluoWithComparables() });
  const bank = context.repository.bank.list();
  assert.equal(bank.length, 3, 'el comparable sin precio no entra');

  const construction = bank.find(item => item.categoria === 'construccion');
  assert.equal(construction.valor_unitario, 20000);
  assert.equal(construction.tipo_inmueble, 'Casa habitación');
  assert.equal(construction.fuente, 'https://portal.example/anuncio/1');
  assert.equal(construction.latitud, 19.06);
  assert.equal(construction.ubicacion_aproximada, false);
  assert.equal(construction.fecha_dato, '2026-09-01', 'sin fecha propia toma la del avalúo');
  assert.equal(construction.origen_avaluo_id, saved.id);
  assert.match(construction.fotos[0], /^\/api\/archivos\/\d+$/);

  const land = bank.find(item => item.categoria === 'terreno');
  assert.equal(land.tipo_inmueble, 'Terreno');
  assert.equal(land.valor_unitario, 4500);
  assert.equal(land.ubicacion_aproximada, true);
  assert.equal(land.latitud, 19.05, 'sin coordenadas propias usa las del inmueble sujeto');
  assert.equal(bank.find(item => item.categoria === 'renta').fecha_dato, '2026-08-15');
});

test('guardar de nuevo actualiza sin duplicar y una tarjeta vaciada sale del banco', t => {
  const context = createTempRepository(t);
  const datos = avaluoWithComparables();
  const saved = context.repository.save(null, { datos });
  datos.constructionComparables.find(item => item.index === '0' && item.field === 'salePrice').value = '2640000';
  datos.marketComparables = datos.marketComparables.filter(item => item.group !== 'rent');
  context.repository.save(saved.id, { datos: { ...datos, comparablePhotos: context.repository.get(saved.id).datos.comparablePhotos } });

  const bank = context.repository.bank.list();
  assert.equal(bank.length, 2);
  assert.equal(bank.find(item => item.categoria === 'construccion').valor_unitario, 22000);
  assert.equal(bank.some(item => item.categoria === 'renta'), false);
});

test('lo editado o quitado en el banco se respeta en los siguientes guardados', t => {
  const context = createTempRepository(t);
  const datos = avaluoWithComparables();
  const saved = context.repository.save(null, { datos });
  const { bank } = context.repository;
  const land = bank.list({ categoria: 'terreno' })[0];
  bank.update(land.id, { categoria: 'terreno', precio: 950000, superficie: 200, notas: 'Precio verificado con el vendedor' });
  const rent = bank.list({ categoria: 'renta' })[0];
  assert.equal(bank.remove(rent.id), true);

  context.repository.save(saved.id, { datos: { ...datos, comparablePhotos: {} } });
  assert.equal(bank.list({ categoria: 'terreno' })[0].valor_unitario, 4750);
  assert.equal(bank.list({ categoria: 'renta' }).length, 0, 'el quitado no regresa');
});

test('al eliminar el avalúo sus comparables se conservan sin fotos', t => {
  const context = createTempRepository(t);
  const saved = context.repository.save(null, { datos: avaluoWithComparables() });
  context.repository.remove(saved.id);
  const bank = context.repository.bank.list();
  assert.equal(bank.length, 3);
  assert.ok(bank.every(item => item.origen_avaluo_id === null && item.fotos.length === 0));
});

test('sin coordenadas propias ni del inmueble sujeto, el comparable queda sin ubicación', t => {
  const context = createTempRepository(t);
  const datos = avaluoWithComparables();
  delete datos.fields.latitud;
  delete datos.fields.longitud;
  context.repository.save(null, { datos });
  const land = context.repository.bank.list({ categoria: 'terreno' })[0];
  assert.equal(land.latitud, null);
  assert.equal(land.ubicacion_aproximada, false);
});

test('captura manual, filtros y validación', t => {
  const context = createTempRepository(t);
  const { bank } = context.repository;
  const created = bank.create({ categoria: 'construccion', tipoInmueble: 'Departamento', direccion: 'Torre Norte 301', municipio: 'San Andrés Cholula', precio: 3000000, superficie: 100, tipoDato: 'Venta', fuente: 'Notaría 15', fechaDato: '2026-07-01' });
  assert.equal(created.valor_unitario, 30000);
  bank.create({ categoria: 'terreno', municipio: 'Puebla', precio: 500000, superficie: 250 });
  assert.equal(bank.list({ categoria: 'construccion' }).length, 1);
  assert.equal(bank.list({ municipio: 'Puebla' }).length, 1);
  assert.equal(bank.list({ q: 'notaría' }).length, 1);
  assert.throws(() => bank.create({ categoria: 'otra', precio: 1, superficie: 1 }), error => error.statusCode === 400);
  assert.throws(() => bank.create({ categoria: 'terreno', precio: 0, superficie: 10 }), error => error.statusCode === 400);
  assert.equal(bank.remove(created.id), true);
  assert.equal(bank.get(created.id), null);
});

test('la primera vez carga los comparables de los avalúos ya guardados', t => {
  const context = createTempRepository(t);
  context.repository.save(null, { datos: avaluoWithComparables() });
  // Simula una base anterior al banco: avalúos guardados y tabla del banco vacía.
  const { DatabaseSync } = require('node:sqlite');
  const raw = new DatabaseSync(path.join(context.dir, 'avaluos.db'));
  raw.exec('DELETE FROM banco_comparables');
  raw.close();
  assert.equal(context.reopen().bank.list().length, 3);
});
