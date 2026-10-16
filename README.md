# AVALUO-FORMATO

Formato para elaboración de avalúos inmobiliarios.

## Arquitectura propuesta

### Frontend
- HTML/CSS/JS simple para captura de datos y vista de resultados.
- Se puede reemplazar por React o Vue en una siguiente fase.

### Backend
- Node.js + HTTP Server para exponer la API de valuación.
- Lógica de homologación en backend/valuation/homologation.js.

### Base de datos
- SQLite mediante el módulo `node:sqlite` incluido en Node.js 24 (sin dependencias adicionales). Esquema en `backend/db/schema.sql`.
- Tabla `avaluos`: la captura completa se guarda como JSON en `datos`; folio, fechas, solicitante, ubicación y valor concluido se guardan además en columnas para listar y buscar.
- Tabla `archivos`: fotografías, imágenes de comparables, firma y logotipo. Las imágenes se guardan en disco y la captura solo conserva su referencia (`/api/archivos/{id}`).
- Los datos viven en la carpeta `data/` (base `avaluos.db` y carpeta `archivos/`), excluida de git. Para respaldar todos los avalúos, copie esa carpeta con el servidor detenido. Se puede cambiar la ubicación con la variable `AVALUOS_DATA_DIR`.
- API: `GET/POST /api/avaluos`, `GET/PUT/DELETE /api/avaluos/{id}` y `GET /api/archivos/{id}`.

### Fórmulas
- Valor homologado por comparable:
  - $V_h = P_v \times F_z \times F_n \times F_t \times F_e \times F_f$
- Valor unitario por metro cuadrado:
  - $V_u = V_h / S$
- Valor final estimado del inmueble:
  - $V_f = V_u \times S_{objeto}$

## Ejecución
- `npm test`
- `node server.js`

