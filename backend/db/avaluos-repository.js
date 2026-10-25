const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const { createComparablesBank } = require('./comparables-bank');

const FILE_EXTENSIONS = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
  'image/svg+xml': '.svg',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx'
};
// Límite para archivos subidos directamente (anexos); los que llegan dentro de la captura (firma, logotipo, comparables) son imágenes pequeñas.
const MAX_UPLOAD_BYTES = (Number(process.env.MAX_UPLOAD_MB) || 200) * 1024 * 1024;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const UPLOAD_MAX_AGE_HOURS = 48;
const VALUER_PROFILE_FIELDS = [
  'valuadorNombre', 'valuadorProfesion', 'valuadorCedula', 'valuadorEspecialidad', 'valuadorCedulaEspecialidad',
  'valuadorRegistro', 'valuadorTelefono', 'valuadorCorreo', 'valuadorDomicilio', 'unidadValuacion',
  'unidadValuacionRegistro', 'controladorNombre', 'controladorRegistro', 'lugarEmision', 'vigenciaAvaluo'
];
const DATA_URL = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]*)$/i;
const FILE_URL = /^\/api\/archivos\/(\d+)$/;
const UPLOAD_URL = /^\/api\/cargas\/(\d+)$/;
const BANK_FILE_URL = /^\/api\/banco-archivos\/(\d+)$/;

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function openDatabase(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new DatabaseSync(filePath);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  // Migración: número de revisión para detectar cambios hechos desde otro dispositivo (app móvil u otra ventana).
  const columns = db.prepare('PRAGMA table_info(avaluos)').all().map(column => column.name);
  if (!columns.includes('revision')) db.exec('ALTER TABLE avaluos ADD COLUMN revision INTEGER NOT NULL DEFAULT 0');
  // Migración: estatus del avalúo (en proceso, concluido o cancelado). La columna "estado" ya es el estado de la República.
  if (!columns.includes('estatus')) {
    db.exec(`ALTER TABLE avaluos ADD COLUMN estatus TEXT NOT NULL DEFAULT 'en_proceso';
      ALTER TABLE avaluos ADD COLUMN estatus_fecha TEXT;
      ALTER TABLE avaluos ADD COLUMN estatus_motivo TEXT;`);
  }
  return db;
}

