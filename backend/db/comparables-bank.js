// Banco de comparables: reúne los comparables de todos los avalúos guardados y los capturados directamente.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CATEGORIES = { construction: 'construccion', land: 'terreno', rent: 'renta' };
const CATEGORY_VALUES = Object.values(CATEGORIES);
const FILE_URL = /^\/api\/archivos\/(\d+)$/;
const UPLOAD_URL = /^\/api\/cargas\/(\d+)$/;
const BANK_FILE_URL = /^\/api\/banco-archivos\/(\d+)$/;
const EVIDENCE_TYPES = /^(image\/(png|jpeg|gif|webp|bmp)|application\/pdf)$/;

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

const text = value => (typeof value === 'string' ? value.trim() : '');

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function coordinate(value, limit) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= limit && number !== 0 ? number : null;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

// Evidencia: { name, type, size, url } de una captura de pantalla, imagen o PDF de la fuente del dato.
function evidenceList(items, allowed = [FILE_URL]) {
  return (Array.isArray(items) ? items : [])
    .map(item => ({ name: text(item?.name) || 'evidencia', type: text(item?.type), size: Number(item?.size) || 0, url: text(item?.url) }))
    .filter(item => allowed.some(pattern => pattern.test(item.url)));
}

// Convierte los comparables de la captura de un avalúo en registros del banco.
function extractFromAvaluo(avaluoId, datos) {
  const fields = datos?.fields || {};
  const cards = { construction: {}, land: {}, rent: {} };
  (datos?.constructionComparables || []).forEach(({ index, field, value }) => {
    (cards.construction[index] ||= {})[field] = value;
  });
  (datos?.marketComparables || []).forEach(({ group, index, field, value }) => {
    if (cards[group]) (cards[group][index] ||= {})[field] = value;
  });
  const subjectLatitude = coordinate(fields.latitud, 90);
  const subjectLongitude = coordinate(fields.longitud, 180);

  const records = [];
  Object.entries(cards).forEach(([group, byIndex]) => {
    Object.entries(byIndex).forEach(([index, card]) => {
      // Tarjeta traída del banco: ese comparable ya está en el banco y no se vuelve a agregar.
      if (Number.isInteger(Number(card.bancoId)) && Number(card.bancoId) > 0) return;
      const price = positive(group === 'construction' ? card.salePrice : card.price);
      const surface = positive(card.surface);
      if (!price || !surface) return;
      const latitude = coordinate(card.latitud, 90);
      const longitude = coordinate(card.longitud, 180);
      const ownLocation = latitude !== null && longitude !== null;
      const subjectLocated = subjectLatitude !== null && subjectLongitude !== null;
      records.push({
        origen_clave: `${avaluoId}:${group}:${index}`,
        categoria: CATEGORIES[group],
        // Tipo de inmueble y zona propios del comparable; si la tarjeta los deja vacíos, los del inmueble valuado.
        tipo_inmueble: group === 'land' ? 'Terreno' : text(card.tipoInmueble) || text(fields.tipoInmueble) || null,
        tipo_dato: text(card.tipoDato) || null,
        direccion: text(card.address) || null,
        colonia: text(card.colonia) || text(fields.colonia) || null,
        municipio: text(card.municipio) || text(fields.municipio) || null,
        estado: text(card.estado) || text(fields.estado) || null,
        notas: text(card.notas) || null,
        latitud: ownLocation ? latitude : (subjectLocated ? subjectLatitude : null),
        longitud: ownLocation ? longitude : (subjectLocated ? subjectLongitude : null),
        ubicacion_aproximada: !ownLocation && subjectLocated ? 1 : 0,
        precio: price,
        superficie: surface,
        superficie_terreno: group === 'construction' ? positive(card.superficieTerreno) : null,
        edad: group === 'construction' && card.edad !== '' && Number.isFinite(Number(card.edad)) ? Number(card.edad) : null,
        valor_unitario: round2(price / surface),
        fecha_dato: text(card.fechaDato) || text(fields.fechaAvaluo) || new Date().toISOString().slice(0, 10),
        fuente: text(card.fuente) || null,
        fotos: JSON.stringify((datos?.comparablePhotos?.[group]?.[index] || []).map(photo => photo?.preview).filter(url => FILE_URL.test(url || ''))),
        evidencias: JSON.stringify(evidenceList(datos?.comparableEvidence?.[group]?.[index]))
      });
    });
  });
  return records;
}

