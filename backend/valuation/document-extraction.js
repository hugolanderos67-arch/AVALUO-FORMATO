const path = require('path');
const { PDFDocument } = require('pdf-lib');
const { PDFParse } = require('pdf-parse');
const Anthropic = require('@anthropic-ai/sdk').default;

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';
const MAX_PDF_BYTES = (Number(process.env.MAX_UPLOAD_MB) || 200) * 1024 * 1024;
// La API admite solicitudes de hasta 32 MB; el PDF viaja en base64 (+33 %), así que las páginas enviadas deben sumar ~22 MB o menos.
const MAX_SENT_PDF_BYTES = 22 * 1024 * 1024;
const MAX_PAGES_PER_REQUEST = 60;
const TEXT_LAYER_SAMPLE_PAGES = 5;

// Campos de la captura que la extracción puede proponer. `numeric` exige un número sin unidades.
const EXTRACTION_FIELDS = [
  { field: 'propietario', label: 'Propietario', hint: 'Nombre del propietario o titular actual del inmueble.' },
  { field: 'calle', label: 'Calle y número', hint: 'Calle y número oficial del inmueble valuado.' },
  { field: 'colonia', label: 'Colonia', hint: 'Colonia, fraccionamiento o barrio del inmueble.' },
  { field: 'cuentaPredial', label: 'Cuenta predial', hint: 'Número de cuenta predial.' },
  { field: 'claveCatastral', label: 'Clave catastral', hint: 'Clave catastral del predio.' },
  { field: 'numeroEscritura', label: 'Número de escritura pública', hint: 'Número de la escritura o instrumento notarial; si aparece, incluye volumen o libro.' },
  { field: 'numeroNotario', label: 'Número de notario', hint: 'Número de la notaría y su residencia; incluye el nombre del notario solo si es visible.' },
  { field: 'fojaRegistral', label: 'Foja registral', hint: 'Folio real, foja, partida, tomo o libro de inscripción en el Registro Público.' },
  { field: 'registroPublico', label: 'Registro Público / libertad de gravamen', hint: 'Datos de inscripción en el Registro Público de la Propiedad o resultado del certificado de libertad de gravamen.' },
  { field: 'medidasSegun', label: 'Medidas y colindancias según', hint: 'Documento del que se toman las medidas, por ejemplo: "Escritura pública 1234".' },
  { field: 'datosEscritura', label: 'Datos según escritura', hint: 'Descripción del inmueble tal como la consigna la escritura: lote, manzana, fraccionamiento, superficie.' },
  { field: 'medidasColindancias', label: 'Medidas y colindancias', hint: 'Cada lindero con orientación, medida y colindante, separados por punto y coma. Si el colindante es una persona cuyo nombre está tapado, escribe "propiedad particular".' },
  { field: 'superficieTerreno', label: 'Superficie del terreno (m²)', numeric: true, hint: 'Superficie total del terreno en metros cuadrados.' },
  { field: 'superficieConstruccion', label: 'Superficie construcción (m²)', numeric: true, hint: 'Superficie construida total en metros cuadrados.' },
  { field: 'areaPrivativa', label: 'Área privativa (m²)', numeric: true, hint: 'Área privativa en régimen de condominio, en metros cuadrados.' },
  { field: 'areaComun1', label: 'Área común 1 (m²)', numeric: true, hint: 'Primera área común en condominio, en metros cuadrados.' },
  { field: 'areaComun2', label: 'Área común 2 (m²)', numeric: true, hint: 'Segunda área común en condominio, en metros cuadrados.' },
  { field: 'indiviso', label: 'Indiviso (%)', numeric: true, hint: 'Porcentaje de indiviso, como número de 0 a 100.' },
  { field: 'valorCatastral', label: 'Valor catastral', numeric: true, hint: 'Valor catastral total en pesos.' },
  { field: 'usoSueloPot', label: 'Uso de suelo según P.O.T.', hint: 'Uso de suelo o zonificación asignada.' },
  { field: 'densidadHabitacional', label: 'Densidad habitacional permitida', hint: 'Densidad permitida (viviendas por hectárea, COS, CUS u otra).' },
  { field: 'anchoCalle', label: 'Ancho de calle (m)', numeric: true, hint: 'Ancho de la calle frente al inmueble, en metros.' },
  { field: 'niveles', label: 'Número de niveles', numeric: true, hint: 'Número de niveles o pisos construidos.' },
  { field: 'usoActual', label: 'Uso actual', hint: 'Uso actual o autorizado del inmueble.' },
  { field: 'topografia', label: 'Topografía y configuración', hint: 'Forma y topografía del terreno si el documento la describe.' }
];
const FIELDS_BY_KEY = new Map(EXTRACTION_FIELDS.map(item => [item.field, item]));

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['tipo_documento', 'datos', 'observaciones'],
  properties: {
    tipo_documento: { type: 'string' },
    datos: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['campo', 'valor', 'cita', 'pagina'],
        properties: {
          campo: { type: 'string', enum: EXTRACTION_FIELDS.map(item => item.field) },
          valor: { type: 'string' },
          cita: { type: 'string' },
          pagina: { type: 'integer' }
        }
      }
    },
    observaciones: { type: 'string' }
  }
};

