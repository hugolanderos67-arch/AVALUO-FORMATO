# Seguimiento SHF: identificación del inmueble

Actualización: 2026-10-07  
Alcance revisado: sección I, "Antecedentes", sección II, "Características urbanas y ubicación", y su representación en el reporte de `AVALUO-FORMATO.html`.

## Aplicabilidad y fuentes

- Supuesto de trabajo: inmueble residencial y avalúo para un crédito garantizado a la vivienda. El formato muestra uso residencial y referencia SHF/INDAABIN, pero el propósito regulatorio del encargo no está confirmado. Si el dictamen es para otro fin, revalidar aplicabilidad antes de cerrar requisitos.
- Fuente normativa a contrastar: SHF, *Reglas de carácter general que establecen la metodología para la valuación de inmuebles objeto de créditos garantizados a la vivienda*, junto con sus modificaciones y anexos vigentes.
- Consulta oficial: [SHF en gob.mx](https://www.gob.mx/shf) y [Diario Oficial de la Federación](https://www.dof.gob.mx/).
- Límite de esta actualización: no se pudo recuperar el texto oficial con sus modificaciones ni confirmar numerales/anexos. Por ello, las filas siguientes son criterios de revisión de identificación, no afirmaciones de obligaciones SHF ya verificadas. Completar fuente, versión, numeral y cita textual antes de marcarlas como requisito confirmado.

## Matriz de seguimiento

| Criterio de identificación por contrastar | Evidencia actual en el formato | Estado de implementación | Estado normativo | Acción / aceptación |
| --- | --- | --- | --- | --- |
| Identificación inequívoca por domicilio: vialidad y número, colonia/localidad, municipio o demarcación, entidad y código postal, según aplique | Captura calle y número, colonia, municipio y estado. No hay código postal ni campo separado para localidad. | Parcial | Por verificar en fuente SHF vigente | Confirmar campos exigidos y tratamiento de localidades; agregar los faltantes aplicables y mostrar el domicilio completo en el reporte. |
| Identificadores catastrales | Captura cuenta predial y clave catastral. El reporte de antecedentes no incluye clave catastral. | Parcial | Por verificar en fuente SHF vigente | Confirmar cuáles identificadores aplican; reflejar en el reporte los datos exigibles capturados. |
| Identificación legal y titularidad | Captura propietario, número de escritura, notario, foja registral y Registro Público/libertad de gravamen. No hay campo para régimen de propiedad. | Parcial | Por verificar en fuente SHF vigente | Confirmar datos documentales exigidos; incorporar régimen de propiedad si aplica y vincular cada dato con su documento fuente. |
| Georreferencia/localización | Captura coordenadas como texto y también latitud/longitud en Ubicación; el reporte usa coordenadas de texto o latitud/longitud como alternativa. No valida formato, datum ni consistencia. | Parcial | Por verificar en fuente SHF vigente | Confirmar formato y evidencia exigidos; validar coordenadas y mostrarlas de forma inequívoca. |
| Superficie, medidas y colindancias e identificación de su fuente | Captura "Medidas y colindancias según" en Antecedentes; medidas y colindancias se capturan también en Terreno. | Parcial | Por verificar en fuente SHF vigente | Confirmar qué datos y fuentes documentales deben constar en identificación; evitar confundir la referencia de la fuente con la descripción de medidas. |
| Correspondencia entre captura y reporte | La captura contiene folio del expediente y clave catastral, pero el arreglo `antecedentes` que alimenta `reportAntecedentes` no incluye esos dos datos. Los campos de identificación admiten valores vacíos. | Brecha funcional | No es una conclusión normativa | Definir obligatoriedad tras cotejar la norma y asegurar que los datos aplicables se impriman; añadir validación antes de emitir el dictamen. |
| Ausencia de datos de ejemplo en el dictamen | Calle, colonia, municipio y estado tienen valores precargados de ejemplo. | Riesgo de emisión | Buena práctica de control; no atribuir a SHF sin fuente | Sustituir los valores por campos vacíos o marcadores no imprimibles antes de usar el formato en casos reales. |

## Próximos pasos

1. Confirmar el propósito del avalúo y que aplica el régimen de créditos garantizados a la vivienda.
2. Recuperar la versión vigente de la disposición SHF y sus modificaciones/anexos desde una fuente oficial; completar por fila la referencia exacta y clasificar cada elemento como obligatorio, condicional o no exigido.
3. Resolver primero las brechas de reporte (clave catastral y folio) y los valores precargados, una vez confirmada su aplicabilidad; agregar pruebas de renderizado/captura para los datos que deban constar.

## Evidencia local revisada

- `AVALUO-FORMATO.html`: captura de Antecedentes y Ubicación; armado de `antecedentes`; renderizado mediante `renderReportData('reportAntecedentes', antecedentes)`.
