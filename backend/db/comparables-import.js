// Importación masiva de comparables desde .xlsx o .csv al banco de comparables.
const readXlsx = (mod => mod.default || mod)(require('read-excel-file/node'));

const MAX_ROWS = 5000;

// Encabezados de la plantilla y otras formas comunes de escribirlos (se comparan sin acentos ni mayúsculas).
const TEMPLATE_HEADERS = ['Tipo de comparable', 'Tipo de inmueble', 'Tipo de dato', 'Fecha del dato', 'Dirección', 'Colonia', 'Municipio', 'Estado',
  'Latitud', 'Longitud', 'Precio', 'Superficie (m2)', 'Superficie de terreno (m2)', 'Edad (años)', 'Fuente', 'Notas'];
const HEADER_ALIASES = {
  categoria: ['tipo de comparable', 'categoria', 'comparable', 'clase de comparable'],
  tipoInmueble: ['tipo de inmueble', 'inmueble', 'tipo inmueble', 'tipo de propiedad'],
  tipoDato: ['tipo de dato', 'dato', 'operacion', 'tipo de operacion'],
  fechaDato: ['fecha del dato', 'fecha', 'fecha de publicacion', 'fecha de consulta'],
  direccion: ['direccion', 'ubicacion', 'domicilio', 'calle', 'calle y numero'],
  colonia: ['colonia', 'fraccionamiento', 'barrio'],
  municipio: ['municipio', 'alcaldia', 'ciudad'],
  estado: ['estado', 'entidad', 'entidad federativa'],
  latitud: ['latitud', 'lat'],
  longitud: ['longitud', 'lon', 'lng', 'long'],
  precio: ['precio', 'precio de venta', 'precio de oferta', 'renta mensual', 'renta', 'valor', 'importe'],
  superficie: ['superficie', 'superficie construida', 'superficie rentable', 'm2', 'metros', 'area', 'area construida'],
  superficieTerreno: ['superficie de terreno', 'terreno', 'area de terreno'],
  edad: ['edad', 'antiguedad', 'edad del inmueble'],
  fuente: ['fuente', 'enlace', 'url', 'portal', 'link', 'liga'],
  notas: ['notas', 'observaciones', 'comentarios']
};

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeHeader(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ALIAS_LOOKUP = new Map(Object.entries(HEADER_ALIASES).flatMap(([field, aliases]) => aliases.map(alias => [alias, field])));

function category(value, fallback) {
  const normalized = normalizeHeader(value);
  if (!normalized) return fallback;
  if (normalized.startsWith('constr') || ['venta', 'casa', 'departamento', 'edificado'].includes(normalized)) return 'construccion';
  if (normalized.startsWith('terr') || normalized === 'lote') return 'terreno';
  if (normalized.startsWith('rent') || normalized.startsWith('arrend')) return 'renta';
  return normalized;
}

// Números con formato mexicano: $1,250,000.50 · 1250000 · 125.5 m2. Una coma sola con 1-2 decimales se toma como decimal.
function parseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let text = String(value ?? '').replace(/[$\s]|m2|m²|mxn|pesos/gi, '');
  if (!text) return null;
  if (text.includes(',') && text.includes('.')) text = text.replace(/,/g, '');
  else if (/^-?\d{1,3}(,\d{3})+$/.test(text)) text = text.replace(/,/g, '');
  else if (/^-?\d+,\d{1,2}$/.test(text)) text = text.replace(',', '.');
  const number = Number(text);
  return Number.isFinite(number) ? number : NaN;
}

function isoDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

// Fechas de Excel (Date o número de serie), dd/mm/aaaa, dd-mm-aaaa o aaaa-mm-dd.
function parseDate(value) {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  if (typeof value === 'number' && value > 20000 && value < 80000) return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10);
  const text = String(value).trim();
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return isoDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (match) {
    const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
    return isoDate(year, Number(match[2]), Number(match[1]));
  }
  return null;
}

// --- CSV: detecta separador (coma, punto y coma o tabulador) y codificación (UTF-8 o la de Excel en Windows) ---
function decodeCsv(buffer) {
  let text = buffer.toString('utf8');
  if (text.includes('�')) text = buffer.toString('latin1');
  return text.replace(/^﻿/, '');
}