const SYSTEM_PROMPT = `Eres un asistente que apoya a un perito valuador inmobiliario en México. Lees documentos del inmueble (escrituras, boletas prediales, certificados de libertad de gravamen, constancias de uso de suelo o alineamiento, licencias y planos) y extraes los datos que se usarán en el formato de avalúo.

El valuador revisará cada dato antes de usarlo, y un dato equivocado puede afectar un dictamen con responsabilidad profesional. Por eso:
- Extrae solo lo que el documento dice expresamente. Si un dato no aparece, es ilegible o está tapado, no lo incluyas; no lo deduzcas ni lo completes.
- En "cita" copia literalmente el fragmento del documento que respalda el dato, tal como está escrito (unas pocas palabras a dos renglones), sin corregir ortografía ni abreviaturas.
- En "pagina" indica el número de página del archivo recibido (la primera página es 1).
- En los campos numéricos escribe solo el número con punto decimal, sin separadores de miles, unidades ni signos (por ejemplo 250.75). Si el documento expresa la cantidad con letra, conviértela a número.
- Si el documento tiene datos personales tapados, respétalo: no intentes reconstruirlos.
- En "tipo_documento" describe brevemente el documento (por ejemplo "Escritura pública de compraventa" o "Boleta de impuesto predial").
- En "observaciones" anota discrepancias entre páginas, datos dudosos o advertencias útiles para el valuador; deja la cadena vacía si no hay.`;

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function parsePageSelection(selection, pageCount) {
  const text = String(selection || '').trim();
  if (!text || /^todas?$/i.test(text)) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const pages = new Set();
  for (const part of text.split(/[,;\s]+/).filter(Boolean)) {
    const range = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!range) throw httpError(400, `No se entiende la selección de páginas "${part}". Use por ejemplo: 1-3, 5.`);
    const start = Number(range[1]);
    const end = Number(range[2] || range[1]);
    if (start < 1 || end < start || end > pageCount) throw httpError(400, `La selección "${part}" está fuera del documento, que tiene ${pageCount} página(s).`);
    for (let page = start; page <= end; page += 1) pages.add(page);
  }
  return [...pages].sort((a, b) => a - b);
}

async function loadPdf(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw httpError(400, 'El archivo está vacío o no se recibió correctamente.');
  if (buffer.length > MAX_PDF_BYTES) throw httpError(413, `El PDF debe pesar ${Math.round(MAX_PDF_BYTES / 1024 / 1024)} MB o menos.`);
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') throw httpError(415, 'El archivo no es un PDF válido.');
  try {
    return await PDFDocument.load(buffer, { ignoreEncryption: true });
  } catch {
    throw httpError(422, 'No se pudo leer el PDF; puede estar dañado o protegido.');
  }
}

async function extractPageTexts(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.pages.map(page => String(page.text || ''));
  } catch {
    return [];
  } finally {
    await parser.destroy();
  }
}

function hasTextLayer(pageTexts) {
  const characters = pageTexts.reduce((sum, text) => sum + text.replace(/\s/g, '').length, 0);
  return pageTexts.length > 0 && characters / pageTexts.length >= 40;
}

// Para no procesar documentos grandes completos, la capa de texto se revisa en las primeras páginas.
async function getPdfInfo(buffer) {
  const pdf = await loadPdf(buffer);
  const pageCount = pdf.getPageCount();
  const samplePages = Array.from({ length: Math.min(pageCount, TEXT_LAYER_SAMPLE_PAGES) }, (_, index) => index + 1);
  const sample = await selectPages(buffer, pdf, samplePages);
  return {
    pageCount,
    sizeMb: Number((buffer.length / 1024 / 1024).toFixed(1)),
    hasTextLayer: hasTextLayer(await extractPageTexts(sample))
  };
}

async function selectPages(buffer, pdf, pages) {
  if (pages.length === pdf.getPageCount()) return buffer;
  const subset = await PDFDocument.create();
  const copied = await subset.copyPages(pdf, pages.map(page => page - 1));
  copied.forEach(page => subset.addPage(page));
  return Buffer.from(await subset.save());
}

function normalizeForMatch(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
}

// Comprueba que la cita exista en el texto del PDF: primero en la página indicada y luego en cualquiera.
function verifyQuote(quote, pageText, allTexts, textLayer) {
  if (!textLayer) return 'sin_texto';
  const normalizedQuote = normalizeForMatch(quote);
  if (normalizedQuote.length < 3) return 'no_encontrada';
  if (normalizeForMatch(pageText).includes(normalizedQuote)) return 'verificada';
  return allTexts.some(text => normalizeForMatch(text).includes(normalizedQuote)) ? 'verificada_otra_pagina' : 'no_encontrada';
}

function normalizeNumericValue(value) {
  const cleaned = String(value).replace(/[\s$,]/g, '').replace(/(m2|m²|mts?|%)$/i, '');
  return /^\d+(\.\d+)?$/.test(cleaned) ? cleaned : null;
}

