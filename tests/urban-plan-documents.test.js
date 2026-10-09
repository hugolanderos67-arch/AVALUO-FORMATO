const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { extractUrbanPlanFields, extractUrbanPlanDocument, MAX_DOCUMENT_BYTES } = require('../backend/valuation/urban-plan-documents');

function createTextPdf(text) {
  const escapedText = text.replace(/[\\()]/g, '\\$&');
  const stream = `BT /F1 12 Tf 50 750 Td (${escapedText}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf);
}

async function createTextDocx(text) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('extrae campos explícitos del plan y conserva evidencia y nombre de archivo', () => {
  const matches = extractUrbanPlanFields([
    'Uso de suelo según P.O.T.: H3',
    'Densidad habitacional permitida: 120 viviendas por hectárea',
    'Ancho de calle: 12.5 m',
    'Índice de saturación de la zona: 78%'
  ].join('\n'), 'POT Irapuato.txt');

  assert.equal(matches.length, 4);
  assert.equal(matches.find(item => item.field === 'usoSueloPot')?.value, 'H3');
  assert.equal(matches.find(item => item.field === 'densidadHabitacional')?.value, '120 viviendas por hectárea');
  assert.equal(matches.find(item => item.field === 'anchoCalle')?.value, '12.5');
  assert.match(matches[0].evidence, /P\.O\.T\./);
  assert.ok(matches.every(item => item.fileName === 'POT Irapuato.txt'));
});

test('no asigna texto sin etiqueta explícita a un campo territorial', () => {
  const matches = extractUrbanPlanFields('El predio se localiza en zona habitacional con vialidades de distinto orden.', 'nota.txt');
  assert.deepEqual(matches, []);
});

test('reconoce apartados de equipamiento e infraestructura urbana', () => {
  const matches = extractUrbanPlanFields([
    'Educación: primaria a 400 m',
    'Salud: clínica municipal a 1 km',
    'Transporte público: parada sobre avenida principal',
    'Infraestructura y servicios: agua, drenaje y electricidad'
  ].join('\n'), 'programa.txt');

  assert.equal(matches.find(item => item.field === 'urbEducacion')?.value, 'primaria a 400 m');
  assert.equal(matches.find(item => item.field === 'urbSalud')?.value, 'clínica municipal a 1 km');
  assert.equal(matches.find(item => item.field === 'urbTransporte')?.value, 'parada sobre avenida principal');
  assert.equal(matches.find(item => item.field === 'urbServicios')?.value, 'agua, drenaje y electricidad');
});

test('extrae texto TXT en memoria y restringe tipos y tamaños', async () => {
  const result = await extractUrbanPlanDocument('plan.txt', Buffer.from('Uso de suelo: H3', 'utf8'));
  assert.equal(result.matches[0].field, 'usoSueloPot');
  await assert.rejects(extractUrbanPlanDocument('plan.doc', Buffer.from('contenido')), /PDF, DOCX o TXT/);
  await assert.rejects(extractUrbanPlanDocument('plan.txt', Buffer.alloc(MAX_DOCUMENT_BYTES + 1)), /15 MB/);
});

test('extrae una etiqueta territorial desde un PDF con texto seleccionable', async () => {
  const result = await extractUrbanPlanDocument('plan.pdf', createTextPdf('Uso de suelo: H3'));
  assert.equal(result.matches[0]?.field, 'usoSueloPot');
  assert.equal(result.matches[0]?.value, 'H3');
});

test('extrae una etiqueta territorial desde un DOCX', async () => {
  const result = await extractUrbanPlanDocument('plan.docx', await createTextDocx('Uso de suelo: H3'));
  assert.equal(result.matches[0]?.field, 'usoSueloPot');
  assert.equal(result.matches[0]?.value, 'H3');
});
