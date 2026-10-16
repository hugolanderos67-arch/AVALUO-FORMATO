// Catálogo de acabados (secciones B, C, E y F) compartido por el formato de avalúo y la app móvil.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FinishesCatalog = api;
}(typeof self !== 'undefined' ? self : this, function () {
  const FINISH_GROUPS = [
    {
      title: 'B.- ) Revestimientos y acabados',
      fields: [
        ['acabadoAplanadosInteriores', 'Aplanados interiores', ['Yeso a regla y nivel', 'Yeso a plomo y regla', 'Mortero cemento-arena acabado fino', 'Mortero cemento-arena acabado rústico', 'Pasta texturizada', 'Tirol planchado', 'Panel de yeso (tablaroca)', 'Concreto aparente', 'Sin aplanado (block o tabique aparente)']],
        ['acabadoAplanadosExteriores', 'Aplanados exteriores', ['Mortero cemento-arena acabado fino', 'Mortero cemento-arena acabado rústico', 'Mortero cemento-arena acabado apalillado', 'Pasta texturizada', 'Recubrimiento de piedra', 'Fachaleta', 'Ladrillo aparente', 'Concreto aparente', 'Sin aplanado (block o tabique aparente)']],
        ['acabadoPlafones', 'Plafones', ['Yeso a regla y nivel', 'Tirol planchado', 'Tirol rústico', 'Pasta texturizada', 'Plafón falso de panel de yeso (tablaroca)', 'Plafón reticulado registrable', 'Duela o lambrín de madera', 'Concreto aparente', 'Lámina aparente']],
        ['acabadoLambrines', 'Lambrines', ['Azulejo', 'Cerámica', 'Porcelanato', 'Mármol', 'Cantera', 'Piedra natural', 'Madera', 'Pintura de esmalte', 'No cuenta']],
        ['acabadoPisos', 'Pisos', ['Cerámica', 'Porcelanato', 'Mármol', 'Granito', 'Terrazo', 'Mosaico de pasta', 'Loseta vinílica', 'Piso laminado', 'Alfombra', 'Concreto pulido', 'Concreto escobillado', 'Firme de concreto', 'Adoquín', 'Cantera']],
        ['acabadoZoclo', 'Zoclo', ['Del mismo material del piso', 'Cerámica', 'Porcelanato', 'Mármol', 'Madera', 'Vinílico', 'Pintura de esmalte', 'No cuenta']],
        ['acabadoEscaleras', 'Escaleras', ['Rampa de concreto armado con huella de cerámica', 'Rampa de concreto armado con huella de porcelanato', 'Rampa de concreto armado con huella de mármol', 'Rampa de concreto armado con huella de madera', 'Concreto aparente', 'Estructura metálica con huella de madera', 'Estructura metálica con huella de concreto', 'Helicoidal metálica', 'Madera', 'No cuenta']],
        ['acabadoPintura', 'Pintura', ['Vinílica en muros y plafones', 'Vinil-acrílica en fachadas', 'Elastomérica en fachadas', 'Esmalte en herrería', 'Esmalte en lambrines', 'Barniz en carpintería', 'Impermeabilizante en azoteas', 'Sin pintura']],
        ['acabadoRecubrimientosEspeciales', 'Recubrimientos especiales', ['Cantera', 'Piedra laja', 'Mármol', 'Mosaico veneciano', 'Recubrimiento cerámico en fachada', 'Madera', 'Tapiz', 'Lambrín de PVC', 'No cuenta']]
      ]
    },
    {
      title: 'C.- ) Carpintería',
      fields: [
        ['carpinteriaPuertas', 'Puertas', ['Principal de madera sólida', 'Principal metálica', 'Intercomunicación de tambor de pino', 'Intercomunicación de tambor de MDF', 'Intercomunicación de triplay de caoba', 'Madera sólida entablerada', 'Plegadizas de PVC', 'No cuenta']],
        ['carpinteriaCloset', 'Closet', ['Puertas y entrepaños de MDF', 'Puertas y entrepaños de melamina', 'Madera de pino', 'Triplay de caoba', 'Puertas corredizas', 'Abiertos sin puertas', 'Vestidor', 'No cuenta']],
        ['carpinteriaCocina', 'Cocina', ['Cocina integral de MDF', 'Cocina integral de melamina', 'Cocina integral de madera sólida', 'Muebles bajos y altos', 'Solo muebles bajos', 'Cubierta de granito', 'Cubierta de cuarzo', 'Cubierta de azulejo o cerámica', 'Cubierta de concreto', 'Tarja de acero inoxidable', 'Sin cocina integral']],
        ['carpinteriaOtrosAccesorios', 'Otros accesorios', ['Gabinetes de baño', 'Libreros', 'Barandal de madera', 'Pasamanos de madera', 'Lambrín de madera', 'No cuenta']],
        ['carpinteriaPisos', 'Pisos', ['Duela de madera', 'Parquet', 'Piso laminado', 'Deck de madera', 'No cuenta']]
      ]
    },
    {
      title: 'E.- ) Herrería y cancelería',
      fields: [
        ['herreriaCanceleria', 'Herrería y cancelería', ['Ventanería de aluminio natural', 'Ventanería de aluminio anodizado', 'Ventanería de aluminio en color', 'Ventanería de PVC', 'Ventanería de perfil tubular', 'Ventanería de fierro estructural', 'Cancel de baño de aluminio y vidrio', 'Cancel de baño de vidrio templado', 'Protecciones de herrería', 'Barandal de herrería', 'Portón de herrería', 'Puerta principal de herrería']]
      ]
    },
    {
      title: 'F.- ) Otros componentes',
      fields: [
        ['otrosVidrieria', 'Vidriería', ['Vidrio claro de 3 mm', 'Vidrio claro de 6 mm', 'Vidrio filtrasol', 'Vidrio templado', 'Vidrio esmerilado o translúcido', 'Vidrio reflejante', 'Doble vidrio', 'Espejos']],
        ['otrosCerrajeria', 'Cerrajería', ['Nacional de calidad económica', 'Nacional de calidad media', 'Nacional de buena calidad', 'Importada', 'Cerradura de embutir', 'Cerradura de sobreponer', 'Cerrojo de seguridad', 'Cerradura electrónica', 'Manijas tipo palanca']],
        ['otrosFachadas', 'Fachadas', ['Estilo contemporáneo', 'Estilo moderno', 'Estilo minimalista', 'Estilo colonial mexicano', 'Estilo tradicional', 'Sin estilo definido', 'Aplanado y pintura', 'Recubrimiento de piedra o cantera', 'Ladrillo aparente', 'Fachaleta', 'Muro cortina de vidrio']]
      ]
    }
  ];

  return { FINISH_GROUPS };
}));