const COLUMNS = ['categoria', 'tipo_inmueble', 'tipo_dato', 'direccion', 'colonia', 'municipio', 'estado', 'latitud', 'longitud',
  'ubicacion_aproximada', 'precio', 'superficie', 'superficie_terreno', 'edad', 'valor_unitario', 'fecha_dato', 'fuente', 'notas', 'fotos', 'evidencias'];

function createComparablesBank(db, { filesDir }) {
  // Migración: columna de evidencias para bancos creados antes de esta función.
  const columns = db.prepare('PRAGMA table_info(banco_comparables)').all().map(column => column.name);
  if (!columns.includes('evidencias')) db.exec("ALTER TABLE banco_comparables ADD COLUMN evidencias TEXT NOT NULL DEFAULT '[]'");
  const bankDir = path.join(filesDir, 'banco');
  fs.mkdirSync(bankDir, { recursive: true });

  // --- Archivos propios del banco ---
  function storeBankFile(comparableId, { sourcePath, mimeType, bytes, name, move }) {
    const relativePath = path.posix.join('banco', `${crypto.randomUUID()}${path.extname(sourcePath).toLowerCase()}`);
    const target = path.join(filesDir, relativePath);
    if (move) fs.renameSync(sourcePath, target);
    else fs.copyFileSync(sourcePath, target);
    const id = Number(db.prepare('INSERT INTO banco_archivos (comparable_id, nombre, tipo_mime, ruta, bytes) VALUES (?, ?, ?, ?, ?)').run(comparableId, name || null, mimeType, relativePath, bytes).lastInsertRowid);
    return `/api/banco-archivos/${id}`;
  }

  // Una subida directa (/api/cargas) pasa a ser archivo del banco.
  function claimUpload(comparableId, item) {
    const upload = db.prepare('SELECT id, tipo_mime, ruta, bytes FROM cargas WHERE id = ?').get(Number(item.url.match(UPLOAD_URL)[1]));
    if (!upload) return null;
    if (!EVIDENCE_TYPES.test(upload.tipo_mime)) throw httpError(415, `La evidencia "${item.name}" debe ser una imagen o un PDF.`);
    const url = storeBankFile(comparableId, { sourcePath: path.join(filesDir, upload.ruta), mimeType: upload.tipo_mime, bytes: upload.bytes, name: item.name, move: true });
    db.prepare('DELETE FROM cargas WHERE id = ?').run(upload.id);
    return { ...item, type: upload.tipo_mime, size: upload.bytes, url };
  }

  // Copia un archivo de un avalúo al banco (al eliminar el avalúo, sus evidencias y fotos se conservan aquí).
  function copyAvaluoFile(comparableId, url, name) {
    const file = db.prepare('SELECT tipo_mime, ruta, bytes FROM archivos WHERE id = ?').get(Number(url.match(FILE_URL)[1]));
    if (!file) return null;
    try {
      return storeBankFile(comparableId, { sourcePath: path.join(filesDir, file.ruta), mimeType: file.tipo_mime, bytes: file.bytes, name, move: false });
    } catch {
      return null;
    }
  }

  function removeBankFiles(comparableId, keepUrls = []) {
    const keep = new Set(keepUrls);
    db.prepare('SELECT id, ruta FROM banco_archivos WHERE comparable_id = ?').all(comparableId).forEach(file => {
      if (keep.has(`/api/banco-archivos/${file.id}`)) return;
      db.prepare('DELETE FROM banco_archivos WHERE id = ?').run(file.id);
      fs.rmSync(path.join(filesDir, file.ruta), { force: true });
    });
  }

  function getFile(id) {
    const file = db.prepare('SELECT tipo_mime, ruta FROM banco_archivos WHERE id = ?').get(Number(id));
    return file ? { mimeType: file.tipo_mime, path: path.join(filesDir, file.ruta) } : null;
  }

  // Se llama dentro de la transacción del guardado del avalúo.
  function syncFromAvaluo(avaluoId, datos) {
    const records = extractFromAvaluo(avaluoId, datos);
    const existing = new Map(db.prepare('SELECT id, origen_clave, editado, excluido FROM banco_comparables WHERE origen_avaluo_id = ?').all(avaluoId).map(row => [row.origen_clave, row]));
    const insert = db.prepare(`INSERT INTO banco_comparables (${COLUMNS.join(', ')}, origen_avaluo_id, origen_clave) VALUES (${COLUMNS.map(() => '?').join(', ')}, ?, ?)`);
    const update = db.prepare(`UPDATE banco_comparables SET ${COLUMNS.map(column => `${column} = ?`).join(', ')}, actualizado_en = datetime('now') WHERE id = ?`);
    records.forEach(record => {
      const values = COLUMNS.map(column => record[column]);
      const row = existing.get(record.origen_clave);
      existing.delete(record.origen_clave);
      // Lo que el valuador editó o quitó en el banco no se sobrescribe ni se vuelve a agregar.
      if (row?.editado || row?.excluido) return;
      if (row) update.run(...values, row.id);
      else insert.run(...values, avaluoId, record.origen_clave);
    });
    // Tarjetas que se vaciaron en el avalúo: su comparable sale del banco (salvo que se haya editado ahí).
    const remove = db.prepare('DELETE FROM banco_comparables WHERE id = ?');
    existing.forEach(row => { if (!row.editado && !row.excluido) remove.run(row.id); });
  }

  // Al eliminar un avalúo sus comparables se conservan, con copia propia de sus fotos y evidencias.
  // Se llama antes de borrar los archivos del avalúo.
  function detachAvaluo(avaluoId) {
    db.prepare('SELECT id, fotos, evidencias FROM banco_comparables WHERE origen_avaluo_id = ?').all(avaluoId).forEach(row => {
      const photos = JSON.parse(row.fotos || '[]').map(url => (FILE_URL.test(url) ? copyAvaluoFile(row.id, url, 'foto') : url)).filter(Boolean);
      const evidences = JSON.parse(row.evidencias || '[]').map(item => {
        if (!FILE_URL.test(item.url)) return item;
        const url = copyAvaluoFile(row.id, item.url, item.name);
        return url ? { ...item, url } : null;
      }).filter(Boolean);
      db.prepare('UPDATE banco_comparables SET origen_avaluo_id = NULL, fotos = ?, evidencias = ? WHERE id = ?').run(JSON.stringify(photos), JSON.stringify(evidences), row.id);
    });
  }

  function parse(row) {
    return {
      ...row,
      fotos: JSON.parse(row.fotos || '[]'),
      evidencias: JSON.parse(row.evidencias || '[]'),
      ubicacion_aproximada: Boolean(row.ubicacion_aproximada),
      editado: Boolean(row.editado)
    };
  }

  function list({ categoria, tipo, municipio, q } = {}) {
    const conditions = ['excluido = 0'];
    const params = [];
    if (categoria) { conditions.push('categoria = ?'); params.push(categoria); }
    if (tipo) { conditions.push('tipo_inmueble = ?'); params.push(tipo); }
    if (municipio) { conditions.push('municipio = ?'); params.push(municipio); }
    if (text(q)) {
      conditions.push('(direccion LIKE ? OR colonia LIKE ? OR municipio LIKE ? OR fuente LIKE ? OR notas LIKE ?)');
      params.push(...Array(5).fill(`%${text(q)}%`));
    }
    return db.prepare(`SELECT * FROM banco_comparables WHERE ${conditions.join(' AND ')} ORDER BY fecha_dato DESC, id DESC LIMIT 1000`).all(...params).map(parse);
  }

  function get(id) {
    const row = db.prepare('SELECT * FROM banco_comparables WHERE id = ? AND excluido = 0').get(Number(id));
    return row ? parse(row) : null;
  }

  function normalizeInput(input = {}) {
    const categoria = text(input.categoria);
    if (!CATEGORY_VALUES.includes(categoria)) throw httpError(400, 'Indique si el comparable es de construcción, terreno o renta.');
    const precio = positive(input.precio);
    const superficie = positive(input.superficie);
    if (!precio || !superficie) throw httpError(400, 'El comparable necesita precio y superficie mayores a cero.');
    const latitud = coordinate(input.latitud, 90);
    const longitud = coordinate(input.longitud, 180);
    return {
      categoria,
      tipo_inmueble: categoria === 'terreno' ? 'Terreno' : text(input.tipoInmueble) || null,
      tipo_dato: text(input.tipoDato) || null,
      direccion: text(input.direccion) || null,
      colonia: text(input.colonia) || null,
      municipio: text(input.municipio) || null,
      estado: text(input.estado) || null,
      latitud: latitud !== null && longitud !== null ? latitud : null,
      longitud: latitud !== null && longitud !== null ? longitud : null,
      ubicacion_aproximada: 0,
      precio,
      superficie,
      superficie_terreno: positive(input.superficieTerreno),
      edad: input.edad === '' || input.edad == null || !Number.isFinite(Number(input.edad)) ? null : Number(input.edad),
      valor_unitario: round2(precio / superficie),
      fecha_dato: /^\d{4}-\d{2}-\d{2}$/.test(text(input.fechaDato)) ? text(input.fechaDato) : new Date().toISOString().slice(0, 10),
      fuente: text(input.fuente) || null,
      notas: text(input.notas) || null
    };
  }

  // Evidencias capturadas en el banco: las subidas nuevas se vuelven archivos del banco; se conservan las existentes.
  function storeEvidence(comparableId, items) {
    const allowed = [FILE_URL, UPLOAD_URL, BANK_FILE_URL];
    const evidence = evidenceList(items, allowed);
    // Se revisan todos los tipos antes de mover archivos, para no dejar ninguno a medias si uno no es válido.
    evidence.filter(item => UPLOAD_URL.test(item.url)).forEach(item => {
      const upload = db.prepare('SELECT tipo_mime FROM cargas WHERE id = ?').get(Number(item.url.match(UPLOAD_URL)[1]));
      if (upload && !EVIDENCE_TYPES.test(upload.tipo_mime)) throw httpError(415, `La evidencia "${item.name}" debe ser una imagen o un PDF.`);
    });
    const stored = evidence.map(item => (UPLOAD_URL.test(item.url) ? claimUpload(comparableId, item) : item)).filter(Boolean);
    removeBankFiles(comparableId, stored.map(item => item.url).concat(JSON.parse(db.prepare('SELECT fotos FROM banco_comparables WHERE id = ?').get(comparableId)?.fotos || '[]')));
    db.prepare('UPDATE banco_comparables SET evidencias = ? WHERE id = ?').run(JSON.stringify(stored), comparableId);
  }

  function withTransaction(work) {
    db.exec('BEGIN');
    try {
      const result = work();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function create(input) {
    const record = normalizeInput(input);
    const columns = Object.keys(record);
    const id = withTransaction(() => {
      const newId = Number(db.prepare(`INSERT INTO banco_comparables (${columns.join(', ')}, editado) VALUES (${columns.map(() => '?').join(', ')}, 1)`).run(...columns.map(column => record[column])).lastInsertRowid);
      if (Array.isArray(input.evidencias)) storeEvidence(newId, input.evidencias);
      return newId;
    });
    return get(id);
  }

  function update(id, input) {
    if (!get(id)) throw httpError(404, 'El comparable no existe.');
    const record = normalizeInput(input);
    const columns = Object.keys(record);
    withTransaction(() => {
      db.prepare(`UPDATE banco_comparables SET ${columns.map(column => `${column} = ?`).join(', ')}, editado = 1, actualizado_en = datetime('now') WHERE id = ?`).run(...columns.map(column => record[column]), Number(id));
      if (Array.isArray(input.evidencias)) storeEvidence(Number(id), input.evidencias);
    });
    return get(id);
  }

  // Los que vienen de un avalúo se marcan como excluidos para que el siguiente guardado no los vuelva a agregar.
  function remove(id) {
    const row = db.prepare('SELECT id, origen_clave FROM banco_comparables WHERE id = ? AND excluido = 0').get(Number(id));
    if (!row) return false;
    if (row.origen_clave) {
      db.prepare("UPDATE banco_comparables SET excluido = 1, actualizado_en = datetime('now') WHERE id = ?").run(row.id);
    } else {
      db.prepare('DELETE FROM banco_comparables WHERE id = ?').run(row.id);
      removeBankFiles(row.id);
    }
    return true;
  }

  function isEmpty() {
    return db.prepare('SELECT COUNT(*) AS total FROM banco_comparables').get().total === 0;
  }

  // --- Importación masiva ---
  // Mismo comparable = misma categoría, dirección, precio, superficie y fecha del dato.
  function duplicateKey(record) {
    const address = String(record.direccion || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    return [record.categoria, address, Number(record.precio), Number(record.superficie), record.fecha_dato].join('|');
  }

  function duplicateKeys() {
    return db.prepare('SELECT categoria, direccion, precio, superficie, fecha_dato FROM banco_comparables WHERE excluido = 0').all().map(duplicateKey);
  }

  function createMany(inputs) {
    return withTransaction(() => {
      inputs.forEach(input => {
        const record = normalizeInput(input);
        const columns = Object.keys(record);
        db.prepare(`INSERT INTO banco_comparables (${columns.join(', ')}, editado) VALUES (${columns.map(() => '?').join(', ')}, 1)`).run(...columns.map(column => record[column]));
      });
      return inputs.length;
    });
  }

  return {
    syncFromAvaluo, detachAvaluo, list, get, create, update, remove, isEmpty, getFile,
    validate: normalizeInput, duplicateKey, duplicateKeys, createMany
  };
}

module.exports = { createComparablesBank, extractFromAvaluo };