function parseCsv(text) {
  const firstLine = text.split(/\r?\n/, 1)[0];
  const delimiter = [';', '\t', ','].reduce((best, candidate) => (firstLine.split(candidate).length > firstLine.split(best).length ? candidate : best), ',');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const character = text[i];
    if (quoted) {
      if (character === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') {
      quoted = true;
    } else if (character === delimiter) {
      row.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function readRows(buffer, fileName) {
  const extension = String(fileName || '').toLowerCase().split('.').pop();
  if (extension === 'csv' || extension === 'txt') return parseCsv(decodeCsv(buffer));
  if (extension === 'xlsx') {
    let sheets;
    try {
      sheets = await readXlsx(buffer);
    } catch {
      throw httpError(422, 'No se pudo leer el archivo de Excel. Guárdelo como .xlsx (Libro de Excel) e intente de nuevo.');
    }
    const sheet = sheets.find(item => normalizeHeader(item.sheet) === 'comparables') || sheets[0];
    return sheet ? sheet.data : [];
  }
  if (extension === 'xls') throw httpError(415, 'El formato .xls (Excel 97-2003) no se admite; en Excel use "Guardar como" > "Libro de Excel (.xlsx)" o CSV.');
  throw httpError(415, 'Seleccione un archivo .xlsx o .csv.');
}

const isEmptyCell = value => value === null || value === undefined || String(value).trim() === '';

// Lee el archivo, valida cada fila y, si `commit`, importa las válidas (no duplicadas) en una sola transacción.
async function importComparables(bank, { buffer, fileName, defaultCategory = 'construccion', commit = false }) {
  const rows = (await readRows(buffer, fileName)).filter(row => Array.isArray(row) && row.some(cell => !isEmptyCell(cell)));
  if (rows.length < 2) throw httpError(422, 'El archivo no tiene filas de datos debajo de los encabezados.');
  if (rows.length - 1 > MAX_ROWS) throw httpError(413, `El archivo tiene ${rows.length - 1} filas; importe como máximo ${MAX_ROWS} por vez.`);

  const headers = rows[0].map(cell => ALIAS_LOOKUP.get(normalizeHeader(cell)) || null);
  const recognized = [...new Set(headers.filter(Boolean))];
  if (!recognized.includes('precio') || !recognized.includes('superficie')) {
    throw httpError(422, `No se encontraron las columnas de precio y superficie. Use la plantilla; columnas reconocidas: ${recognized.join(', ') || 'ninguna'}.`);
  }
  const ignoredColumns = rows[0].filter((cell, index) => !headers[index] && !isEmptyCell(cell)).map(String);

  const existingKeys = new Set(bank.duplicateKeys());
  const seenKeys = new Set();
  const valid = [];
  const errors = [];
  const duplicates = [];

  rows.slice(1).forEach((cells, offset) => {
    const rowNumber = offset + 2;
    const raw = {};
    headers.forEach((field, index) => { if (field && raw[field] === undefined) raw[field] = cells[index]; });
    const problems = [];
    const input = {
      categoria: category(raw.categoria, defaultCategory),
      tipoInmueble: isEmptyCell(raw.tipoInmueble) ? '' : String(raw.tipoInmueble).trim(),
      tipoDato: isEmptyCell(raw.tipoDato) ? '' : String(raw.tipoDato).trim(),
      direccion: isEmptyCell(raw.direccion) ? '' : String(raw.direccion).trim(),
      colonia: isEmptyCell(raw.colonia) ? '' : String(raw.colonia).trim(),
      municipio: isEmptyCell(raw.municipio) ? '' : String(raw.municipio).trim(),
      estado: isEmptyCell(raw.estado) ? '' : String(raw.estado).trim(),
      fuente: isEmptyCell(raw.fuente) ? '' : String(raw.fuente).trim(),
      notas: isEmptyCell(raw.notas) ? '' : String(raw.notas).trim()
    };
    [['precio', 'el precio'], ['superficie', 'la superficie'], ['superficieTerreno', 'la superficie de terreno'], ['edad', 'la edad'], ['latitud', 'la latitud'], ['longitud', 'la longitud']].forEach(([field, label]) => {
      if (isEmptyCell(raw[field])) return;
      const number = parseNumber(raw[field]);
      if (Number.isNaN(number)) problems.push(`no se entiende ${label} ("${raw[field]}")`);
      else input[field] = number;
    });
    const date = parseDate(raw.fechaDato);
    if (date === null) problems.push(`fecha no reconocida ("${raw.fechaDato}"); use dd/mm/aaaa`);
    else if (date) input.fechaDato = date;
    if (!['construccion', 'terreno', 'renta'].includes(input.categoria)) problems.push(`tipo de comparable "${raw.categoria}" no reconocido (use construcción, terreno o renta)`);

    let record;
    if (!problems.length) {
      try {
        record = bank.validate(input);
      } catch (error) {
        problems.push(error.message.replace(/\.$/, '').toLocaleLowerCase('es-MX'));
      }
    }
    if (problems.length) {
      errors.push({ fila: rowNumber, problemas: problems });
      return;
    }
    const key = bank.duplicateKey(record);
    if (existingKeys.has(key) || seenKeys.has(key)) {
      duplicates.push({ fila: rowNumber, direccion: record.direccion || '', motivo: existingKeys.has(key) ? 'ya está en el banco' : 'repetido en el archivo' });
      return;
    }
    seenKeys.add(key);
    valid.push({ fila: rowNumber, input, record });
  });

  const imported = commit && valid.length ? bank.createMany(valid.map(item => item.input)) : 0;
  return {
    archivo: fileName,
    filas: rows.length - 1,
    columnasReconocidas: recognized,
    columnasIgnoradas: ignoredColumns,
    validos: valid.length,
    errores: errors,
    duplicados: duplicates,
    muestra: valid.slice(0, 15).map(({ fila, record }) => ({ fila, ...record })),
    importados: imported
  };
}

function templateCsv() {
  const example = [
    ['construccion', 'Casa habitación', 'Oferta', '20/09/2026', 'Av. Reforma 500', 'La Paz', 'Puebla', 'Puebla', '19.0566', '-98.2251', '2500000', '125', '160', '12', 'https://portal.ejemplo/anuncio/123', 'Captura del anuncio guardada'],
    ['terreno', '', 'Venta', '15/08/2026', 'Lote 5, manzana 3', 'Lomas de Angelópolis', 'San Andrés Cholula', 'Puebla', '', '', '900000', '200', '', '', 'Notaría 15', ''],
    ['renta', 'Local comercial', 'Oferta de renta', '01/10/2026', 'Calle 5 Sur 300', 'Centro', 'Puebla', 'Puebla', '', '', '18000', '80', '', '', 'Inmobiliaria XYZ', 'Incluye mantenimiento']
  ];
  const quote = value => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  return '﻿' + [TEMPLATE_HEADERS, ...example].map(row => row.map(quote).join(',')).join('\r\n') + '\r\n';
}

module.exports = { importComparables, templateCsv, parseNumber, parseDate, parseCsv, normalizeHeader, MAX_ROWS };