function readOutput(response) {
  if (response.stop_reason === 'refusal') {
    throw httpError(422, 'El servicio de IA no procesó este documento. Revise que el archivo corresponda a un documento del inmueble.');
  }
  if (response.stop_reason === 'max_tokens') {
    throw httpError(422, 'La respuesta quedó incompleta; seleccione menos páginas e intente de nuevo.');
  }
  const text = response.content.filter(block => block.type === 'text').map(block => block.text).join('');
  try {
    return JSON.parse(text);
  } catch {
    throw httpError(502, 'El servicio de IA devolvió una respuesta que no se pudo interpretar.');
  }
}

function describeApiError(error) {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return httpError(503, 'La clave de la API de Anthropic no es válida o no tiene permisos. Revise la variable ANTHROPIC_API_KEY.');
  }
  if (error instanceof Anthropic.RateLimitError) return httpError(429, 'Se alcanzó el límite de solicitudes del servicio de IA; espere un momento e intente de nuevo.');
  if (error instanceof Anthropic.BadRequestError) return httpError(400, `El servicio de IA rechazó la solicitud: ${error.message}`);
  if (error instanceof Anthropic.APIConnectionError) return httpError(502, 'No hubo conexión con el servicio de IA; verifique el acceso a internet.');
  if (error instanceof Anthropic.APIError) return httpError(502, `El servicio de IA respondió con un error (${error.status ?? 'sin estado'}).`);
  return error;
}

function createDocumentExtractor({ client } = {}) {
  let anthropic = client;
  const getClient = () => {
    if (anthropic) return anthropic;
    if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
      throw httpError(503, 'Falta configurar la clave de la API de Anthropic (variable de entorno ANTHROPIC_API_KEY) en el equipo donde corre el servidor.');
    }
    anthropic = new Anthropic();
    return anthropic;
  };

  async function extract({ buffer, fileName, pages: pageSelection }) {
    const pdf = await loadPdf(buffer);
    const pageCount = pdf.getPageCount();
    const pages = parsePageSelection(pageSelection, pageCount);
    if (pages.length > MAX_PAGES_PER_REQUEST) {
      throw httpError(400, `Seleccione como máximo ${MAX_PAGES_PER_REQUEST} páginas por extracción; el documento tiene ${pageCount}.`);
    }
    const subset = await selectPages(buffer, pdf, pages);
    if (subset.length > MAX_SENT_PDF_BYTES) {
      const averagePageMb = subset.length / pages.length / 1024 / 1024;
      const suggestedPages = Math.max(1, Math.floor(MAX_SENT_PDF_BYTES / 1024 / 1024 / averagePageMb));
      throw httpError(413, `Las ${pages.length} página(s) seleccionadas pesan ${(subset.length / 1024 / 1024).toFixed(1)} MB y el servicio de IA admite unos ${Math.round(MAX_SENT_PDF_BYTES / 1024 / 1024)} MB por envío. Seleccione alrededor de ${suggestedPages} página(s) por vez; puede repetir la extracción con otras páginas.`);
    }
    const pageTexts = await extractPageTexts(subset);
    const textLayer = hasTextLayer(pageTexts);
    const safeName = path.basename(String(fileName || 'documento.pdf'));

    let response;
    try {
      response = await getClient().beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: {
          effort: 'medium',
          format: { type: 'json_schema', schema: OUTPUT_SCHEMA }
        },
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              title: safeName,
              source: { type: 'base64', media_type: 'application/pdf', data: subset.toString('base64') }
            },
            {
              type: 'text',
              text: `Extrae del documento los datos que correspondan a estos campos del formato de avalúo. Incluye solo los campos que el documento respalde:\n\n${EXTRACTION_FIELDS.map(item => `- ${item.field} (${item.label}): ${item.hint}`).join('\n')}`
            }
          ]
        }]
      });
    } catch (error) {
      throw describeApiError(error);
    }

    const output = readOutput(response);
    const matches = (Array.isArray(output.datos) ? output.datos : [])
      .map(item => {
        const definition = FIELDS_BY_KEY.get(item.campo);
        if (!definition) return null;
        const sentPage = Number.isInteger(item.pagina) && item.pagina >= 1 && item.pagina <= pages.length ? item.pagina : null;
        const value = definition.numeric ? normalizeNumericValue(item.valor) : String(item.valor || '').trim();
        if (!value) return null;
        return {
          field: definition.field,
          label: definition.label,
          value,
          quote: String(item.cita || '').trim(),
          page: sentPage ? pages[sentPage - 1] : null,
          verification: verifyQuote(item.cita, sentPage ? pageTexts[sentPage - 1] : '', pageTexts, textLayer)
        };
      })
      .filter(Boolean);

    return {
      fileName: safeName,
      pageCount,
      pagesSent: pages,
      hasTextLayer: textLayer,
      documentType: String(output.tipo_documento || '').trim(),
      observations: String(output.observaciones || '').trim(),
      model: response.model,
      matches
    };
  }

  return { extract, getPdfInfo };
}

module.exports = { createDocumentExtractor, parsePageSelection, verifyQuote, normalizeNumericValue, EXTRACTION_FIELDS, MAX_PDF_BYTES };
