const { normalizeCoordinates } = require('./urban-context');

// Equipamiento urbano alrededor del inmueble a partir de OpenStreetMap (API Overpass).
const SEARCH_RADIUS_M = 2000;
const MAX_ITEMS_PER_FIELD = 6;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_LIMIT = 250;
const REQUEST_TIMEOUT_MS = 40000;
// Servidores públicos de Overpass; se prueban en orden porque suelen saturarse. OVERPASS_URL permite fijar uno propio.
const OVERPASS_ENDPOINTS = (process.env.OVERPASS_URL || [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
].join(',')).split(',').map(url => url.trim()).filter(Boolean);

const CATEGORY_FIELDS = {
  urbEducacion: 'Educación',
  urbCultura: 'Cultura',
  urbSalud: 'Salud',
  urbComercio: 'Comercio y abasto',
  urbTransporte: 'Transporte',
  urbRecreacion: 'Recreación y deporte',
  urbSeguridad: 'Seguridad pública',
  urbServicios: 'Infraestructura y servicios'
};

// Etiqueta OSM -> [campo de la captura, tipo de equipamiento en español].
const TAG_RULES = {
  amenity: {
    kindergarten: ['urbEducacion', 'Jardín de niños'],
    school: ['urbEducacion', 'Escuela'],
    college: ['urbEducacion', 'Bachillerato o escuela técnica'],
    university: ['urbEducacion', 'Universidad'],
    library: ['urbCultura', 'Biblioteca'],
    theatre: ['urbCultura', 'Teatro'],
    arts_centre: ['urbCultura', 'Centro cultural'],
    cinema: ['urbCultura', 'Cine'],
    community_centre: ['urbCultura', 'Centro comunitario'],
    hospital: ['urbSalud', 'Hospital'],
    clinic: ['urbSalud', 'Clínica o centro de salud'],
    doctors: ['urbSalud', 'Consultorio médico'],
    dentist: ['urbSalud', 'Consultorio dental'],
    pharmacy: ['urbSalud', 'Farmacia'],
    marketplace: ['urbComercio', 'Mercado'],
    bus_station: ['urbTransporte', 'Terminal de autobuses'],
    police: ['urbSeguridad', 'Policía o módulo de seguridad'],
    fire_station: ['urbSeguridad', 'Estación de bomberos'],
    bank: ['urbServicios', 'Banco'],
    post_office: ['urbServicios', 'Oficina de correos'],
    fuel: ['urbServicios', 'Gasolinera'],
    townhall: ['urbServicios', 'Oficinas de gobierno']
  },
  tourism: { museum: ['urbCultura', 'Museo'] },
  shop: {
    supermarket: ['urbComercio', 'Supermercado'],
    mall: ['urbComercio', 'Centro comercial'],
    department_store: ['urbComercio', 'Tienda departamental'],
    convenience: ['urbComercio', 'Tienda de conveniencia'],
    greengrocer: ['urbComercio', 'Frutería y verdulería']
  },
  leisure: {
    park: ['urbRecreacion', 'Parque'],
    garden: ['urbRecreacion', 'Jardín público'],
    playground: ['urbRecreacion', 'Juegos infantiles'],
    sports_centre: ['urbRecreacion', 'Centro deportivo'],
    stadium: ['urbRecreacion', 'Estadio'],
    pitch: ['urbRecreacion', 'Cancha deportiva'],
    fitness_centre: ['urbRecreacion', 'Gimnasio'],
    swimming_pool: ['urbRecreacion', 'Alberca']
  },
  railway: {
    station: ['urbTransporte', 'Estación de tren o metro'],
    halt: ['urbTransporte', 'Estación de tren o metro'],
    subway_entrance: ['urbTransporte', 'Acceso al metro'],
    tram_stop: ['urbTransporte', 'Parada de tren ligero']
  },
  public_transport: { station: ['urbTransporte', 'Estación de transporte público'] },
  highway: { bus_stop: ['urbTransporte', 'Parada de autobús'] }
};

// Ícono que representa cada tipo de equipamiento en las casillas y en el dictamen.
const KIND_ICONS = {
  'Jardín de niños': '🧸',
  'Escuela': '🏫',
  'Bachillerato o escuela técnica': '🎒',
  'Universidad': '🎓',
  'Biblioteca': '📚',
  'Teatro': '🎭',
  'Centro cultural': '🎨',
  'Cine': '🎬',
  'Centro comunitario': '🏘️',
  'Museo': '🏛️',
  'Hospital': '🏥',
  'Clínica o centro de salud': '⚕️',
  'Consultorio médico': '🩺',
  'Consultorio dental': '🦷',
  'Farmacia': '💊',
  'Mercado': '🧺',
  'Supermercado': '🛒',
  'Centro comercial': '🛍️',
  'Tienda departamental': '🏬',
  'Tienda de conveniencia': '🏪',
  'Frutería y verdulería': '🍎',
  'Terminal de autobuses': '🚌',
  'Estación de tren o metro': '🚉',
  'Acceso al metro': '🚇',
  'Parada de tren ligero': '🚊',
  'Estación de transporte público': '🚉',
  'Parada de autobús': '🚏',
  'Parque': '🌳',
  'Jardín público': '🌷',
  'Juegos infantiles': '🎠',
  'Centro deportivo': '🏅',
  'Estadio': '🏟️',
  'Cancha deportiva': '⚽',
  'Gimnasio': '🏋️',
  'Alberca': '🏊',
  'Policía o módulo de seguridad': '🚓',
  'Estación de bomberos': '🚒',
  'Banco': '🏦',
  'Oficina de correos': '📮',
  'Gasolinera': '⛽',
  'Oficinas de gobierno': '🏢'
};

