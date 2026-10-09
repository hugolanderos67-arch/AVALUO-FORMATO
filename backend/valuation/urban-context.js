const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_LIMIT = 250;
const REQUEST_INTERVAL_MS = 1100;
const cache = new Map();
const pendingRequests = new Map();
let lastRequestAt = 0;
let requestQueue = Promise.resolve();

function normalizeCoordinates(latitude, longitude) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    const error = new Error('Las coordenadas deben estar dentro del rango WGS84.');
    error.statusCode = 400;
    throw error;
  }
  return { latitude: Number(lat.toFixed(6)), longitude: Number(lon.toFixed(6)) };
}

function mapReverseGeocode(place, coordinates) {
  const address = place.address || {};
  const locality = address.city || address.town || address.village || address.hamlet || address.municipality || '';
  const municipality = address.municipality || address.city_district || address.county || locality;
  const state = address.state || '';
  const colony = address.neighbourhood || address.quarter || address.suburb || address.residential || '';
  const road = address.road || (place.category === 'highway' ? place.name : '') || '';
  const street = [address.house_number, road].filter(Boolean).join(' ');
  const localityParts = [locality && `localidad: ${locality}`, municipality && `municipio: ${municipality}`, state && `estado: ${state}`].filter(Boolean);
  const fields = {};

  if (street) fields.calle = street;
  if (colony) fields.colonia = colony;
  if (municipality) fields.municipio = municipality;
  if (state) fields.estado = state;
  if (localityParts.length) {
    fields.poblacion = `Contexto de localidad (sin cifra censal): ${localityParts.join('; ')}.`;
    fields.urbContexto = `Referencia geográfica: ${localityParts.join('; ')}.`;
  }
  if (road) {
    fields.vialidades = `Vialidad asociada a la coordenada: ${road}.`;
    fields.viasAcceso = `La geocodificación inversa identifica ${road} como vialidad asociada al punto; no determina jerarquía, estado físico ni accesibilidad.`;
    fields.urbEntorno = `Referencia vial cartográfica: ${road}.`;
  }

  const coordinateText = `${coordinates.latitude}, ${coordinates.longitude} (WGS84)`;
  const resolvedLabel = place.display_name || street || localityParts.join(', ');
  fields.coordenadas = coordinateText;
  fields.urbGeorreferenciacion = [
    `Coordenadas capturadas: ${coordinateText}.`,
    resolvedLabel && `Referencia más cercana en OpenStreetMap: ${resolvedLabel}.`,
    'La geocodificación inversa puede asociar el punto con el objeto cartográfico adecuado más cercano y no certifica la ubicación predial.',
    'Fuente y atribución: © OpenStreetMap contributors (ODbL).'
  ].filter(Boolean).join(' ');

  return {
    coordinates,
    countryCode: address.country_code || '',
    fields,
    source: 'OpenStreetMap contributors, Nominatim',
    attribution: '© OpenStreetMap contributors (ODbL)',
    sourceUrl: 'https://www.openstreetmap.org/copyright'
  };
}

async function waitForRequestSlot() {
  const slot = requestQueue.then(async () => {
    const delay = REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt);
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
    lastRequestAt = Date.now();
  });
  requestQueue = slot.catch(() => {});
  return slot;
}

async function requestReverseGeocode(coordinates) {
  await waitForRequestSlot();
  const endpoint = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org/reverse';
  const url = new URL(endpoint);
  url.search = new URLSearchParams({
    format: 'jsonv2',
    lat: String(coordinates.latitude),
    lon: String(coordinates.longitude),
    zoom: '18',
    addressdetails: '1',
    extratags: '1',
    'accept-language': 'es-MX,es'
  });
  if (process.env.NOMINATIM_EMAIL) url.searchParams.set('email', process.env.NOMINATIM_EMAIL);

  const response = await fetch(url, {
    headers: {
      'User-Agent': process.env.NOMINATIM_USER_AGENT || 'AVALUO-FORMATO/1.0 (real-estate valuation form)',
      'Accept-Language': 'es-MX,es'
    },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) {
    const error = new Error(`El servicio cartográfico respondió con estado ${response.status}.`);
    error.statusCode = 502;
    throw error;
  }

  const place = await response.json();
  if (place.error) {
    const error = new Error('No se encontró una referencia cartográfica para esas coordenadas.');
    error.statusCode = 404;
    throw error;
  }
  if (place.address?.country_code?.toLowerCase() !== 'mx') {
    const error = new Error('La consulta encontró un punto fuera de México; no se completaron los campos del avalúo.');
    error.statusCode = 422;
    throw error;
  }
  return mapReverseGeocode(place, coordinates);
}

async function lookupUrbanContext(latitude, longitude) {
  const coordinates = normalizeCoordinates(latitude, longitude);
  const key = `${coordinates.latitude},${coordinates.longitude}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) return cached.value;
  if (pendingRequests.has(key)) return pendingRequests.get(key);

  const request = requestReverseGeocode(coordinates).then(value => {
    cache.set(key, { value, createdAt: Date.now() });
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
    return value;
  }).finally(() => pendingRequests.delete(key));
  pendingRequests.set(key, request);
  return request;
}

module.exports = { lookupUrbanContext, mapReverseGeocode, normalizeCoordinates };
