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
- Tabla `avaluos` para datos administrativos y físicos del inmueble.
- Tabla `comparables` para inmuebles de referencia de la zona.
- Tabla `fotos` para multimedia y metadatos SHF.

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
- OpenStreetMap puede asociar la coordenada con el objeto cartográfico adecuado más cercano; confirma la ubicación en campo. La geocodificación no proporciona zonificación oficial, población censal, densidad permitida, nivel socioeconómico, ancho de calle, banquetas ni equipamiento con distancias. Completa esos campos con fuentes oficiales o verificación documental.
- Conserva la atribución a OpenStreetMap indicada en el formato y atiende su [política de uso de Nominatim](https://operations.osmfoundation.org/policies/nominatim/).
- En el apartado urbano se pueden seleccionar hasta cinco archivos PDF, DOCX o TXT, de máximo 15 MB por archivo. El texto se extrae en memoria; se muestran únicamente coincidencias con etiquetas reconocidas, junto con archivo y evidencia, para que la persona valuadora seleccione qué valores aplicar. Los campos con captura previa no se sobrescriben. PDF escaneados requieren OCR externo.

## Notas de cumplimiento
- Se deja preparada la estructura para integrar reglas SHF/INDAABIN.
- La lógica de homologación debe ampliarse con factores regulatorios y validaciones de documentos.
