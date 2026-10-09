(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TechnicalDescriptions = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CONSERVATION_STATES = [
    { value: 'B', label: 'Bueno' },
    { value: 'R', label: 'Regular' },
    { value: 'M', label: 'Malo' },
    { value: 'O', label: 'Obsoleto' },
    { value: 'NV', label: 'No visible' },
    { value: 'ND', label: 'No determinado' }
  ];

  const FOUNDATION_CATALOG = {
    'Zapata aislada': 'Cimentación a base de zapatas aisladas de concreto armado, vinculadas mediante trabes de cimentación.',
    'Zapata corrida': 'Cimentación corrida de concreto, mampostería o concreto armado, bajo muros de carga.',
    'Losa de cimentación': 'Cimentación mediante losa de concreto armado que distribuye las cargas sobre el terreno.',
    Pilotes: 'Cimentación profunda mediante pilotes de concreto, acero u otro material.',
    'Cimentación de mampostería': 'Cimentación tradicional a base de mampostería de piedra o tabique.',
    'Cimentación ciclópea': 'Cimentación de concreto con incorporación de piedra de tamaño adecuado.'
  };

  const VERTICAL_STRUCTURE_CATALOG = {
    'Muros de carga': 'Muros de mampostería que reciben y transmiten cargas verticales y, en su caso, laterales.',
    'Muros de tabique': 'Sistema estructural basado en muros de tabique de barro o concreto.',
    'Muros de block': 'Muros estructurales de block de concreto.',
    'Castillos y dalas': 'Sistema de mampostería confinada mediante castillos y dalas de concreto armado.',
    'Marcos de concreto armado': 'Sistema estructural formado por columnas y trabes de concreto armado.',
    'Marcos de acero': 'Estructura constituida por columnas y vigas de perfiles de acero estructural.',
    'Estructura metálica ligera': 'Sistema mediante perfiles metálicos ligeros, común en ampliaciones y construcciones de menor peso.',
    'Muros de concreto armado': 'Elementos verticales de concreto reforzado que trabajan como elementos estructurales.'
  };

  const SURFACE_CATALOG = {
    'Losa maciza': 'Elemento horizontal de concreto armado de sección maciza.',
    'Losa aligerada': 'Elemento horizontal de concreto armado con aligerantes.',
    'Losa reticular': 'Losa de concreto armado con nervaduras dispuestas en retícula.',
    'Losa de vigueta y bovedilla': 'Sistema de losa integrado por viguetas y piezas de aligeramiento tipo bovedilla.',
    'Losa de concreto prefabricada': 'Sistema horizontal integrado por elementos prefabricados de concreto.',
    'Cubierta metálica': 'Sistema de cubierta con componentes metálicos.',
    'Cubierta de lámina': 'Cubierta conformada con lámina.',
    'Cubierta de teja': 'Cubierta con acabado de teja.'
  };

  const SPECIAL_INSTALLATIONS = [
    { category: 'Telecomunicaciones y comunicación', items: [
      ['Telefonía', 'Instalación destinada al servicio de telefonía.'],
      ['Voz y datos', 'Instalación para conducción de servicios de voz y datos.'],
      ['Red informática', 'Red para interconexión de equipos informáticos.'],
      ['Televisión y distribución de señal', 'Instalación para recepción y distribución de señal de televisión.'],
      ['Fibra óptica', 'Red de comunicación mediante fibra óptica.'],
      ['Intercomunicación', 'Sistema de intercomunicación entre espacios o accesos.']
    ] },
    { category: 'Seguridad y vigilancia', items: [
      ['Circuito cerrado de televisión', 'Sistema de videovigilancia mediante circuito cerrado de televisión.'],
      ['Alarma contra intrusión', 'Sistema de alarma para detección de intrusión.'],
      ['Control electrónico de acceso', 'Sistema electrónico para control de acceso.'],
      ['Videoportero', 'Sistema de comunicación y video asociado al acceso.'],
      ['Cerco eléctrico', 'Sistema perimetral de protección mediante cerco eléctrico.'],
      ['Detección de movimiento', 'Sistema para detección de movimiento.']
    ] },
    { category: 'Protección contra incendios', items: [
      ['Detección y alarma', 'Sistema para detección y aviso de incendio.'],
      ['Rociadores automáticos', 'Sistema fijo de protección contra incendio mediante rociadores automáticos.'],
      ['Hidrantes y gabinetes', 'Equipamiento fijo para atención de incendios mediante hidrantes y gabinetes.'],
      ['Extintores portátiles', 'Equipamiento de protección contra incendio mediante extintores portátiles.'],
      ['Extracción de humo', 'Sistema mecánico para extracción de humo.']
    ] },
    { category: 'Climatización y ventilación mecánica', items: [
      ['Aire acondicionado minisplit', 'Sistema de acondicionamiento de aire tipo minisplit.'],
      ['Aire acondicionado tipo paquete', 'Sistema de acondicionamiento de aire tipo paquete.'],
      ['Sistema central', 'Sistema central de climatización.'],
      ['Ventilación mecánica', 'Sistema mecánico de renovación o circulación de aire.'],
      ['Extracción de aire en cocinas', 'Sistema mecánico para extracción de aire en cocinas.'],
      ['Ventilación de estacionamientos', 'Sistema mecánico de ventilación para estacionamientos.']
    ] },
    { category: 'Transporte vertical y movilidad', items: [
      ['Elevador de pasajeros', 'Equipo de transporte vertical para pasajeros.'],
      ['Elevador de carga', 'Equipo de transporte vertical para carga.'],
      ['Montacargas', 'Equipo destinado al movimiento vertical de carga.'],
      ['Escaleras eléctricas', 'Equipo de transporte mediante escaleras eléctricas.'],
      ['Plataforma elevadora', 'Equipo de elevación mediante plataforma.']
    ] },
    { category: 'Automatización y control', items: [
      ['Automatización residencial', 'Sistema de automatización para funciones residenciales.'],
      ['Control de iluminación', 'Sistema para control de iluminación.'],
      ['Automatización de portones', 'Sistema automatizado para operación de portones.'],
      ['Control centralizado de edificios', 'Sistema centralizado para supervisión o control de instalaciones del edificio.']
    ] },
    { category: 'Generación y respaldo de energía', items: [
      ['Sistema fotovoltaico', 'Sistema de generación eléctrica fotovoltaica.'],
      ['Almacenamiento mediante baterías', 'Sistema de almacenamiento de energía mediante baterías.'],
      ['Planta generadora de emergencia', 'Equipo generador para suministro eléctrico de emergencia.'],
      ['Sistema UPS', 'Sistema de alimentación ininterrumpida (UPS).'],
      ['Transferencia eléctrica', 'Sistema para transferencia de alimentación eléctrica.']
    ] },
    { category: 'Instalaciones hidráulicas especiales', items: [
      ['Sistema hidroneumático', 'Sistema hidroneumático para presurización de agua.'],
      ['Sistema de bombeo', 'Sistema de bombeo para conducción o suministro de agua.'],
      ['Tratamiento y filtración de agua', 'Sistema para tratamiento y filtración de agua.'],
      ['Suavización de agua', 'Sistema para suavización de agua.'],
      ['Captación pluvial', 'Sistema para captación de agua pluvial.']
    ] },
    { category: 'Instalaciones recreativas y equipamiento especializado', items: [
      ['Calefacción', 'Sistema de calefacción.'],
      ['Calefacción de alberca', 'Sistema de calefacción para alberca.'],
      ['Filtración de alberca', 'Sistema de filtración para alberca.'],
      ['Riego automatizado', 'Sistema automatizado de riego.'],
      ['Sonido ambiental', 'Sistema de sonido ambiental.']
    ] }
  ].map(group => ({
    category: group.category,
    items: group.items.map(([name, description]) => ({ name, description }))
  }));

  const SPECIAL_FUNCTION_STATES = [
    { value: 'normal', label: 'Funcionamiento aparente normal' },
    { value: 'observations', label: 'Funcionamiento con observaciones' },
    { value: 'deficient', label: 'Funcionamiento deficiente aparente' },
    { value: 'unverifiable', label: 'Funcionamiento no verificable' },
    { value: 'out_of_service', label: 'Fuera de servicio' }
  ];

  const STATE_TEXT = {
    B: 'bueno', R: 'regular', M: 'malo', O: 'obsoleto', NV: 'no visible', ND: 'no determinado'
  };

  function clean(value) {
    return value == null ? '' : String(value).trim();
  }

  function joinSentence(label, values) {
    const parts = values.map(clean).filter(Boolean);
    return parts.length ? `${label}: ${parts.join('; ')}.` : '';
  }

  function catalogDescription(label, selection, catalog) {
    const concept = clean(selection);
    return concept && catalog[concept] ? `${label} (${concept}): ${catalog[concept]}` : '';
  }

  function generateConstructionDescriptions(input) {
    return {
      cimentacion: catalogDescription('Cimentación', input.cimentacion, FOUNDATION_CATALOG),
      estructuraVertical: catalogDescription('Estructura vertical', input.estructuraVertical, VERTICAL_STRUCTURE_CATALOG),
      entrepisos: catalogDescription('Entrepiso', input.entrepisos, SURFACE_CATALOG),
      techumbres: catalogDescription('Techumbre', input.techumbres, SURFACE_CATALOG)
    };
  }

  function generateHydraulicDescription(input) {
    const parts = [];
    const material = clean(input.materialRedHidraulica);
    const supply = clean(input.abastecimientoHidraulico);
    const storage = clean(input.almacenamientoHidraulico);
    const pressure = clean(input.presurizacionHidraulica);
    const hotWater = clean(input.aguaCalienteHidraulica);
    const distribution = [];
    if (material && !['No visible', 'No determinado'].includes(material)) distribution.push(`mediante tubería de ${material.toLowerCase()}`);
    if (supply && !['No determinado'].includes(supply)) distribution.push(`abastecida por ${supply.toLowerCase()}`);
    if (storage && !['No determinado'].includes(storage)) {
      distribution.push(storage === 'Sin almacenamiento' ? 'sin almacenamiento' : `con almacenamiento en ${storage.toLowerCase().replace(' + ', ' más ')}`);
    }
    if (pressure && !['No determinado'].includes(pressure)) distribution.push(`presurización por ${pressure.toLowerCase()}`);
    if (distribution.length) parts.push(`Red de distribución de agua fría ${distribution.join(', ')}`);
    if (hotWater && hotWater !== 'No cuenta') {
      const heater = {
        Gas: 'calentador de gas',
        Eléctrico: 'calentador eléctrico',
        Solar: 'calentador solar',
        'De paso': 'calentador de paso',
        'Solar + respaldo': 'sistema solar con respaldo',
        'Solar más respaldo': 'sistema solar con respaldo'
      }[hotWater] || `sistema ${hotWater.toLowerCase()}`;
      parts.push(`agua caliente mediante ${heater}`);
    } else if (hotWater === 'No cuenta') {
      parts.push('sin sistema de agua caliente seleccionado');
    }
    if (!parts.length) return '';
    const state = STATE_TEXT[clean(input.estadoConservacionHidraulica)];
    return `Instalación hidráulica: ${parts.join('; ')}${state ? ` (estado de conservación: ${state})` : ''}.`;
  }

  function generateSanitaryDescription(input) {
    const parts = [];
    const discharge = clean(input.sistemaDesalojoSanitario);
    const material = clean(input.materialTuberiaSanitaria);
    const drainage = clean(input.drenajeInteriorSanitario);
    const records = clean(input.registrosSanitario);
    const ventilation = clean(input.ventilacionSanitaria);
    const greaseTrap = clean(input.trampaGrasas);
    const rainwater = clean(input.sistemaPluvialSanitario);
    if (discharge && !['No determinado'].includes(discharge)) parts.push(`desalojo de aguas residuales mediante ${discharge.toLowerCase()}`);
    if (material && !['No visible'].includes(material)) parts.push(`tubería de ${material}`);
    if (drainage && !['No visible'].includes(drainage)) parts.push(`drenaje interior de ${drainage}`);
    if (records === 'Sí') parts.push('registros de inspección');
    if (ventilation === 'Sí') parts.push('ventilación sanitaria');
    if (greaseTrap === 'Sí') parts.push('trampa de grasas');
    if (rainwater && !['No determinado'].includes(rainwater)) parts.push(`manejo pluvial mediante ${rainwater.toLowerCase()}`);
    const additional = clean(input.elementosAdicionalesSanitarios);
    if (additional) parts.push(additional);
    if (!parts.length) return '';
    const state = STATE_TEXT[clean(input.estadoConservacionSanitaria)];
    return `Instalación sanitaria: ${parts.join(', ')}${state ? ` (estado de conservación: ${state})` : ''}.`;
  }

  function generateGasDescription(input) {
    const fuel = clean(input.combustibleGas || input.instalacionGasGeneral);
    if (!fuel) return '';
    if (fuel === 'No cuenta') return 'Instalación de gas: no se cuenta con una instalación fija de gas.';
    const parts = [fuel];
    const supply = clean(input.almacenamientoGas);
    if (supply && supply !== 'No aplica') {
      const isLpStorage = ['Cilindro portátil', 'Tanque estacionario'].includes(supply);
      if (!isLpStorage || fuel === 'Gas LP') {
        parts.push(supply === 'Red de distribución' ? 'suministro por red de distribución' : `suministro mediante ${supply.toLowerCase()}`);
      }
    }
    const material = clean(input.materialTuberiaGas);
    if (material && !['No visible'].includes(material)) parts.push(`tubería de ${material}`);
    const configuration = clean(input.tipoInstalacionGas);
    if (configuration && !['No visible', 'No determinada'].includes(configuration)) parts.push(`configuración ${configuration.toLowerCase()}`);
    const equipment = Array.isArray(input.equiposGas) ? input.equiposGas : [input.equiposGas];
    const selectedEquipment = equipment.map(clean).filter(item => item && item !== 'Otros');
    const otherEquipment = clean(input.otrosEquiposGas);
    if (otherEquipment) selectedEquipment.push(otherEquipment);
    if (selectedEquipment.length) parts.push(`para alimentar ${selectedEquipment.join(', ').toLowerCase()}`);
    const state = STATE_TEXT[clean(input.estadoConservacionGas)];
    return `Instalación de gas: ${parts.join(', ')}${state ? ` (estado de conservación: ${state})` : ''}.`;
  }

  function generateElectricDescription(input) {
    const parts = [];
    const supply = clean(input.alimentacionElectrica || input.instalacionElectricaGeneral);
    const conductors = clean(input.conductoresElectricos);
    const conduit = clean(input.canalizacionElectrica);
    const routing = clean(input.tipoInstalacionElectrica);
    if (supply && supply !== 'No determinada') parts.push(`alimentación ${supply.toLowerCase()}`);
    if (conductors && conductors !== 'No visible') {
      parts.push(`conductores de ${conductors.toLowerCase()}${conduit && conduit !== 'No visible' ? ` alojados en canalización ${conduit.toLowerCase()}` : ''}${routing ? `, instalación ${routing.toLowerCase()}` : ''}`);
    } else if (conduit && conduit !== 'No visible') {
      parts.push(`canalización ${conduit.toLowerCase()}${routing ? `, instalación ${routing.toLowerCase()}` : ''}`);
    }
    const distribution = clean(input.distribucionElectrica);
    if (distribution && !['No visible'].includes(distribution)) parts.push(distribution === 'Ambos' ? 'centro de carga y tablero de distribución' : distribution.toLowerCase());
    const protection = clean(input.proteccionElectrica);
    if (protection && !['No visible', 'Mixta'].includes(protection)) parts.push(`protección mediante ${protection.toLowerCase()}`);
    if (clean(input.tierraFisicaElectrica) === 'Sí') parts.push('sistema de puesta a tierra');
    if (clean(input.tierraFisicaElectrica) === 'No') parts.push('sin tierra física');
    const lighting = clean(input.iluminacionElectrica);
    if (lighting && !['No determinada'].includes(lighting)) parts.push(`salidas para iluminación ${lighting.toLowerCase()}`);
    if (!parts.length) return '';
    const state = STATE_TEXT[clean(input.estadoConservacionElectrica)];
    return `Instalación eléctrica: ${parts.join(', ')}${state ? ` (estado de conservación: ${state})` : ''}.`;
  }

  function generateSpecialDescription(input) {
    const description = clean(input.description);
    if (!description) return '';
    const parts = [description];
    const details = clean(input.details);
    if (details) parts.push(details);
    const state = STATE_TEXT[clean(input.conservation)];
    if (state) parts.push(`estado de conservación: ${state}`);
    const functionStatus = clean(input.functionStatus);
    const cannotConfirmNormal = ['O', 'NV', 'ND'].includes(clean(input.conservation));
    const functionText = {
      normal: 'funcionamiento aparente normal',
      observations: 'funcionamiento con observaciones',
      deficient: 'funcionamiento deficiente aparente',
      unverifiable: 'funcionamiento no verificable',
      out_of_service: 'instalación fuera de servicio'
    }[functionStatus];
    if (functionText && !(functionStatus === 'normal' && cannotConfirmNormal)) parts.push(functionText);
    return `Instalación especial: ${parts.join('; ')}.`;
  }

  return {
    CONSERVATION_STATES,
    FOUNDATION_CATALOG,
    VERTICAL_STRUCTURE_CATALOG,
    SURFACE_CATALOG,
    SPECIAL_INSTALLATIONS,
    SPECIAL_FUNCTION_STATES,
    generateConstructionDescriptions,
    generateHydraulicDescription,
    generateSanitaryDescription,
    generateGasDescription,
    generateElectricDescription,
    generateSpecialDescription,
    joinSentence
  };
});