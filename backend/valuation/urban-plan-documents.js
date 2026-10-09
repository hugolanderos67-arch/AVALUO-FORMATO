const path = require('path');
const mammoth = require('mammoth');
const { PDFParse } = require('pdf-parse');

const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
const MAX_EXTRACTED_TEXT_LENGTH = 5_000_000;

const FIELD_RULES = [
  { field: 'clasificacionZona', label: 'Clasificación de la zona', expression: /^(?:clasificaci[oó]n\s+(?:de\s+)?(?:la\s+)?zona|clasificaci[oó]n\s+urbana)\s*[:\-–]\s*(.+)$/i },
  { field: 'poblacion', label: 'Población / contexto demográfico', expression: /^(?:poblaci[oó]n(?:\s+(?:total|estimada|de\s+la\s+localidad))?|habitantes)\s*[:\-–]\s*(.+)$/i },
  { field: 'construccionDominante', label: 'Construcción dominante', expression: /^(?:construcci[oó]n\s+dominante|tipolog[ií]a\s+constructiva\s+predominante)\s*[:\-–]\s*(.+)$/i },
  { field: 'nivelSocioeconomico', label: 'Nivel socioeconómico', expression: /^(?:nivel\s+socioecon[oó]mico|estrato\s+socioecon[oó]mico)\s*[:\-–]\s*(.+)$/i },
  { field: 'indiceSaturacion', label: 'Índice de saturación de la zona', expression: /^(?:[ií]ndice\s+de\s+saturaci[oó]n(?:\s+de\s+la\s+zona)?)\s*[:\-–]\s*([\d.,]+\s*%?)(?:\s.*)?$/i, numeric: true },
  { field: 'densidadHabitacional', label: 'Densidad habitacional permitida', expression: /^(?:densidad\s+(?:habitacional|de\s+vivienda)(?:\s+permitida)?)\s*[:\-–]\s*(.+)$/i },
  { field: 'usoSueloPot', label: 'Uso de suelo según P.O.T.', expression: /^(?:uso\s+(?:de(?:l)?\s+)?suelo(?:\s+(?:permitido|asignado|seg[uú]n\s+(?:el\s+)?(?:P\.?O\.?T\.?|plan\s+de\s+ordenamiento)))?|zonificaci[oó]n(?:\s+secundaria)?)\s*[:\-–]\s*(.+)$/i },
  { field: 'vialidades', label: 'Vialidades', expression: /^(?:vialidades|v[ií]as\s+principales|jerarqu[ií]a\s+vial)\s*[:\-–]\s*(.+)$/i },
  { field: 'viasAcceso', label: 'Vías de acceso e importancia', expression: /^(?:v[ií]as\s+de\s+acceso|accesos\s+principales)\s*[:\-–]\s*(.+)$/i },
  { field: 'anchoCalle', label: 'Ancho de calle (m)', expression: /^(?:ancho\s+(?:de\s+)?(?:calle|vialidad))\s*[:\-–]\s*([\d.,]+)(?:\s*(?:m|metros?)\b)?(?:\s.*)?$/i, numeric: true },
  { field: 'banquetas', label: 'Banquetas y guarniciones', expression: /^(?:banquetas(?:\s+y\s+guarniciones)?|guarniciones)\s*[:\-–]\s*(.+)$/i },
  { field: 'equipamientoUrbano', label: 'Equipamiento urbano y distancias', expression: /^(?:equipamiento\s+urbano(?:\s+y\s+distancias?)?|servicios\s+urbanos\s+cercanos)\s*[:\-–]\s*(.+)$/i },
  { field: 'urbEducacion', label: 'Educación y distancias', expression: /^(?:educaci[oó]n(?:\s+y\s+distancias?)?|equipamiento\s+educativo)\s*[:\-–]\s*(.+)$/i },
  { field: 'urbCultura', label: 'Cultura y distancias', expression: /^(?:cultura(?:\s+y\s+distancias?)?|equipamiento\s+cultural)\s*[:\-–]\s*(.+)$/i },
  { field: 'urbSalud', label: 'Salud y distancias', expression: /^(?:salud(?:\s+y\s+distancias?)?|equipamiento\s+de\s+salud)\s*[:\-–]\s*(.+)$/i },
  { field: 'urbComercio', label: 'Comercio y abasto', expression: /^(?:comercio(?:\s+y\s+abasto)?|equipamiento\s+comercial)\s*[:\-–]\s*(.+)$/i },
  { field: 'urbTransporte', label: 'Transporte', expression: /^(?:transporte(?:\s+p[uú]blico)?|equipamiento\s+de\s+transporte)\s*[:\-–]\s*(.+)$/i },
  { field: 'urbRecreacion', label: 'Recreación y deporte', expression: /^(?:recreaci[oó]n(?:\s+y\s+deporte)?|equipamiento\s+recreativo)\s*[:\-–]\s*(.+)$/i },
  { field: 'urbSeguridad', label: 'Seguridad pública', expression: /^(?:seguridad\s+p[uú]blica|equipamiento\s+de\s+seguridad)\s*[:\-–]\s*(.+)$/i },
  { field: 'urbServicios', label: 'Infraestructura y servicios', expression: /^(?:infraestructura(?:\s+y\s+servicios?)?|servicios\s+urbanos)\s*[:\-–]\s*(.+)$/i },
  { field: 'urbDivisibilidad', label: 'Definición de divisibilidad', expression: /^(?:divisibilidad|divisi[oó]n\s+del\s+predio)\s*[:\-–]\s*(.+)$/i },
  { field: 'urbRestricciones', label: 'Restricciones del plan territorial', expression: /^(?:restricciones(?:\s+(?:del\s+plan\s+territorial|urbanas|de\s+uso\s+de\s+suelo))?|afectaciones\s+y\s+servidumbres)\s*[:\-–]\s*(.+)$/i },
  { field: 'urbContexto', label: 'Contexto territorial y demográfico', expression: /^(?:contexto\s+(?:territorial|demogr[aá]fico)|caracter[ií]sticas\s+del\s+entorno)\s*[:\-–]\s*(.+)$/i }
];

