CREATE TABLE IF NOT EXISTS avaluos (
  id SERIAL PRIMARY KEY,
  solicitante VARCHAR(255) NOT NULL,
  cuenta_predial VARCHAR(50),
  clave_catastral VARCHAR(50),
  numero_escritura VARCHAR(50),
  notario VARCHAR(255),
  tomo VARCHAR(50),
  fecha_inscripcion DATE,
  calle VARCHAR(255),
  numero VARCHAR(20),
  colonia VARCHAR(255),
  codigo_postal VARCHAR(10),
  municipio VARCHAR(255),
  estado VARCHAR(255),
  latitud DECIMAL(10,7),
  longitud DECIMAL(10,7),
  superficie_terreno DECIMAL(12,2),
  superficie_construccion DECIMAL(12,2),
  edad_inmueble INT,
  estado_conservacion VARCHAR(100),
  calidad_proyecto VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS comparables (
  id SERIAL PRIMARY KEY,
  avaluo_id INT REFERENCES avaluos(id),
  direccion VARCHAR(255),
  precio_venta DECIMAL(12,2),
  superficie DECIMAL(12,2),
  zona_factor DECIMAL(8,4),
  ubicacion_factor DECIMAL(8,4),
  terreno_factor DECIMAL(8,4),
  edad_factor DECIMAL(8,4),
  forma_factor DECIMAL(8,4),
  valor_homologado DECIMAL(12,2)
);

CREATE TABLE IF NOT EXISTS fotos (
  id SERIAL PRIMARY KEY,
  avaluo_id INT REFERENCES avaluos(id),
  tipo VARCHAR(100) NOT NULL,
  ruta_archivo VARCHAR(500) NOT NULL,
  etiqueta_shf VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
