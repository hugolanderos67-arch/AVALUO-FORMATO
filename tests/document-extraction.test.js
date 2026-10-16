const test = require('node:test');
const assert = require('node:assert/strict');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { createDocumentExtractor, parsePageSelection, verifyQuote, normalizeNumericValue } = require('../backend/valuation/document-extraction');

async function createPdf(pageTexts) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pageTexts.forEach(text => {
    const page = pdf.addPage([612, 792]);
    text.split('\n').forEach((line, index) => page.drawText(line, { x: 50, y: 740 - index * 18, size: 11, font }));
  });
  return Buffer.from(await pdf.save());
}

function fakeClient(output, captured = {}) {
  return {
    beta: {
      messages: {
        create: async request => {
          captured.request = request;
          const sent = await PDFDocument.load(Buffer.from(request.messages[0].content[0].source.data, 'base64'));
          captured.sentPages = sent.getPageCount();
          return { model: 'modelo-de-prueba', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(output) }] };
        }
      }
    }
  };
}

const LONG_LINE = 'Texto de relleno para simular un documento con capa de texto seleccionable en la pagina.';

test('interpreta la selección de páginas', () => {
  assert.deepEqual(parsePageSelection('', 4), [1, 2, 3, 4]);
  assert.deepEqual(parsePageSelection('todas', 3), [1, 2, 3]);
  assert.deepEqual(parsePageSelection('3, 1-2, 2', 5), [1, 2, 3]);
  assert.throws(() => parsePageSelection('2-9', 5), /fuera del documento/);
  assert.throws(() => parsePageSelection('dos', 5), /No se entiende/);
});

test('normaliza números y verifica citas sin importar acentos ni mayúsculas', () => {
  assert.equal(normalizeNumericValue('1,250.50 m2'), '1250.50');
  assert.equal(normalizeNumericValue('$ 980,000'), '980000');
  assert.equal(normalizeNumericValue('doscientos'), null);
  assert.equal(verifyQuote('SUPERFICIE de 200.00 m2', 'con una superficie de 200.00 m2 y', [], true), 'verificada');
  assert.equal(verifyQuote('al norte 10 m', 'otra pagina', ['Al Norte: 10 m con calle'], true), 'verificada_otra_pagina');
  assert.equal(verifyQuote('texto inventado', 'nada', ['nada'], true), 'no_encontrada');
  assert.equal(verifyQuote('lo que sea', '', [], false), 'sin_texto');
});

test('envía solo las páginas elegidas y traduce la página citada a la del documento original', async () => {
  const buffer = await createPdf([
    `Portada de la escritura\n${LONG_LINE}`,
    `Antecedentes generales\n${LONG_LINE}`,
    `El lote tiene una superficie de 200.00 m2\nAl norte en 10.00 metros con calle Reforma\n${LONG_LINE}`
  ]);
  const captured = {};
  const extractor = createDocumentExtractor({
    client: fakeClient({
      tipo_documento: 'Escritura pública',
      observaciones: '',
      datos: [
        { campo: 'superficieTerreno', valor: '200.00', cita: 'superficie de 200.00 m2', pagina: 2 },
        { campo: 'medidasColindancias', valor: 'Al norte 10.00 m con calle Reforma', cita: 'Al norte en 10.00 metros con calle Reforma', pagina: 2 },
        { campo: 'propietario', valor: 'Persona inventada', cita: 'vende el señor X', pagina: 1 },
        { campo: 'niveles', valor: 'dos', cita: 'dos niveles', pagina: 1 }
      ]
    }, captured)
  });

  const result = await extractor.extract({ buffer, fileName: 'escritura.pdf', pages: '1, 3' });
  assert.equal(captured.sentPages, 2);
  assert.equal(captured.request.model, 'claude-opus-5-5');
  assert.equal(captured.request.fallbacks, 'default');
  assert.deepEqual(result.pagesSent, [1, 3]);
  assert.equal(result.pageCount, 3);
  assert.equal(result.hasTextLayer, true);
  assert.equal(result.documentType, 'Escritura pública');

  const byField = Object.fromEntries(result.matches.map(match => [match.field, match]));
  assert.equal(byField.superficieTerreno.page, 3);
  assert.equal(byField.superficieTerreno.verification, 'verificada');
  assert.equal(byField.medidasColindancias.verification, 'verificada');
  assert.equal(byField.propietario.verification, 'no_encontrada');
  assert.equal(byField.niveles, undefined, 'un valor numérico ilegible se descarta');
});

test('informa páginas y capa de texto, y rechaza archivos que no son PDF', async () => {
  const extractor = createDocumentExtractor({ client: fakeClient({ tipo_documento: '', observaciones: '', datos: [] }) });
  const info = await extractor.getPdfInfo(await createPdf([LONG_LINE, LONG_LINE]));
  assert.equal(info.pageCount, 2);
  assert.equal(info.hasTextLayer, true);
  assert.equal(typeof info.sizeMb, 'number');
  await assert.rejects(extractor.getPdfInfo(Buffer.from('no es pdf')), error => error.statusCode === 415);
});

test('explica cómo configurar la clave cuando falta', async t => {
  const saved = { key: process.env.ANTHROPIC_API_KEY, token: process.env.ANTHROPIC_AUTH_TOKEN };
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  t.after(() => {
    if (saved.key !== undefined) process.env.ANTHROPIC_API_KEY = saved.key;
    if (saved.token !== undefined) process.env.ANTHROPIC_AUTH_TOKEN = saved.token;
  });
  const extractor = createDocumentExtractor();
  await assert.rejects(extractor.extract({ buffer: await createPdf([LONG_LINE]), fileName: 'a.pdf', pages: '' }), error => error.statusCode === 503 && /ANTHROPIC_API_KEY/.test(error.message));
});
