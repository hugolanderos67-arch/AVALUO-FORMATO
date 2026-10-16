// Banco de comparables: reúne los comparables de todos los avalúos guardados y los capturados directamente.
const CATEGORIES = { construction: 'construccion', land: 'terreno', rent: 'renta' };
const CATEGORY_VALUES = Object.values(CATEGORIES);
const FILE_URL = /^\/api\/archivos\/\d+$/;

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
      const price = positive(group === 'construction' ? card.salePrice : card.price);
      const surface = positive(card.surface);
      if (!price || !surface) return;
      const latitude = coordinate(card.latitud, 90);
      const longitude = coordinate(card.longitud, 180);
      const ownLocation = latitude !== null && longitude !== null;
      records.push({
        origen_clave: `${avaluoId}:${group}:${index}`,
        categoria: CATEGORIES[group],
        tipo_inmueble: group === 'land' ? 'Terreno' : text(fields.tipoInmueble) || null,
        tipo_dato: text(card.tipoDato) || null,
        direccion: text(card.address) || null,
        colonia: text(fields.colonia) || null,
        municipio: text(fields.municipio) || null,
        estado: text(fields.estado) || null,
        latitud: ownLocation ? latitude : (subjectLatitude !== null && subjectLongitude !== null ? subjectLatitude : null),
        longitud: ownLocation ? longitude : (subjectLatitude !== null && subjectLongitude !== null ? subjectLongitude : null),
        ubicacion_aproximada: !ownLocation && subjectLatitude !== null && subjectLongitude !== null ? 1 : 0,
        precio: price,
        superficie: surface,
        superficie_terreno: group === 'construction' ? positive(card.superficieTerreno) : null,
        edad: group === 'construction' && card.edad !== '' && Number.isFinite(Number(card.edad)) ? Number(card.edad) : null,
        valor_unitario: round2(price / surface),
        fecha_dato: text(card.fechaDato) || text(fields.fechaAvaluo) || new Date().toISOString().slice(0, 10),
        fuente: text(card.fuente) || null,
        fotos: JSON.stringify((datos?.comparablePhotos?.[group]?.[index] || []).map(photo => photo?.preview).filter(url => FILE_URL.test(url || '')))
      });
    });
  });
  return records;
}

const COLUMNS = ['categoria', 'tipo_inmueble', 'tipo_dato', 'direccion', 'colonia', 'municipio', 'estado', 'latitud', 'longitud',
  'ubicacion_aproximada', 'precio', 'superficie', 'superficie_terreno', 'edad', 'valor_unitario', 'fecha_dato', 'fuente', 'fotos'];

function createComparablesBank(db) {
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

  // Al eliminar un avalúo sus comparables se conservan; solo pierden las fotos, que se borran con él.
  function detachAvaluo(avaluoId) {
    db.prepare("UPDATE banco_comparables SET origen_avaluo_id = NULL, fotos = '[]' WHERE origen_avaluo_id = ?").run(avaluoId);
  }

  function parse(row) {
    return { ...row, fotos: JSON.parse(row.fotos || '[]'), ubicacion_aproximada: Boolean(row.ubicacion_aproximada), editado: Boolean(row.editado) };
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

  function create(input) {
    const record = normalizeInput(input);
    const columns = Object.keys(record);
    const id = Number(db.prepare(`INSERT INTO banco_comparables (${columns.join(', ')}, editado) VALUES (${columns.map(() => '?').join(', ')}, 1)`).run(...columns.map(column => record[column])).lastInsertRowid);
    return get(id);
  }

  function update(id, input) {
    if (!get(id)) throw httpError(404, 'El comparable no existe.');
    const record = normalizeInput(input);
    const columns = Object.keys(record);
    db.prepare(`UPDATE banco_comparables SET ${columns.map(column => `${column} = ?`).join(', ')}, editado = 1, actualizado_en = datetime('now') WHERE id = ?`).run(...columns.map(column => record[column]), Number(id));
    return get(id);
  }

  // Los que vienen de un avalúo se marcan como excluidos para que el siguiente guardado no los vuelva a agregar.
  function remove(id) {
    const row = db.prepare('SELECT id, origen_clave FROM banco_comparables WHERE id = ? AND excluido = 0').get(Number(id));
    if (!row) return false;
    if (row.origen_clave) db.prepare("UPDATE banco_comparables SET excluido = 1, actualizado_en = datetime('now') WHERE id = ?").run(row.id);
    else db.prepare('DELETE FROM banco_comparables WHERE id = ?').run(row.id);
    return true;
  }

  function isEmpty() {
    return db.prepare('SELECT COUNT(*) AS total FROM banco_comparables').get().total === 0;
  }

  return { syncFromAvaluo, detachAvaluo, list, get, create, update, remove, isEmpty };
}

module.exports = { createComparablesBank, extractFromAvaluo };
