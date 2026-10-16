const http = require('http');
const fs = require('fs');
const path = require('path');
const Busboy = require('busboy');
const { calculateHomologation } = require('./backend/valuation/homologation');
const { lookupUrbanContext } = require('./backend/valuation/urban-context');
const { lookupUrbanEquipment } = require('./backend/valuation/urban-equipment');
const { extractUrbanPlanDocument, MAX_DOCUMENT_BYTES } = require('./backend/valuation/urban-plan-documents');
const { createAvaluosRepository, MAX_UPLOAD_BYTES } = require('./backend/db/avaluos-repository');
const { createDocumentExtractor } = require('./backend/valuation/document-extraction');

const documentExtractor = createDocumentExtractor();

const STATIC_FILES = {
  '/': { file: 'AVALUO-FORMATO.html', type: 'text/html; charset=utf-8' },
  '/frontend/technical-descriptions.js': { file: 'frontend/technical-descriptions.js', type: 'text/javascript; charset=utf-8' },
  '/frontend/finishes-catalog.js': { file: 'frontend/finishes-catalog.js', type: 'text/javascript; charset=utf-8' },
  '/frontend/mapa-resumen.js': { file: 'frontend/mapa-resumen.js', type: 'text/javascript; charset=utf-8' },
  '/vendor/leaflet/leaflet.js': { file: 'node_modules/leaflet/dist/leaflet.js', type: 'text/javascript; charset=utf-8' },
  '/vendor/leaflet/leaflet.css': { file: 'node_modules/leaflet/dist/leaflet.css', type: 'text/css; charset=utf-8' },
  '/estadisticas': { file: 'frontend/estadisticas.html', type: 'text/html; charset=utf-8' },
  '/comparables': { file: 'frontend/comparables.html', type: 'text/html; charset=utf-8' },
  '/movil': { file: 'mobile/movil.html', type: 'text/html; charset=utf-8' },
  '/movil.webmanifest': { file: 'mobile/movil.webmanifest', type: 'application/manifest+json; charset=utf-8' },
  '/movil-sw.js': { file: 'mobile/movil-sw.js', type: 'text/javascript; charset=utf-8' },
  '/movil/icon-192.png': { file: 'mobile/icon-192.png', type: 'image/png' },
  '/movil/icon-512.png': { file: 'mobile/icon-512.png', type: 'image/png' }
};

const DATA_DIR = process.env.AVALUOS_DATA_DIR || path.join(__dirname, 'data');
const avaluos = createAvaluosRepository({
  databasePath: path.join(DATA_DIR, 'avaluos.db'),
  filesDir: path.join(DATA_DIR, 'archivos')
});
avaluos.deleteStaleUploads();
// Los anexos se suben por separado (/api/cargas); la captura solo trae imágenes pequeñas (firma, logotipo, comparables).
const MAX_VALUATION_BODY_BYTES = 100 * 1024 * 1024;

function httpFailure(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

// Recibe un anexo (campo "archivo") y lo escribe directamente en disco, sin cargarlo completo en memoria.
function handleUpload(req, res) {
  let parser;
  try {
    parser = Busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_UPLOAD_BYTES, fields: 2 } });
  } catch {
    sendJson(res, 400, { error: 'La solicitud debe incluir un archivo.' });
    return;
  }
  let pending = null;
  parser.on('file', (fieldName, file, info) => {
    if (fieldName !== 'archivo' || pending) {
      file.resume();
      return;
    }
    pending = new Promise((resolve, reject) => {
      let target;
      try {
        target = avaluos.createUploadTarget(info.mimeType);
      } catch (error) {
        file.resume();
        reject(error);
        return;
      }
      let bytes = 0;
      let tooLarge = false;
      const output = fs.createWriteStream(target.absolutePath);
      file.on('data', chunk => { bytes += chunk.length; });
      file.on('limit', () => { tooLarge = true; });
      output.on('error', error => {
        fs.rmSync(target.absolutePath, { force: true });
        reject(error);
      });
      output.on('finish', () => {
        if (tooLarge) {
          fs.rmSync(target.absolutePath, { force: true });
          reject(httpFailure(413, `${info.filename}: el límite por archivo es ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`));
          return;
        }
        resolve({ url: avaluos.registerUpload(info.mimeType, target.relativePath, bytes), bytes, type: info.mimeType });
      });
      file.pipe(output);
    });
  });
  parser.on('error', error => {
    if (!res.headersSent) sendJson(res, 400, { error: error.message });
  });
  parser.on('finish', async () => {
    try {
      if (!pending) throw httpFailure(400, 'Seleccione un archivo.');
      sendJson(res, 201, await pending);
    } catch (error) {
      if (!error.statusCode) console.error(error);
      if (!res.headersSent) sendJson(res, error.statusCode || 500, { error: error.statusCode ? error.message : 'No se pudo guardar el archivo.' });
    }
  });
  req.pipe(parser);
}