function extractUrbanPlanFields(text, fileName) {
  const lines = String(text || '').split(/\r?\n/).map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const matches = [];
  const seen = new Set();

  for (const line of lines) {
    for (const rule of FIELD_RULES) {
      const match = line.match(rule.expression);
      if (!match) continue;
      const rawValue = match[1].trim().replace(/[;,.\s]+$/, '');
      if (!rawValue) continue;
      const key = `${rule.field}:${rawValue.toLocaleLowerCase('es-MX')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push({
        field: rule.field,
        label: rule.label,
        value: rule.numeric ? rawValue.replace(/\s*%$/, '').replace(',', '.') : rawValue,
        evidence: line,
        fileName
      });
    }
  }
  return matches;
}

async function extractDocumentText(fileName, buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    const error = new Error('El archivo está vacío o no se recibió correctamente.');
    error.statusCode = 400;
    throw error;
  }
  if (buffer.length > MAX_DOCUMENT_BYTES) {
    const error = new Error('Cada documento debe pesar 15 MB o menos.');
    error.statusCode = 413;
    throw error;
  }

  const extension = path.extname(String(fileName || '')).toLowerCase();
  let text;
  if (extension === '.pdf') {
    const parser = new PDFParse({ data: buffer });
    try {
      text = (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  } else if (extension === '.docx') {
    text = (await mammoth.extractRawText({ buffer })).value;
  } else if (extension === '.txt') {
    text = buffer.toString('utf8');
  } else {
    const error = new Error('Selecciona un PDF, DOCX o TXT.');
    error.statusCode = 415;
    throw error;
  }

  const normalizedText = String(text || '').replace(/\0/g, '').slice(0, MAX_EXTRACTED_TEXT_LENGTH);
  if (!normalizedText.trim()) {
    const error = new Error('No se encontró texto seleccionable. Los documentos escaneados requieren OCR y no se procesan automáticamente.');
    error.statusCode = 422;
    throw error;
  }
  return normalizedText;
}

async function extractUrbanPlanDocument(fileName, buffer) {
  const text = await extractDocumentText(fileName, buffer);
  return {
    fileName: path.basename(String(fileName || 'documento')),
    matches: extractUrbanPlanFields(text, path.basename(String(fileName || 'documento'))),
    extractedTextLength: text.length
  };
}

module.exports = { extractUrbanPlanDocument, extractUrbanPlanFields, extractDocumentText, MAX_DOCUMENT_BYTES };