const cache = new Map();
const pendingRequests = new Map();

function buildQuery({ latitude, longitude }, radius = SEARCH_RADIUS_M) {
  const around = `(around:${radius},${latitude},${longitude})`;
  const filters = Object.entries(TAG_RULES).map(([key, values]) => {
    const pattern = Object.keys(values).join('|');
    return `  nwr${around}["${key}"~"^(${pattern})$"];`;
  });
  return `[out:json][timeout:30];\n(\n${filters.join('\n')}\n);\nout center tags;`;
}

function distanceMeters(from, to) {
  const toRadians = value => value * Math.PI / 180;
  const earthRadius = 6371000;
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(a));
}

function formatDistance(meters) {
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  return `${(meters / 1000).toFixed(1).replace(/\.0$/, '')} km`;
}

function classify(tags = {}) {
  for (const [key, values] of Object.entries(TAG_RULES)) {
    const rule = values[tags[key]];
    if (rule) return { field: rule[0], kind: rule[1] };
  }
  return null;
}

// "🏫 Primaria Benito Juárez — 140 m"; sin nombre registrado se usa el tipo: "🚏 Parada de autobús — 180 m".
function describe(item) {
  return `${KIND_ICONS[item.kind] || '📍'} ${item.name || item.kind} — ${formatDistance(item.distance)}`;
}

// Por campo: el más cercano de cada tipo (para que el hospital no quede oculto tras varias farmacias), ordenado por distancia.
function summarizeElements(elements, origin, consultedAt) {
  const byField = Object.fromEntries(Object.keys(CATEGORY_FIELDS).map(field => [field, new Map()]));
  for (const element of elements) {
    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;
    const category = classify(element.tags);
    if (!category || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    const item = {
      kind: category.kind,
      name: String(element.tags.name || '').trim(),
      distance: distanceMeters(origin, { latitude, longitude })
    };
    const nearestOfKind = byField[category.field].get(item.kind);
    if (!nearestOfKind || item.distance < nearestOfKind.distance) byField[category.field].set(item.kind, item);
  }

  const dateText = consultedAt.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Mexico_City' });
  const sourceNote = `Fuente: OpenStreetMap, ${dateText} · distancias en línea recta.`;
  const fields = {};
  const categories = {};
  const summaryLines = [];
  for (const [field, label] of Object.entries(CATEGORY_FIELDS)) {
    const items = [...byField[field].values()].sort((a, b) => a.distance - b.distance).slice(0, MAX_ITEMS_PER_FIELD);
    categories[field] = items.map(item => ({ ...item, icon: KIND_ICONS[item.kind] || '📍', distance: Math.round(item.distance) }));
    const lines = items.length ? items.map(describe) : [`Sin registro a menos de ${formatDistance(SEARCH_RADIUS_M)}.`];
    if (field === 'urbServicios') lines.push('Agua, drenaje, electricidad y alumbrado: verificar en campo.');
    fields[field] = [...lines, sourceNote].join('\n');
    summaryLines.push(items.length ? describe(items[0]) : `${label}: sin registro a menos de ${formatDistance(SEARCH_RADIUS_M)}`);
  }
  fields.equipamientoUrbano = [...summaryLines, sourceNote].join('\n');
  return { fields, categories };
}

async function requestOverpass(query, fetchImpl) {
  const failures = [];
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': process.env.NOMINATIM_USER_AGENT || 'AVALUO-FORMATO/1.0 (real-estate valuation form)'
        },
        body: new URLSearchParams({ data: query }).toString(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
      const body = await response.text();
      if (!response.ok) throw new Error(`estado ${response.status}`);
      const data = JSON.parse(body);
      if (!Array.isArray(data.elements)) throw new Error('respuesta sin elementos');
      return data.elements;
    } catch (error) {
      failures.push(`${new URL(endpoint).hostname}: ${error.name === 'TimeoutError' ? 'sin respuesta' : error.message}`);
    }
  }
  const error = new Error(`Los servidores de OpenStreetMap están saturados o sin respuesta (${failures.join('; ')}). Intente de nuevo en unos minutos.`);
  error.statusCode = 503;
  throw error;
}

async function lookupUrbanEquipment(latitude, longitude, { fetchImpl = fetch, now = () => new Date() } = {}) {
  const coordinates = normalizeCoordinates(latitude, longitude);
  const key = `${coordinates.latitude.toFixed(5)},${coordinates.longitude.toFixed(5)}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) return cached.value;
  if (pendingRequests.has(key)) return pendingRequests.get(key);

  const request = requestOverpass(buildQuery(coordinates), fetchImpl).then(elements => {
    const value = {
      coordinates,
      radius: SEARCH_RADIUS_M,
      elementCount: elements.length,
      ...summarizeElements(elements, coordinates, now()),
      source: 'OpenStreetMap contributors, Overpass API',
      attribution: '© OpenStreetMap contributors (ODbL)'
    };
    cache.set(key, { value, createdAt: Date.now() });
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
    return value;
  }).finally(() => pendingRequests.delete(key));
  pendingRequests.set(key, request);
  return request;
}

module.exports = { lookupUrbanEquipment, summarizeElements, buildQuery, formatDistance, distanceMeters, CATEGORY_FIELDS };