// Lee un PDF ya subido o guardado (por su URL /api/cargas/N o /api/archivos/N) para analizarlo.
async function handleDocumentApi(req, res, pathname) {
  try {
    const { file, pages, fileName } = await readJsonBody(req, 64 * 1024);
    const stored = avaluos.resolveFileUrl(file);
    if (!stored) throw httpFailure(404, 'No se encontró el documento; vuelva a agregarlo.');
    if (stored.mimeType !== 'application/pdf') throw httpFailure(415, 'Solo se pueden analizar documentos PDF.');
    const buffer = await fs.promises.readFile(stored.path);
    if (pathname === '/api/document-info') {
      sendJson(res, 200, await documentExtractor.getPdfInfo(buffer));
    } else {
      sendJson(res, 200, await documentExtractor.extract({ buffer, fileName, pages }));
    }
  } catch (error) {
    if (!error.statusCode) console.error(error);
    if (!res.headersSent) sendJson(res, error.statusCode || 500, { error: error.statusCode ? error.message : 'No se pudo procesar el documento.' });
  }
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readJsonBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        const error = new Error('La captura excede el tamaño máximo permitido.');
        error.statusCode = 413;
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        const error = new Error('El cuerpo de la solicitud no es JSON válido.');
        error.statusCode = 400;
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

async function handleAvaluosApi(req, res, pathname, searchParams) {
  const idMatch = pathname.match(/^\/api\/avaluos\/(\d+)$/);
  try {
    if (pathname === '/api/avaluos' && req.method === 'GET') {
      sendJson(res, 200, { avaluos: avaluos.list(searchParams.get('q') || '') });
    } else if (pathname === '/api/avaluos' && req.method === 'POST') {
      sendJson(res, 201, avaluos.save(null, await readJsonBody(req, MAX_VALUATION_BODY_BYTES)));
    } else if (idMatch && req.method === 'GET') {
      const avaluo = avaluos.get(idMatch[1]);
      if (avaluo) sendJson(res, 200, avaluo);
      else sendJson(res, 404, { error: 'El avalúo no existe.' });
    } else if (idMatch && req.method === 'PUT') {
      sendJson(res, 200, avaluos.save(idMatch[1], await readJsonBody(req, MAX_VALUATION_BODY_BYTES)));
    } else if (idMatch && req.method === 'DELETE') {
      if (avaluos.remove(idMatch[1])) sendJson(res, 200, { ok: true });
      else sendJson(res, 404, { error: 'El avalúo no existe.' });
    } else {
      sendJson(res, 405, { error: 'Operación no permitida.' });
    }
  } catch (error) {
    if (!res.headersSent) sendJson(res, error.statusCode || 500, { error: error.statusCode ? error.message : 'No se pudo completar la operación con la base de datos.' });
    if (!error.statusCode) console.error(error);
  }
}

async function handleComparablesApi(req, res, pathname, searchParams) {
  const idMatch = pathname.match(/^\/api\/comparables\/(\d+)$/);
  const { bank } = avaluos;
  try {
    if (pathname === '/api/comparables' && req.method === 'GET') {
      const filters = Object.fromEntries(['categoria', 'tipo', 'municipio', 'q'].map(key => [key, searchParams.get(key) || '']));
      sendJson(res, 200, { comparables: bank.list(filters) });
    } else if (pathname === '/api/comparables' && req.method === 'POST') {
      sendJson(res, 201, bank.create(await readJsonBody(req, 256 * 1024)));
    } else if (idMatch && req.method === 'PUT') {
      sendJson(res, 200, bank.update(idMatch[1], await readJsonBody(req, 256 * 1024)));
    } else if (idMatch && req.method === 'DELETE') {
      if (bank.remove(idMatch[1])) sendJson(res, 200, { ok: true });
      else sendJson(res, 404, { error: 'El comparable no existe.' });
    } else {
      sendJson(res, 405, { error: 'Operación no permitida.' });
    }
  } catch (error) {
    if (!error.statusCode) console.error(error);
    if (!res.headersSent) sendJson(res, error.statusCode || 500, { error: error.statusCode ? error.message : 'No se pudo completar la operación con el banco de comparables.' });
  }
}

async function handleValuerProfileApi(req, res) {
  try {
    if (req.method === 'GET') {
      sendJson(res, 200, { perfil: avaluos.getProfile() });
    } else if (req.method === 'PUT') {
      sendJson(res, 200, { perfil: avaluos.saveProfile(await readJsonBody(req, 40 * 1024 * 1024)) });
    } else {
      sendJson(res, 405, { error: 'Operación no permitida.' });
    }
  } catch (error) {
    if (!error.statusCode) console.error(error);
    if (!res.headersSent) sendJson(res, error.statusCode || 500, { error: error.statusCode ? error.message : 'No se pudo guardar el perfil del valuador.' });
  }
}

// Envía un archivo guardado o subido en partes, para no cargar documentos grandes completos en memoria.
function handleStoredFile(req, res, file) {
  const notFound = () => {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Archivo no encontrado.');
  };
  if (!file) {
    notFound();
    return;
  }
  fs.stat(file.path, (err, stats) => {
    if (err) {
      notFound();
      return;
    }
    const headers = {
      'Content-Type': file.mimeType,
      'Content-Length': stats.size,
      'Cache-Control': 'private, no-cache',
      'X-Content-Type-Options': 'nosniff'
    };
    // Las imágenes se aíslan con CSP; el PDF se abre en el visor del navegador y los archivos de Word se descargan.
    if (file.mimeType.startsWith('image/')) headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
    else if (file.mimeType !== 'application/pdf') headers['Content-Disposition'] = 'attachment';
    res.writeHead(200, headers);
    fs.createReadStream(file.path).on('error', () => res.destroy()).pipe(res);
  });
}

const mapTileCache = new Map();
const MAP_TILE_CACHE_LIMIT = 500;
const MAP_TILE_FALLBACK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function sendMapTile(res, tile) {
  res.writeHead(200, {
    'Content-Type': 'image/png',
    'Cache-Control': `public, max-age=${Math.max(0, Math.floor((tile.expiresAt - Date.now()) / 1000))}`,
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(tile.body);
}

async function handleMapTile(req, res, zoom, x, y) {
  const z = Number(zoom);
  const tileCount = 2 ** z;
  const tileX = Number(x);
  const tileY = Number(y);
  if (!Number.isInteger(z) || z < 0 || z > 19 || !Number.isInteger(tileX) || !Number.isInteger(tileY) || tileX < 0 || tileY < 0 || tileX >= tileCount || tileY >= tileCount) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Tesela cartográfica inválida.');
    return;
  }

  const key = `${z}/${tileX}/${tileY}`;
  const cached = mapTileCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    sendMapTile(res, cached);
    return;
  }

  const headers = {
    'User-Agent': process.env.OSM_TILE_USER_AGENT || 'AVALUO-FORMATO/1.0 (+http://localhost:3000/)',
    'Referer': 'http://localhost:3000/'
  };
  if (cached?.etag) headers['If-None-Match'] = cached.etag;
  if (cached?.lastModified) headers['If-Modified-Since'] = cached.lastModified;

  try {
    const upstream = await fetch(`https://tile.openstreetmap.org/${key}.png`, {
      headers,
      signal: AbortSignal.timeout(10000)
    });
    if (upstream.status === 304 && cached) {
      const refreshed = { ...cached, expiresAt: Date.now() + MAP_TILE_FALLBACK_TTL_MS };
      mapTileCache.set(key, refreshed);
      sendMapTile(res, refreshed);
      return;
    }
    if (!upstream.ok) throw new Error(`OpenStreetMap respondió ${upstream.status}.`);

    const body = Buffer.from(await upstream.arrayBuffer());
    const cacheControl = upstream.headers.get('cache-control') || '';
    const maxAge = Number(cacheControl.match(/max-age=(\d+)/i)?.[1]);
    const staleAge = Number(cacheControl.match(/stale-if-error=(\d+)/i)?.[1]) || 0;
    const now = Date.now();
    const tile = {
      body,
      etag: upstream.headers.get('etag') || '',
      lastModified: upstream.headers.get('last-modified') || '',
      expiresAt: now + (Number.isFinite(maxAge) && maxAge > 0 ? maxAge * 1000 : MAP_TILE_FALLBACK_TTL_MS),
      staleUntil: now + (Number.isFinite(maxAge) && maxAge > 0 ? maxAge * 1000 : MAP_TILE_FALLBACK_TTL_MS) + staleAge * 1000
    };
    mapTileCache.set(key, tile);
    if (mapTileCache.size > MAP_TILE_CACHE_LIMIT) mapTileCache.delete(mapTileCache.keys().next().value);
    sendMapTile(res, tile);
  } catch (error) {
    if (cached && cached.staleUntil > Date.now()) {
      sendMapTile(res, cached);
      return;
    }
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('No se pudo cargar la tesela de OpenStreetMap.');
  }
}

function handleUrbanPlanUpload(req, res) {
  let parser;
  try {
    parser = Busboy({ headers: req.headers, limits: { files: 5, fileSize: MAX_DOCUMENT_BYTES, fields: 5 } });
  } catch (error) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'La solicitud debe incluir documentos PDF, DOCX o TXT.' }));
    return;
  }

  const uploads = [];
  let uploadError = '';
  parser.on('filesLimit', () => { uploadError = 'Selecciona cinco documentos o menos por consulta.'; });
  parser.on('file', (fieldName, file, info) => {
    if (fieldName !== 'documents') {
      file.resume();
      return;
    }
    const chunks = [];
    let size = 0;
    file.on('data', chunk => {
      size += chunk.length;
      if (size <= MAX_DOCUMENT_BYTES) chunks.push(chunk);
    });
    file.on('limit', () => { uploadError = `${info.filename}: el límite por archivo es 100 MB.`; });
    file.on('end', () => {
      if (!file.truncated && size <= MAX_DOCUMENT_BYTES) {
        uploads.push({ fileName: info.filename, buffer: Buffer.concat(chunks) });
      }
    });
  });
  parser.on('error', error => {
    if (res.headersSent) return;
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: error.message }));
  });
  parser.on('finish', async () => {
    if (uploadError) {
      res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: uploadError }));
      return;
    }
    if (!uploads.length) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Selecciona al menos un archivo en el campo de documentos territoriales.' }));
      return;
    }

    const results = await Promise.all(uploads.map(async upload => {
      try {
        return { ...(await extractUrbanPlanDocument(upload.fileName, upload.buffer)), error: '' };
      } catch (error) {
        return { fileName: path.basename(upload.fileName), matches: [], error: error.message };
      }
    }));
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ documents: results }));
  });
  req.pipe(parser);
}

