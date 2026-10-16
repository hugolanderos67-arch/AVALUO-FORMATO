-- Esquema SQLite. La captura completa se guarda como JSON en `datos`; las columnas
-- sueltas son las que se usan para listar y buscar avalúos.
CREATE TABLE IF NOT EXISTS avaluos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folio TEXT,
  fecha_avaluo TEXT,
  tipo_inmueble TEXT,
  solicitante TEXT,
  propietario TEXT,
  calle TEXT,
  colonia TEXT,
  municipio TEXT,
  estado TEXT,
  valor_concluido REAL,
  enfoque_concluido TEXT,
  datos TEXT NOT NULL,
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Archivos de la captura (fotos, comparables, firma, logotipo y documentos PDF o Word) guardados en disco.
CREATE TABLE IF NOT EXISTS archivos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  avaluo_id INTEGER NOT NULL REFERENCES avaluos(id) ON DELETE CASCADE,
  tipo_mime TEXT NOT NULL,
  ruta TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Anexos subidos directamente que aún no se guardan en un avalúo; al guardarlo pasan a `archivos`.
CREATE TABLE IF NOT EXISTS cargas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo_mime TEXT NOT NULL,
  ruta TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Banco de comparables: se alimenta de los comparables de cada avalúo guardado y de capturas directas.
-- `origen_clave` ("avalúo:grupo:índice") permite actualizar el mismo comparable en lugar de duplicarlo.
CREATE TABLE IF NOT EXISTS banco_comparables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  categoria TEXT NOT NULL CHECK (categoria IN ('construccion', 'terreno', 'renta')),
  tipo_inmueble TEXT,
  tipo_dato TEXT,
  direccion TEXT,
  colonia TEXT,
  municipio TEXT,
  estado TEXT,
  latitud REAL,
  longitud REAL,
  ubicacion_aproximada INTEGER NOT NULL DEFAULT 0,
  precio REAL NOT NULL,
  superficie REAL NOT NULL,
  superficie_terreno REAL,
  edad REAL,
  valor_unitario REAL NOT NULL,
  fecha_dato TEXT,
  fuente TEXT,
  notas TEXT,
  fotos TEXT NOT NULL DEFAULT '[]',
  origen_avaluo_id INTEGER,
  origen_clave TEXT UNIQUE,
  editado INTEGER NOT NULL DEFAULT 0,
  excluido INTEGER NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_banco_categoria ON banco_comparables(categoria, municipio);

-- Archivos propios del banco (evidencias y fotos): los capturados directamente en el banco y las copias
-- de los de un avalúo eliminado, para que la evidencia de la fuente no se pierda.
CREATE TABLE IF NOT EXISTS banco_archivos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comparable_id INTEGER,
  nombre TEXT,
  tipo_mime TEXT NOT NULL,
  ruta TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Datos predeterminados del valuador (un solo registro) que se cargan en cada avalúo nuevo.
-- Logotipo y firma se guardan como data URL dentro de `datos`.
CREATE TABLE IF NOT EXISTS perfil_valuador (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  datos TEXT NOT NULL,
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_archivos_avaluo ON archivos(avaluo_id);
CREATE INDEX IF NOT EXISTS idx_avaluos_actualizado ON avaluos(actualizado_en);