function createAvaluosRepository({ databasePath, filesDir }) {
  const db = openDatabase(databasePath);
  fs.mkdirSync(filesDir, { recursive: true });
  const bank = createComparablesBank(db, { filesDir });

  function summaryColumns(datos, resumen) {
    const fields = datos?.fields || {};
    const value = Number(resumen?.valorConcluido);
    return {
      folio: text(fields.folioExpediente),
      fecha_avaluo: text(fields.fechaAvaluo),
      tipo_inmueble: text(fields.tipoInmueble),
      solicitante: text(fields.solicitante),
      propietario: text(fields.propietario),
      calle: text(fields.calle),
      colonia: text(fields.colonia),
      municipio: text(fields.municipio),
      estado: text(fields.estado),
      valor_concluido: Number.isFinite(value) && value > 0 ? value : null,
      enfoque_concluido: text(resumen?.enfoque)
    };
  }

  // Sustituye cada archivo de la captura por un archivo en disco del avalúo: data URL (imágenes pequeñas),
  // subidas directas (/api/cargas), archivos de otro avalúo y fotos o evidencias traídas del banco de comparables.
  // Conserva las referencias ya guardadas.
  function storeImages(avaluoId, datos, writtenFiles, movedFiles) {
    const referenced = new Set();
    const insertFile = db.prepare('INSERT INTO archivos (avaluo_id, tipo_mime, ruta, bytes) VALUES (?, ?, ?, ?)');
    const findFile = db.prepare('SELECT id, avaluo_id, tipo_mime, ruta, bytes FROM archivos WHERE id = ?');
    const findUpload = db.prepare('SELECT id, tipo_mime, ruta, bytes FROM cargas WHERE id = ?');
    const findBankFile = db.prepare('SELECT tipo_mime, ruta, bytes FROM banco_archivos WHERE id = ?');
    const deleteUpload = db.prepare('DELETE FROM cargas WHERE id = ?');

    const newFilePath = mimeType => {
      const relativePath = path.posix.join(String(avaluoId), `${crypto.randomUUID()}${FILE_EXTENSIONS[mimeType]}`);
      const absolutePath = path.join(filesDir, relativePath);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      return { relativePath, absolutePath };
    };
    const registerFile = (mimeType, relativePath, bytes) => {
      const fileId = Number(insertFile.run(avaluoId, mimeType, relativePath, bytes).lastInsertRowid);
      referenced.add(fileId);
      return `/api/archivos/${fileId}`;
    };
    const writeFile = (mimeType, buffer) => {
      const { relativePath, absolutePath } = newFilePath(mimeType);
      fs.writeFileSync(absolutePath, buffer);
      writtenFiles.push(absolutePath);
      return registerFile(mimeType, relativePath, buffer.length);
    };
    const copyFile = (mimeType, sourcePath, bytes) => {
      const { relativePath, absolutePath } = newFilePath(mimeType);
      fs.copyFileSync(sourcePath, absolutePath);
      writtenFiles.push(absolutePath);
      return registerFile(mimeType, relativePath, bytes);
    };

    const transform = value => {
      if (Array.isArray(value)) return value.map(transform);
      if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, transform(item)]));
      }
      if (typeof value !== 'string') return value;

      const dataUrl = value.match(DATA_URL);
      if (dataUrl) {
        const mimeType = dataUrl[1].toLowerCase();
        if (!FILE_EXTENSIONS[mimeType]) throw httpError(415, `Tipo de archivo no admitido: ${mimeType}.`);
        const buffer = Buffer.from(dataUrl[2], 'base64');
        if (buffer.length > MAX_FILE_BYTES) throw httpError(413, 'Cada imagen incluida en la captura debe pesar 25 MB o menos.');
        return writeFile(mimeType, buffer);
      }

      const uploadUrl = value.match(UPLOAD_URL);
      if (uploadUrl) {
        // Subida directa: el archivo se mueve a la carpeta del avalúo sin cargarlo en memoria.
        const upload = findUpload.get(Number(uploadUrl[1]));
        if (!upload) return '';
        const { relativePath, absolutePath } = newFilePath(upload.tipo_mime);
        const sourcePath = path.join(filesDir, upload.ruta);
        fs.renameSync(sourcePath, absolutePath);
        movedFiles.push({ from: sourcePath, to: absolutePath });
        deleteUpload.run(upload.id);
        return registerFile(upload.tipo_mime, relativePath, upload.bytes);
      }

      const fileUrl = value.match(FILE_URL);
      if (fileUrl) {
        const file = findFile.get(Number(fileUrl[1]));
        if (!file) return '';
        if (file.avaluo_id === avaluoId) {
          referenced.add(file.id);
          return value;
        }
        // Archivo de otro avalúo: se copia para que ambos sean independientes.
        return copyFile(file.tipo_mime, path.join(filesDir, file.ruta), file.bytes);
      }

      const bankFileUrl = value.match(BANK_FILE_URL);
      if (bankFileUrl) {
        // Foto o evidencia de un comparable del banco: el avalúo guarda su propia copia, que no depende del banco.
        const file = findBankFile.get(Number(bankFileUrl[1]));
        if (!file || !FILE_EXTENSIONS[file.tipo_mime]) return '';
        return copyFile(file.tipo_mime, path.join(filesDir, file.ruta), file.bytes);
      }
      return value;
    };

    return { datos: transform(datos), referenced };
  }

  function removeUnreferencedFiles(avaluoId, referenced) {
    const files = db.prepare('SELECT id, ruta FROM archivos WHERE avaluo_id = ?').all(avaluoId);
    const remove = db.prepare('DELETE FROM archivos WHERE id = ?');
    const obsolete = files.filter(file => !referenced.has(file.id));
    obsolete.forEach(file => remove.run(file.id));
    return obsolete.map(file => path.join(filesDir, file.ruta));
  }

  // `revision`: la que tenía el avalúo cuando se abrió; si cambió desde entonces se rechaza con 409 para no sobrescribir.
  // --- Folios: número de control del avalúo (AV-aaaa-nnn), único y nunca reutilizado ---
  const normalizeFolio = value => text(value).toUpperCase().replace(/\s+/g, ' ');
  const FOLIO_PATTERN = /^AV-(\d{4})-(\d+)$/;

  // Avalúo que ya usa ese folio (cualquier estatus, incluso cancelado), sin contar el avalúo `excludeId`.
  function folioInUse(folio, excludeId = null) {
    const wanted = normalizeFolio(folio);
    if (!wanted) return null;
    return db.prepare('SELECT id, folio, estatus FROM avaluos WHERE folio IS NOT NULL AND folio != \'\'').all()
      .find(row => normalizeFolio(row.folio) === wanted && row.id !== Number(excludeId)) || null;
  }

  // Siguiente consecutivo del año: el mayor AV-aaaa-nnn registrado + 1, contando cancelados para no reutilizar folios.
  function nextFolio(year = new Date().getFullYear()) {
    const wantedYear = /^\d{4}$/.test(String(year)) ? String(year) : String(new Date().getFullYear());
    const highest = db.prepare('SELECT folio FROM avaluos WHERE folio IS NOT NULL').all().reduce((max, row) => {
      const match = FOLIO_PATTERN.exec(normalizeFolio(row.folio));
      return match && match[1] === wantedYear ? Math.max(max, Number(match[2])) : max;
    }, 0);
    return `AV-${wantedYear}-${String(highest + 1).padStart(3, '0')}`;
  }

  const ESTATUS = ['en_proceso', 'concluido', 'cancelado'];

  // Estatus del avalúo. Cancelar exige motivo; el avalúo y su folio se conservan.
  function setStatus(id, { estatus, motivo } = {}) {
    const avaluoId = Number(id);
    if (!db.prepare('SELECT id FROM avaluos WHERE id = ?').get(avaluoId)) throw httpError(404, 'El avalúo no existe.');
    if (!ESTATUS.includes(estatus)) throw httpError(400, 'Estatus no válido: use en proceso, concluido o cancelado.');
    const reason = text(motivo);
    if (estatus === 'cancelado' && !reason) throw httpError(400, 'Indique el motivo de la cancelación.');
    db.prepare(`UPDATE avaluos SET estatus = ?, estatus_fecha = ?, estatus_motivo = ? WHERE id = ?`).run(
      estatus,
      estatus === 'en_proceso' ? null : new Date().toISOString().slice(0, 19).replace('T', ' '),
      estatus === 'cancelado' ? reason : null,
      avaluoId
    );
    const { datos, ...summary } = get(avaluoId);
    return summary;
  }

  // `checkFolio: false` solo para las visitas de campo, que no deben fallar al sincronizar por un folio repetido.
  function save(id, { datos, resumen, revision } = {}, { checkFolio = true } = {}) {
    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) throw httpError(400, 'La captura del avalúo no es válida.');
    if (checkFolio) {
      const duplicate = folioInUse(datos.fields?.folioExpediente, id);
      if (duplicate) {
        const status = { en_proceso: 'en proceso', concluido: 'concluido', cancelado: 'cancelado' }[duplicate.estatus] || duplicate.estatus;
        throw httpError(422, `El folio ${text(datos.fields.folioExpediente)} ya lo tiene el avalúo #${duplicate.id} (${status}). Use otro folio: los folios no se repiten ni se reutilizan, aunque el avalúo se haya cancelado.`);
      }
    }
    const writtenFiles = [];
    const movedFiles = [];
    let obsoleteFiles = [];
    let avaluoId = id == null ? null : Number(id);

    db.exec('BEGIN');
    try {
      if (avaluoId == null) {
        avaluoId = Number(db.prepare("INSERT INTO avaluos (datos) VALUES ('{}')").run().lastInsertRowid);
      } else {
        const current = db.prepare('SELECT revision FROM avaluos WHERE id = ?').get(avaluoId);
        if (!current) throw httpError(404, 'El avalúo no existe.');
        if (revision != null && Number(revision) !== current.revision) {
          throw httpError(409, 'El avalúo se modificó desde otro dispositivo (por ejemplo, una visita de campo sincronizada) después de que lo abrió.');
        }
      }

      const stored = storeImages(avaluoId, datos, writtenFiles, movedFiles);
      obsoleteFiles = removeUnreferencedFiles(avaluoId, stored.referenced);
      const columns = summaryColumns(stored.datos, resumen);
      db.prepare(`UPDATE avaluos SET folio = ?, fecha_avaluo = ?, tipo_inmueble = ?, solicitante = ?, propietario = ?,
        calle = ?, colonia = ?, municipio = ?, estado = ?, valor_concluido = ?, enfoque_concluido = ?, datos = ?,
        actualizado_en = datetime('now'), revision = revision + 1 WHERE id = ?`).run(
        columns.folio, columns.fecha_avaluo, columns.tipo_inmueble, columns.solicitante, columns.propietario,
        columns.calle, columns.colonia, columns.municipio, columns.estado, columns.valor_concluido, columns.enfoque_concluido,
        JSON.stringify(stored.datos), avaluoId
      );
      bank.syncFromAvaluo(avaluoId, stored.datos);
      db.exec('COMMIT');
      obsoleteFiles.forEach(file => fs.rmSync(file, { force: true }));
      return get(avaluoId);
    } catch (error) {
      db.exec('ROLLBACK');
      writtenFiles.forEach(file => fs.rmSync(file, { force: true }));
      // Las subidas directas regresan a su carpeta temporal para poder reintentar el guardado.
      movedFiles.forEach(({ from, to }) => {
        try { fs.renameSync(to, from); } catch { /* el archivo temporal se depura después */ }
      });
      throw error;
    }
  }

  // --- Visitas de campo desde la app móvil ---
  // Los valores capturados en campo reemplazan a los del avalúo (los vacíos no borran nada); fotos y croquis se agregan.
  // `visitaId` evita aplicar dos veces la misma visita si el celular reintenta la sincronización.
  function applyVisit({ visitaId, avaluoId, folio, fields, photos, croquis, notas, capturadoEn } = {}) {
    if (typeof visitaId !== 'string' || !/^[a-zA-Z0-9-]{8,64}$/.test(visitaId)) throw httpError(400, 'La visita no tiene un identificador válido.');
    let datos;
    let resumen = null;
    if (avaluoId != null) {
      const current = get(avaluoId);
      if (!current) throw httpError(404, 'El avalúo de esta visita ya no existe; sincronícela como avalúo nuevo.');
      datos = current.datos;
      resumen = { valorConcluido: current.valor_concluido, enfoque: current.enfoque_concluido };
    } else {
      const existing = db.prepare("SELECT id FROM avaluos WHERE datos LIKE ? LIMIT 1").get(`%"${visitaId}"%`);
      if (existing) return { ...get(existing.id), duplicada: true };
      datos = { version: 1, fields: {}, flags: {}, attachments: { photos: [], croquis: [], documents: [] } };
    }
    if ((datos.visitasAplicadas || []).includes(visitaId)) return { ...get(avaluoId), duplicada: true };

    datos.fields = datos.fields || {};
    Object.entries(fields && typeof fields === 'object' ? fields : {}).forEach(([name, value]) => {
      if (!/^[a-zA-Z0-9]+$/.test(name)) return;
      if (Array.isArray(value)) {
        const items = value.filter(item => typeof item === 'string' && item.trim());
        if (items.length) datos.fields[name] = items;
      } else if (typeof value === 'string' && value.trim()) {
        datos.fields[name] = value.trim();
      }
    });
    if (avaluoId == null && text(folio)) datos.fields.folioExpediente = text(folio);

    const visitDate = new Date(capturadoEn || Date.now());
    const dateText = Number.isNaN(visitDate.getTime()) ? '' : visitDate.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Mexico_City' });
    if (text(notas)) {
      datos.fields.notasVisita = [text(datos.fields.notasVisita), `Visita de campo${dateText ? ` del ${dateText}` : ''}: ${text(notas)}`].filter(Boolean).join('\n\n');
    }

    const toAttachment = item => ({ name: text(item?.name) || 'foto.jpg', type: text(item?.type) || 'image/jpeg', size: Number(item?.size) || 0, preview: text(item?.url), file: '' });
    datos.attachments = datos.attachments || {};
    ['photos', 'croquis'].forEach(collection => {
      const incoming = (collection === 'photos' ? photos : croquis);
      datos.attachments[collection] = [...(datos.attachments[collection] || []), ...(Array.isArray(incoming) ? incoming : []).map(toAttachment).filter(item => UPLOAD_URL.test(item.preview))];
    });
    datos.attachments.documents = datos.attachments.documents || [];
    datos.visitasAplicadas = [...(datos.visitasAplicadas || []), visitaId];
    return save(avaluoId == null ? null : avaluoId, { datos, resumen }, { checkFolio: false });
  }

  // --- Subidas directas de anexos: se escriben en disco al agregarlas y se ligan al avalúo al guardarlo ---
  const uploadsDir = path.join(filesDir, 'cargas');
  fs.mkdirSync(uploadsDir, { recursive: true });

  function createUploadTarget(mimeType) {
    const extension = FILE_EXTENSIONS[String(mimeType || '').toLowerCase()];
    if (!extension) throw httpError(415, 'Tipo de archivo no admitido; use imágenes, PDF o Word.');
    const relativePath = path.posix.join('cargas', `${crypto.randomUUID()}${extension}`);
    return { relativePath, absolutePath: path.join(filesDir, relativePath) };
  }

  function registerUpload(mimeType, relativePath, bytes) {
    const uploadId = Number(db.prepare('INSERT INTO cargas (tipo_mime, ruta, bytes) VALUES (?, ?, ?)').run(String(mimeType).toLowerCase(), relativePath, bytes).lastInsertRowid);
    return `/api/cargas/${uploadId}`;
  }

  function getUpload(id) {
    const upload = db.prepare('SELECT tipo_mime, ruta FROM cargas WHERE id = ?').get(Number(id));
    return upload ? { mimeType: upload.tipo_mime, path: path.join(filesDir, upload.ruta) } : null;
  }

  // Resuelve una referencia de la captura (/api/archivos/N o /api/cargas/N) al archivo en disco.
  function resolveFileUrl(url) {
    const fileUrl = String(url || '').match(FILE_URL);
    if (fileUrl) return getFile(fileUrl[1]);
    const uploadUrl = String(url || '').match(UPLOAD_URL);
    return uploadUrl ? getUpload(uploadUrl[1]) : null;
  }

  // Elimina las subidas que nunca se guardaron en un avalúo (por ejemplo, si se cerró la página sin guardar).
  function deleteStaleUploads(maxAgeHours = UPLOAD_MAX_AGE_HOURS) {
    const stale = db.prepare(`SELECT id, ruta FROM cargas WHERE creado_en < datetime('now', ?)`).all(`${-maxAgeHours} hours`);
    const remove = db.prepare('DELETE FROM cargas WHERE id = ?');
    stale.forEach(upload => {
      remove.run(upload.id);
      fs.rmSync(path.join(filesDir, upload.ruta), { force: true });
    });
    return stale.length;
  }

  function get(id) {
    const row = db.prepare('SELECT * FROM avaluos WHERE id = ?').get(Number(id));
    if (!row) return null;
    const { datos, ...summary } = row;
    return { ...summary, datos: JSON.parse(datos) };
  }

  function list(query = '') {
    const search = `%${String(query).trim()}%`;
    return db.prepare(`SELECT id, folio, fecha_avaluo, tipo_inmueble, solicitante, propietario, calle, colonia, municipio, estado,
        valor_concluido, enfoque_concluido, creado_en, actualizado_en, estatus, estatus_fecha, estatus_motivo
      FROM avaluos
      WHERE ? = '%%' OR folio LIKE ? OR solicitante LIKE ? OR propietario LIKE ? OR calle LIKE ? OR colonia LIKE ? OR municipio LIKE ?
      ORDER BY actualizado_en DESC, id DESC
      LIMIT 200`).all(search, search, search, search, search, search, search);
  }

  // Una fila por avalúo con los datos que usa el tablero de estadísticas.
  function statistics() {
    const number = value => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    };
    return db.prepare(`SELECT id, folio, fecha_avaluo, date(creado_en) AS creado, tipo_inmueble, solicitante, calle, colonia, municipio, estado,
        valor_concluido, enfoque_concluido, actualizado_en,
        json_extract(datos, '$.fields.superficieConstruccion') AS superficie_construccion,
        json_extract(datos, '$.fields.superficieTerreno') AS superficie_terreno,
        json_extract(datos, '$.fields.usoAvaluo') AS uso_avaluo,
        json_extract(datos, '$.fields.latitud') AS latitud,
        json_extract(datos, '$.fields.longitud') AS longitud
      FROM avaluos WHERE estatus != 'cancelado'
      ORDER BY COALESCE(NULLIF(fecha_avaluo, ''), date(creado_en)) DESC, id DESC`).all().map(row => {
      const value = number(row.valor_concluido);
      const construction = number(row.superficie_construccion);
      const land = number(row.superficie_terreno);
      // Valor unitario sobre la superficie construida; en terrenos sin construcción, sobre la superficie de terreno.
      const unitSurface = construction || land;
      return {
        id: row.id,
        folio: text(row.folio),
        fecha: text(row.fecha_avaluo) || row.creado,
        tipo: text(row.tipo_inmueble) || 'Sin especificar',
        solicitante: text(row.solicitante) || 'Sin especificar',
        ubicacion: [text(row.calle), text(row.colonia)].filter(Boolean).join(', '),
        colonia: text(row.colonia) || 'Sin especificar',
        municipio: text(row.municipio) || 'Sin especificar',
        estado: text(row.estado),
        usoAvaluo: text(row.uso_avaluo),
        valor: value,
        enfoque: text(row.enfoque_concluido) || null,
        superficieConstruccion: construction,
        superficieTerreno: land,
        valorUnitario: value && unitSurface ? Math.round((value / unitSurface) * 100) / 100 : null,
        baseUnitaria: construction ? 'construcción' : land ? 'terreno' : null,
        latitud: row.latitud !== '' && row.latitud != null && Number.isFinite(Number(row.latitud)) && Number(row.latitud) !== 0 ? Number(row.latitud) : null,
        longitud: row.longitud !== '' && row.longitud != null && Number.isFinite(Number(row.longitud)) && Number(row.longitud) !== 0 ? Number(row.longitud) : null,
        actualizado: row.actualizado_en
      };
    });
  }

  function remove(id) {
    const avaluoId = Number(id);
    const current = db.prepare('SELECT id, estatus FROM avaluos WHERE id = ?').get(avaluoId);
    if (!current) return false;
    // Un avalúo concluido ya tiene un folio entregado: se cancela, no se borra.
    if (current.estatus === 'concluido') throw httpError(409, 'Un avalúo concluido no se elimina: cancélelo para conservar el registro de su folio.');
    // Primero el banco copia las fotos y evidencias de sus comparables; después se borran el avalúo y sus archivos.
    bank.detachAvaluo(avaluoId);
    db.prepare('DELETE FROM avaluos WHERE id = ?').run(avaluoId);
    fs.rmSync(path.join(filesDir, String(avaluoId)), { recursive: true, force: true });
    return true;
  }

  // Primera vez con banco: se cargan los comparables de los avalúos que ya estaban guardados.
  if (bank.isEmpty()) {
    db.prepare('SELECT id, datos FROM avaluos').all().forEach(row => {
      try {
        bank.syncFromAvaluo(row.id, JSON.parse(row.datos));
      } catch {
        // Un avalúo con datos irregulares no impide cargar los demás.
      }
    });
  }

  function getFile(id) {
    const file = db.prepare('SELECT tipo_mime, ruta FROM archivos WHERE id = ?').get(Number(id));
    return file ? { mimeType: file.tipo_mime, path: path.join(filesDir, file.ruta) } : null;
  }

  // Convierte la referencia a un archivo guardado en data URL, para que el perfil no dependa de ningún avalúo.
  function inlineImage(value) {
    if (typeof value !== 'string' || !value) return '';
    const dataUrl = value.match(DATA_URL);
    if (dataUrl) {
      const mimeType = dataUrl[1].toLowerCase();
      if (!mimeType.startsWith('image/') || !FILE_EXTENSIONS[mimeType]) return '';
      return Buffer.from(dataUrl[2], 'base64').length <= MAX_FILE_BYTES ? value : '';
    }
    const fileUrl = value.match(FILE_URL);
    if (!fileUrl) return '';
    const file = db.prepare('SELECT tipo_mime, ruta FROM archivos WHERE id = ?').get(Number(fileUrl[1]));
    if (!file || !file.tipo_mime.startsWith('image/')) return '';
    try {
      return `data:${file.tipo_mime};base64,${fs.readFileSync(path.join(filesDir, file.ruta)).toString('base64')}`;
    } catch {
      return '';
    }
  }

  function profileFrom({ fields, valuerLogo, valuerSignature } = {}) {
    return {
      fields: Object.fromEntries(VALUER_PROFILE_FIELDS.map(name => [name, text(fields?.[name])])),
      valuerLogo: inlineImage(valuerLogo),
      valuerSignature: inlineImage(valuerSignature)
    };
  }

  function saveProfile(input) {
    const profile = profileFrom(input);
    if (!profile.fields.valuadorNombre) throw httpError(400, 'El perfil del valuador requiere al menos el nombre.');
    db.prepare(`INSERT INTO perfil_valuador (id, datos, actualizado_en) VALUES (1, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET datos = excluded.datos, actualizado_en = excluded.actualizado_en`).run(JSON.stringify(profile));
    return profile;
  }

  // Si aún no hay perfil guardado, se toma del avalúo más reciente que tenga nombre de valuador.
  function getProfile() {
    const row = db.prepare('SELECT datos FROM perfil_valuador WHERE id = 1').get();
    if (row) return JSON.parse(row.datos);
    const recent = db.prepare('SELECT datos FROM avaluos ORDER BY actualizado_en DESC, id DESC LIMIT 50').all();
    for (const { datos } of recent) {
      const parsed = JSON.parse(datos);
      if (text(parsed.fields?.valuadorNombre)) return profileFrom(parsed);
    }
    return null;
  }

  return {
    save, get, list, remove, getFile, saveProfile, getProfile, applyVisit, statistics, bank, folioInUse, nextFolio, setStatus,
    createUploadTarget, registerUpload, getUpload, resolveFileUrl, deleteStaleUploads,
    close: () => db.close()
  };
}

module.exports = { createAvaluosRepository, httpError, MAX_UPLOAD_BYTES };