const server = http.createServer((req, res) => {
  const { pathname, searchParams } = new URL(req.url, 'http://localhost');

  if (pathname === '/api/avaluos' || pathname.startsWith('/api/avaluos/')) {
    handleAvaluosApi(req, res, pathname, searchParams);
    return;
  }

  if (pathname === '/api/perfil-valuador') {
    handleValuerProfileApi(req, res);
    return;
  }

  if ((pathname === '/api/document-info' || pathname === '/api/document-extraction') && req.method === 'POST') {
    handleDocumentApi(req, res, pathname);
    return;
  }

  if (pathname === '/api/cargas' && req.method === 'POST') {
    handleUpload(req, res);
    return;
  }

  const storedFileMatch = pathname.match(/^\/api\/(archivos|cargas)\/(\d+)$/);
  if (storedFileMatch && req.method === 'GET') {
    handleStoredFile(req, res, storedFileMatch[1] === 'archivos' ? avaluos.getFile(storedFileMatch[2]) : avaluos.getUpload(storedFileMatch[2]));
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (pathname === '/api/urban-equipment' && req.method === 'GET') {
    lookupUrbanEquipment(searchParams.get('lat'), searchParams.get('lon'))
      .then(result => sendJson(res, 200, result))
      .catch(error => {
        if (!error.statusCode) console.error(error);
        sendJson(res, error.statusCode || 502, { error: error.statusCode ? error.message : 'No se pudo consultar el equipamiento urbano.' });
      });
    return;
  }

  if (req.url.startsWith('/api/urban-context')) {
    const requestUrl = new URL(req.url, 'http://localhost');
    lookupUrbanContext(requestUrl.searchParams.get('lat'), requestUrl.searchParams.get('lon'))
      .then(context => {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(context));
      })
      .catch(error => {
        res.writeHead(error.statusCode || 502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: error.message }));
      });
    return;
  }

  const mapTileMatch = req.url.match(/^\/api\/map-tiles\/(\d+)\/(\d+)\/(\d+)\.png$/);
  if (mapTileMatch && req.method === 'GET') {
    handleMapTile(req, res, ...mapTileMatch.slice(1));
    return;
  }

  if (req.url === '/api/urban-plan-documents' && req.method === 'POST') {
    handleUrbanPlanUpload(req, res);
    return;
  }

  if (req.url.startsWith('/api/valuation')) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const result = calculateHomologation(payload);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  if (pathname === '/api/comparables' || pathname.startsWith('/api/comparables/')) {
    handleComparablesApi(req, res, pathname, searchParams);
    return;
  }

  if (pathname === '/api/estadisticas' && req.method === 'GET') {
    try {
      sendJson(res, 200, { avaluos: avaluos.statistics() });
    } catch (error) {
      console.error(error);
      sendJson(res, 500, { error: 'No se pudieron calcular las estadísticas.' });
    }
    return;
  }

  if (pathname === '/api/visitas' && req.method === 'POST') {
    readJsonBody(req, 2 * 1024 * 1024)
      .then(visit => sendJson(res, 200, avaluos.applyVisit(visit)))
      .catch(error => {
        if (!error.statusCode) console.error(error);
        if (!res.headersSent) sendJson(res, error.statusCode || 500, { error: error.statusCode ? error.message : 'No se pudo registrar la visita de campo.' });
      });
    return;
  }

  const staticFile = STATIC_FILES[pathname === '/index.html' ? '/' : pathname];
  if (staticFile && req.method === 'GET') {
    fs.readFile(path.join(__dirname, staticFile.file), (err, content) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('No se pudo cargar el archivo.');
        return;
      }
      // Sin caché del navegador: el service worker de la app móvil administra la copia para trabajar sin conexión.
      res.writeHead(200, { 'Content-Type': staticFile.type, 'Cache-Control': 'no-cache', ...(staticFile.headers || {}) });
      res.end(content);
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Ruta no encontrada');
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error('\nEl puerto 3000 ya está en uso: hay otra ventana del servidor abierta (posiblemente una versión anterior).');
    console.error('Ciérrela y vuelva a ejecutar start-server.bat.\n');
  } else {
    console.error('No se pudo iniciar el servidor:', error.message);
  }
  process.exit(1);
});

// Solo escucha en este equipo; el celular entra por Tailscale (`tailscale serve`), que reenvía aquí de forma segura.
// HOST=0.0.0.0 permite el acceso desde la red local, sin cifrado.
const HOST = process.env.HOST || '127.0.0.1';
server.listen(3000, HOST, () => {
  console.log('Servidor escuchando en http://localhost:3000');
  console.log('App móvil: http://localhost:3000/movil (desde el celular, por la dirección de Tailscale)');
});
