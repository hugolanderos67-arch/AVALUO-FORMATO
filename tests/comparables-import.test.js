const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createAvaluosRepository } = require('../backend/db/avaluos-repository');
const { importComparables, templateCsv, parseNumber, parseDate, parseCsv } = require('../backend/db/comparables-import');
const { createXlsx } = require('./helpers/xlsx');

function createBank(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'importar-'));
  const repository = createAvaluosRepository({ databasePath: path.join(dir, 'avaluos.db'), filesDir: path.join(dir, 'archivos') });
  t.after(() => {
    repository.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return repository.bank;
}

test('interpreta números, fechas y CSV con distintos formatos', () => {
  assert.equal(parseNumber('$1,250,000.50'), 1250000.5);
  assert.equal(parseNumber('1,250,000'), 1250000);
  assert.equal(parseNumber('125,5'), 125.5);
  assert.equal(parseNumber('125 m2'), 125);
  assert.ok(Number.isNaN(parseNumber('ciento veinte')));
  assert.equal(parseDate('20/09/2026'), '2026-09-20');
  assert.equal(parseDate('2026-09-20'), '2026-09-20');
  assert.equal(parseDate('5-1-26'), '2026-01-05');
  assert.equal(parseDate(46285), '2026-09-20');
  assert.equal(parseDate('31/02/2026'), null);
  assert.deepEqual(parseCsv('a;b\n"x;1";"di ""dos"""\n'), [['a', 'b'], ['x;1', 'di "dos"']]);
});

test('la plantilla se importa completa', async t => {
  const bank = createBank(t);
  const result = await importComparables(bank, { buffer: Buffer.from(templateCsv(), 'utf8'), fileName: 'plantilla.csv', commit: true });
  assert.equal(result.filas, 3);
  assert.equal(result.validos, 3);
  assert.equal(result.importados, 3);
  assert.deepEqual(result.errores, []);
  const construction = bank.list({ categoria: 'construccion' })[0];
  assert.equal(construction.valor_unitario, 20000);
  assert.equal(construction.fecha_dato, '2026-09-20');
  assert.equal(construction.latitud, 19.0566);
  assert.equal(bank.list({ categoria: 'renta' })[0].precio, 18000);
});

test('Excel con encabezados alternativos, errores por fila y duplicados', async t => {
  const bank = createBank(t);
  bank.create({ categoria: 'construccion', direccion: 'Calle 1', precio: 1000000, superficie: 100, fechaDato: '2026-05-01' });
  const buffer = await createXlsx([
    ['Categoría', 'Precio de oferta', 'Superficie construida (m²)', 'Fecha', 'Ubicación', 'Municipio', 'Columna propia'],
    ['construcción', 1000000, 100, new Date(2026, 4, 1), 'Calle 1', 'Puebla', 'x'],
    ['Construcción', '$2,000,000', '125', '10/06/2026', 'Calle 2', 'Puebla', ''],
    ['terreno', 'ochocientos mil', 200, '', 'Lote 9', 'Atlixco', ''],
    ['bodega', 500000, 50, '', 'Calle 3', '', ''],
    ['Construcción', '$2,000,000', '125', '10/06/2026', 'Calle 2', 'Puebla', ''],
    ['', 300000, 0, '', 'Calle 4', '', '']
  ]);

  const preview = await importComparables(bank, { buffer, fileName: 'mercado.xlsx' });
  assert.equal(preview.filas, 6);
  assert.equal(preview.validos, 1);
  assert.equal(preview.importados, 0, 'la vista previa no importa');
  assert.deepEqual(preview.columnasIgnoradas, ['Columna propia']);
  assert.deepEqual(preview.duplicados.map(item => [item.fila, item.motivo]), [[2, 'ya está en el banco'], [6, 'repetido en el archivo']]);
  assert.deepEqual(preview.errores.map(item => item.fila), [4, 5, 7]);
  assert.match(preview.errores[0].problemas[0], /precio/);
  assert.match(preview.errores[1].problemas[0], /bodega/);
  assert.match(preview.errores[2].problemas[0], /precio y superficie/);

  const result = await importComparables(bank, { buffer, fileName: 'mercado.xlsx', commit: true });
  assert.equal(result.importados, 1);
  assert.equal(bank.list().length, 2);
  assert.equal(bank.list().find(item => item.direccion === 'Calle 2').valor_unitario, 16000);
});

test('rechaza archivos sin columnas de precio y superficie o de otro formato', async t => {
  const bank = createBank(t);
  await assert.rejects(importComparables(bank, { buffer: Buffer.from('Dirección,Colonia\nCalle 1,Centro\n'), fileName: 'a.csv' }), /precio y superficie/);
  await assert.rejects(importComparables(bank, { buffer: Buffer.from('x'), fileName: 'a.xls' }), error => error.statusCode === 415);
  await assert.rejects(importComparables(bank, { buffer: Buffer.from('Precio,Superficie\n'), fileName: 'a.csv' }), /no tiene filas/);
});
