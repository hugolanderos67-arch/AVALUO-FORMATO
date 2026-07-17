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

## Notas de cumplimiento
- Se deja preparada la estructura para integrar reglas SHF/INDAABIN.
- La lógica de homologación debe ampliarse con factores regulatorios y validaciones de documentos.
