const http = require('http');
const fs = require('fs');
const path = require('path');
const Busboy = require('busboy');
const { calculateHomologation } = require('./backend/valuation/homologation');
const { lookupUrbanContext } = require('./backend/valuation/urban-context');
const { extractUrbanPlanDocument, MAX_DOCUMENT_BYTES } = require('./backend/valuation/urban-plan-documents');

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
    file.on('limit', () => { uploadError = `${info.filename}: el límite por archivo es 15 MB.`; });
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
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
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

  if (req.url === '/frontend/technical-descriptions.js') {
    const filePath = path.join(__dirname, 'frontend', 'technical-descriptions.js');
    fs.readFile(filePath, 'utf8', (err, content) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('No se pudo cargar el generador de descripciones.');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      res.end(content);
    });
    return;
  }

  if (req.url === '/' || req.url === '/index.html') {
    const filePath = path.join(__dirname, 'AVALUO-FORMATO.html');
    fs.readFile(filePath, 'utf8', (err, content) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('No se pudo cargar la interfaz.');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(content);
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Ruta no encontrada');
});

server.listen(3000, () => {
  console.log('Servidor escuchando en http://localhost:3000');
});