## Ubicación por coordenadas
- Al capturar latitud y longitud WGS84, el formato consulta Nominatim para obtener la referencia cartográfica más cercana y completar calle, colonia, municipio, estado y contexto vial cuando estén disponibles.
- La ubicación se presenta en un mapa con marcador. Las teselas visibles se solicitan al servicio estándar de OpenStreetMap, se sirven desde el backend con caché y conservan la atribución requerida.
- La consulta se activa por captura del usuario, utiliza caché en memoria y limita su frecuencia. Se puede cambiar el endpoint con `NOMINATIM_URL`; personalizar la identificación HTTP con `NOMINATIM_USER_AGENT` y definir un contacto con `NOMINATIM_EMAIL`.
- OpenStreetMap puede asociar la coordenada con el objeto cartográfico adecuado más cercano; confirma la ubicación en campo. La geocodificación no proporciona zonificación oficial, población censal, densidad permitida, nivel socioeconómico, ancho de calle ni banquetas. Completa esos campos con fuentes oficiales o verificación documental.
- Equipamiento urbano: con las coordenadas se consulta la API Overpass de OpenStreetMap en un radio de 2 km y se llenan las casillas de educación, cultura, salud, comercio y abasto, transporte, recreación y deporte, seguridad pública, infraestructura y servicios, y el resumen de equipamiento, con el lugar más cercano de cada tipo y su distancia en línea recta. Solo se llenan casillas vacías o llenadas por una búsqueda anterior; lo escrito a mano se respeta. Se prueban varios servidores públicos de Overpass en orden (o uno propio con `OVERPASS_URL`) y los resultados se guardan en memoria 7 días. Las redes de agua, drenaje, electricidad y alumbrado no provienen de esta fuente.
- Conserva la atribución a OpenStreetMap indicada en el formato y atiende su [política de uso de Nominatim](https://operations.osmfoundation.org/policies/nominatim/).
- En el apartado urbano se pueden seleccionar hasta cinco archivos PDF, DOCX o TXT, de máximo 100 MB por archivo. El texto se extrae en memoria; se muestran únicamente coincidencias con etiquetas reconocidas, junto con archivo y evidencia, para que la persona valuadora seleccione qué valores aplicar. Los campos con captura previa no se sobrescriben. PDF escaneados requieren OCR externo.

## Banco de comparables
- Pantalla en `/comparables` (botón "🏘️ Comparables" del formato), separada en construcción, terreno y renta, con filtros por tipo de inmueble, municipio, antigüedad del dato y búsqueda; mediana, promedio y rango del valor unitario; captura y edición directa, y exportación CSV.
- Al guardar un avalúo, cada comparable con precio y superficie se agrega o actualiza en la tabla `banco_comparables` (clave `avalúo:grupo:índice`, sin duplicar). Cada tarjeta de comparable tiene "Datos para el banco de comparables": tipo de dato (oferta, venta, renta), fecha, fuente o enlace, coordenadas y, en construcción, edad y superficie de terreno. Sin coordenadas propias, se ubica en la zona del inmueble sujeto (marcado como aproximado).
- Lo que se edita o quita en el banco no se sobrescribe ni regresa con los siguientes guardados del avalúo. Al eliminar un avalúo, sus comparables permanecen en el banco (sin sus fotos).
- API: `GET/POST /api/comparables` (filtros `categoria`, `tipo`, `municipio`, `q`) y `PUT/DELETE /api/comparables/{id}`.

## Estadísticas
- Tablero en `/estadisticas` (botón "📊 Estadísticas" del formato), calculado en vivo desde la base de datos (`GET /api/estadisticas`): valor total, promedio y mediano concluido, valor unitario promedio, avalúos por mes, valor promedio por tipo de inmueble, $/m² por municipio o colonia, enfoque concluido y solicitantes, con filtros por periodo, tipo, municipio y estado, y tabla de detalle.
- El valor unitario se calcula sobre la superficie construida; en terrenos sin construcción, sobre la superficie de terreno.
- "Exportar CSV" descarga la selección filtrada en UTF-8 para abrirla en Excel o Power BI.

## App móvil para la visita de campo
- Página instalable en `/movil` (`mobile/`): captura descripción general, elementos de la construcción, acabados e instalaciones, más fotos, croquis y notas. Las listas y opciones se leen del propio formato (`AVALUO-FORMATO.html` y `frontend/finishes-catalog.js`), así que cualquier cambio en el formato llega solo a la app.
- Funciona sin señal: un service worker (`movil-sw.js`) guarda la app y el formato, y las visitas con sus fotos (reducidas a 1600 px en JPEG) se guardan en el celular (IndexedDB).
- Al sincronizar, las fotos se suben a `/api/cargas` y la visita se envía a `POST /api/visitas`: crea un avalúo nuevo o se aplica a uno existente. Los valores capturados en campo reemplazan a los del avalúo (los vacíos no borran nada), las fotos y croquis se agregan, y las notas llegan a "Notas de la visita de campo" (sección V, no se imprimen). Cada visita tiene un identificador para no aplicarse dos veces.
- Cada avalúo lleva un número de revisión: si una visita se sincroniza mientras el avalúo está abierto en la computadora, al guardar se avisa en lugar de sobrescribir lo que llegó del celular.
- Acceso desde el celular con Tailscale (HTTPS privado, solo para los dispositivos de la cuenta): instalar Tailscale en la PC y en el celular con la misma cuenta, activar "MagicDNS" y "HTTPS Certificates" en login.tailscale.com/admin/dns, y en la PC ejecutar una vez `tailscale serve --bg http://127.0.0.1:3000`. La app queda en `https://<nombre-de-la-pc>.<red>.ts.net/movil`.
- El servidor escucha solo en este equipo (`127.0.0.1`); con `HOST=0.0.0.0` vuelve a aceptar conexiones de la red local, sin cifrado.

## Extracción de datos de documentos PDF con IA
- En Anexos, los PDF de croquis y documentos muestran el botón "Extraer datos". Se eligen las páginas a enviar y se confirma que los datos personales están tapados de forma permanente; el servidor recorta el PDF a esas páginas y lo envía al modelo Claude de Anthropic (`claude-opus-5-5` por omisión; se cambia con `ANTHROPIC_MODEL`), con respaldo automático de modelo si la solicitud es declinada.
- Los anexos se suben al servidor al agregarlos (`POST /api/cargas`, hasta 200 MB por archivo; ajustable con `MAX_UPLOAD_MB`) y se ligan al avalúo al guardarlo; las subidas que nunca se guardan se depuran a las 48 horas. La API de Anthropic admite unos 32 MB por solicitud, por lo que las páginas enviadas en cada extracción deben sumar ~22 MB o menos; con documentos más pesados se extrae por tramos de páginas.
- Cada dato propuesto trae la cita textual y la página. Si el PDF tiene texto seleccionable, el servidor comprueba que la cita exista; los datos sin cita comprobable quedan desmarcados. En PDF escaneados las citas no se pueden comprobar automáticamente y deben revisarse contra el documento.
- Los datos solo se aplican a campos vacíos y quedan registrados con su cita en Antecedentes del dictamen.
- Requiere la variable de entorno `ANTHROPIC_API_KEY` en el equipo del servidor. En Windows (PowerShell): `[Environment]::SetEnvironmentVariable('ANTHROPIC_API_KEY', 'su-clave', 'User')`, y después cerrar y volver a abrir `start-server.bat`. La clave nunca se escribe en el código.

## Notas de cumplimiento
- Se deja preparada la estructura para integrar reglas SHF/INDAABIN.
- La lógica de homologación debe ampliarse con factores regulatorios y validaciones de documentos.
