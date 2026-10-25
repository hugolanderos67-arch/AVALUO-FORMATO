const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createAvaluosRepository } = require('../backend/db/avaluos-repository');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function createTempRepository(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avaluos-'));
  const repository = createAvaluosRepository({ databasePath: path.join(dir, 'avaluos.db'), filesDir: path.join(dir, 'archivos') });
  t.after(() => {
    repository.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { repository, dir };
}

test('guarda un avalúo nuevo, extrae las imágenes a disco y lo recupera', t => {
  const { repository } = createTempRepository(t);
  const saved = repository.save(null, {
    datos: { fields: { folioExpediente: 'AV-001', solicitante: 'Juan Pérez', municipio: 'Puebla' }, attachments: { photos: [{ name: 'fachada.png', preview: PNG }] } },
    resumen: { valorConcluido: 1500000, enfoque: 'Comparativo de mercado' }
  });

  assert.equal(saved.folio, 'AV-001');
  assert.equal(saved.valor_concluido, 1500000);
  const imageUrl = saved.datos.attachments.photos[0].preview;
  assert.match(imageUrl, /^\/api\/archivos\/\d+$/);
  const file = repository.getFile(imageUrl.split('/').pop());
  assert.equal(file.mimeType, 'image/png');
  assert.ok(fs.existsSync(file.path));
  assert.deepEqual(repository.get(saved.id).datos, saved.datos);
});

test('guarda documentos PDF junto con el avalúo', t => {
  const { repository } = createTempRepository(t);
  const saved = repository.save(null, { datos: { attachments: { documents: [{ name: 'escritura.pdf', file: 'data:application/pdf;base64,JVBERi0xLjQK' }] } } });
  const file = repository.getFile(saved.datos.attachments.documents[0].file.split('/').pop());
  assert.equal(file.mimeType, 'application/pdf');
  assert.equal(fs.readFileSync(file.path, 'latin1'), '%PDF-1.4\n');
});

test('al actualizar conserva las imágenes referenciadas y borra las que se quitaron', t => {
  const { repository } = createTempRepository(t);
  const first = repository.save(null, { datos: { valuerLogo: PNG, valuerSignature: PNG } });
  const logoUrl = first.datos.valuerLogo;
  const signatureFile = repository.getFile(first.datos.valuerSignature.split('/').pop());

  const second = repository.save(first.id, { datos: { valuerLogo: logoUrl, valuerSignature: '' } });
  assert.equal(second.datos.valuerLogo, logoUrl);
  assert.ok(fs.existsSync(repository.getFile(logoUrl.split('/').pop()).path));
  assert.equal(fs.existsSync(signatureFile.path), false);
});

test('copia las imágenes que provienen de otro avalúo', t => {
  const { repository } = createTempRepository(t);
  const original = repository.save(null, { datos: { valuerLogo: PNG } });
  const copy = repository.save(null, { datos: { valuerLogo: original.datos.valuerLogo } });

  assert.notEqual(copy.datos.valuerLogo, original.datos.valuerLogo);
  repository.remove(original.id);
  assert.ok(fs.existsSync(repository.getFile(copy.datos.valuerLogo.split('/').pop()).path));
});

test('busca por folio, solicitante o ubicación y elimina avalúos con sus archivos', t => {
  const { repository, dir } = createTempRepository(t);
  const first = repository.save(null, { datos: { fields: { folioExpediente: 'AV-100', colonia: 'Centro' }, valuerLogo: PNG } });
  repository.save(null, { datos: { fields: { folioExpediente: 'AV-200', solicitante: 'Banco Norte' } } });

  assert.equal(repository.list().length, 2);
  assert.deepEqual(repository.list('Centro').map(item => item.folio), ['AV-100']);
  assert.deepEqual(repository.list('norte').map(item => item.folio), ['AV-200']);

  assert.equal(repository.remove(first.id), true);
  assert.equal(repository.get(first.id), null);
  assert.equal(fs.existsSync(path.join(dir, 'archivos', String(first.id))), false);
  assert.equal(repository.remove(first.id), false);
});

function createUpload(repository, mimeType, content) {
  const target = repository.createUploadTarget(mimeType);
  fs.writeFileSync(target.absolutePath, content);
  return { url: repository.registerUpload(mimeType, target.relativePath, Buffer.byteLength(content)), path: target.absolutePath };
}

test('liga al avalúo los anexos subidos directamente, moviéndolos a su carpeta', t => {
  const { repository, dir } = createTempRepository(t);
  const upload = createUpload(repository, 'application/pdf', '%PDF-1.7 documento grande');
  assert.equal(repository.resolveFileUrl(upload.url).mimeType, 'application/pdf');

  const saved = repository.save(null, { datos: { attachments: { documents: [{ name: 'escritura.pdf', file: upload.url }] } } });
  const fileUrl = saved.datos.attachments.documents[0].file;
  assert.match(fileUrl, /^\/api\/archivos\/\d+$/);
  const stored = repository.resolveFileUrl(fileUrl);
  assert.equal(fs.readFileSync(stored.path, 'latin1'), '%PDF-1.7 documento grande');
  assert.ok(stored.path.startsWith(path.join(dir, 'archivos', String(saved.id))));
  assert.equal(fs.existsSync(upload.path), false);
  assert.equal(repository.resolveFileUrl(upload.url), null);
});

test('si el guardado falla, el anexo subido vuelve a su lugar para reintentar', t => {
  const { repository } = createTempRepository(t);
  const upload = createUpload(repository, 'application/pdf', '%PDF-1.7');
  assert.throws(() => repository.save(null, { datos: { a: upload.url, b: 'data:application/zip;base64,UEsDBA==' } }), error => error.statusCode === 415);
  assert.ok(fs.existsSync(upload.path));
  assert.ok(repository.resolveFileUrl(upload.url));
});

test('rechaza subidas de tipo no admitido y depura las que nunca se guardaron', t => {
  const { repository } = createTempRepository(t);
  assert.throws(() => repository.createUploadTarget('application/zip'), error => error.statusCode === 415);
  const upload = createUpload(repository, 'image/png', 'png');
  assert.equal(repository.deleteStaleUploads(48), 0);
  assert.equal(repository.deleteStaleUploads(-1), 1);
  assert.equal(fs.existsSync(upload.path), false);
  assert.equal(repository.resolveFileUrl(upload.url), null);
});

test('rechaza guardar sobre una revisión desactualizada', t => {
  const { repository } = createTempRepository(t);
  const first = repository.save(null, { datos: { fields: { folioExpediente: 'AV-1' } } });
  assert.equal(first.revision, 1);
  const second = repository.save(first.id, { datos: { fields: { folioExpediente: 'AV-1b' } }, revision: first.revision });
  assert.equal(second.revision, 2);
  assert.throws(() => repository.save(first.id, { datos: { fields: {} }, revision: first.revision }), error => error.statusCode === 409);
  assert.equal(repository.save(first.id, { datos: { fields: {} } }).revision, 3, 'sin revisión se guarda como antes');
});

test('aplica una visita de campo a un avalúo existente sin borrar lo que no se capturó', t => {
  const { repository } = createTempRepository(t);
  const avaluo = repository.save(null, { datos: { fields: { folioExpediente: 'AV-7', cimentacion: 'Zapatas', techumbres: 'Losa maciza' }, attachments: { photos: [{ name: 'previa.png', preview: PNG }] } } });
  const photo = createUpload(repository, 'image/jpeg', 'jpeg-de-campo');

  const visit = {
    visitaId: 'visita-0001-abcd', avaluoId: avaluo.id, capturadoEn: '2026-10-15T17:00:00Z',
    fields: { cimentacion: 'Losa de cimentación', techumbres: '', acabadoPisos: ['Cerámica', 'Porcelanato'], nombre_raro: 'x', 'mal-nombre': 'y' },
    photos: [{ name: 'fachada.jpg', type: 'image/jpeg', size: 12, url: photo.url }],
    notas: 'Humedad en muro de cocina.'
  };
  const updated = repository.applyVisit(visit);
  assert.equal(updated.datos.fields.cimentacion, 'Losa de cimentación');
  assert.equal(updated.datos.fields.techumbres, 'Losa maciza', 'un valor vacío no borra lo capturado en oficina');
  assert.deepEqual(updated.datos.fields.acabadoPisos, ['Cerámica', 'Porcelanato']);
  assert.equal(updated.datos.fields['mal-nombre'], undefined);
  assert.match(updated.datos.fields.notasVisita, /^Visita de campo del 15\/10\/2026: Humedad en muro de cocina\.$/);
  assert.equal(updated.datos.attachments.photos.length, 2);
  assert.match(updated.datos.attachments.photos[1].preview, /^\/api\/archivos\/\d+$/);

  const again = repository.applyVisit(visit);
  assert.equal(again.duplicada, true);
  assert.equal(again.datos.attachments.photos.length, 2, 'reintentar no duplica fotos');
});

test('una visita sin avalúo crea uno nuevo con su folio, y reintentarla no lo duplica', t => {
  const { repository } = createTempRepository(t);
  const visit = { visitaId: 'visita-nueva-0002', folio: 'AV-CAMPO-1', fields: { usoActual: 'Casa habitación' }, notas: '' };
  const created = repository.applyVisit(visit);
  assert.equal(created.folio, 'AV-CAMPO-1');
  assert.equal(created.datos.fields.usoActual, 'Casa habitación');
  assert.equal(repository.applyVisit(visit).id, created.id);
  assert.equal(repository.list().length, 1);
  assert.throws(() => repository.applyVisit({ visitaId: 'x' }), error => error.statusCode === 400);
  assert.throws(() => repository.applyVisit({ visitaId: 'visita-0003-zzzz', avaluoId: 999 }), error => error.statusCode === 404);
});

test('resume cada avalúo para las estadísticas con su valor unitario', t => {
  const { repository } = createTempRepository(t);
  repository.save(null, { datos: { fields: { folioExpediente: 'AV-1', fechaAvaluo: '2026-03-10', tipoInmueble: 'Casa habitación', municipio: 'Puebla', superficieConstruccion: '120', superficieTerreno: '200', latitud: '19.0414', longitud: '-98.2063' } }, resumen: { valorConcluido: 1800000, enfoque: 'Comparativo de mercado' } });
  repository.save(null, { datos: { fields: { folioExpediente: 'AV-2', tipoInmueble: 'Terreno urbano', superficieTerreno: '250' } }, resumen: { valorConcluido: 1000000 } });
  repository.save(null, { datos: { fields: { folioExpediente: 'AV-3' } } });

  const rows = repository.statistics();
  const byFolio = Object.fromEntries(rows.map(row => [row.folio, row]));
  assert.equal(rows.length, 3);
  assert.equal(byFolio['AV-1'].valorUnitario, 15000);
  assert.equal(byFolio['AV-1'].baseUnitaria, 'construcción');
  assert.equal(byFolio['AV-1'].fecha, '2026-03-10');
  assert.equal(byFolio['AV-1'].latitud, 19.0414);
  assert.equal(byFolio['AV-1'].longitud, -98.2063);
  assert.equal(byFolio['AV-2'].latitud, null, 'sin coordenadas capturadas no se ubica en el mapa');
  assert.equal(byFolio['AV-2'].valorUnitario, 4000);
  assert.equal(byFolio['AV-2'].baseUnitaria, 'terreno');
  assert.equal(byFolio['AV-3'].valor, null);
  assert.equal(byFolio['AV-3'].tipo, 'Sin especificar');
  assert.match(byFolio['AV-3'].fecha, /^\d{4}-\d{2}-\d{2}$/, 'sin fecha del avalúo usa la de creación');
});

test('sin perfil guardado toma los datos del valuador del avalúo más reciente', t => {
  const { repository } = createTempRepository(t);
  assert.equal(repository.getProfile(), null);
  repository.save(null, { datos: { fields: { valuadorNombre: 'Ana Pérez', valuadorCedula: '123', folioExpediente: 'AV-1' }, valuerLogo: PNG } });

  const profile = repository.getProfile();
  assert.equal(profile.fields.valuadorNombre, 'Ana Pérez');
  assert.equal(profile.fields.valuadorCedula, '123');
  assert.equal(profile.fields.folioExpediente, undefined, 'solo incluye datos del valuador');
  assert.equal(profile.valuerLogo, PNG, 'el logotipo guardado como archivo vuelve como data URL');
});

test('guarda el perfil del valuador y lo conserva aunque se elimine el avalúo de origen', t => {
  const { repository } = createTempRepository(t);
  const saved = repository.save(null, { datos: { valuerLogo: PNG } });
  repository.saveProfile({ fields: { valuadorNombre: 'Luis Mora', lugarEmision: 'Puebla' }, valuerLogo: saved.datos.valuerLogo, valuerSignature: '' });
  repository.remove(saved.id);

  const profile = repository.getProfile();
  assert.equal(profile.fields.valuadorNombre, 'Luis Mora');
  assert.equal(profile.fields.lugarEmision, 'Puebla');
  assert.equal(profile.valuerLogo, PNG);
  assert.equal(profile.valuerSignature, '');
  assert.throws(() => repository.saveProfile({ fields: {} }), /al menos el nombre/);
});

test('rechaza capturas inválidas, tipos no admitidos y avalúos inexistentes sin dejar registros', t => {
  const { repository } = createTempRepository(t);
  assert.throws(() => repository.save(null, { datos: null }), /no es válida/);
  assert.throws(() => repository.save(null, { datos: { file: 'data:application/zip;base64,UEsDBA==' } }), error => error.statusCode === 415);
  assert.throws(() => repository.save(999, { datos: {} }), error => error.statusCode === 404);
  assert.equal(repository.list().length, 0);
});

test('folios: únicos sin importar mayúsculas, el siguiente consecutivo del año y sin reutilizar los cancelados', t => {
  const { repository } = createTempRepository(t);
  const withFolio = folio => ({ fields: { folioExpediente: folio } });
  const first = repository.save(null, { datos: withFolio('AV-2026-001') });
  const seventh = repository.save(null, { datos: withFolio('AV-2026-007') });
  repository.save(null, { datos: withFolio('AV-2025-010') });
  repository.save(null, { datos: withFolio('Folio libre del cliente') });

  assert.throws(() => repository.save(null, { datos: withFolio(' av-2026-001 ') }), error => error.statusCode === 422 && /avalúo #\d+ \(en proceso\)/.test(error.message));
  assert.doesNotThrow(() => repository.save(first.id, { datos: withFolio('AV-2026-001') }), 'el mismo avalúo conserva su folio');
  assert.equal(repository.folioInUse('av-2026-007').id, seventh.id);
  assert.equal(repository.folioInUse('AV-2026-007', seventh.id), null);

  repository.setStatus(seventh.id, { estatus: 'cancelado', motivo: 'El cliente desistió' });
  assert.equal(repository.nextFolio(2026), 'AV-2026-008', 'el cancelado sigue contando');
  assert.equal(repository.nextFolio(2025), 'AV-2025-011');
  assert.equal(repository.nextFolio(2027), 'AV-2027-001');
  assert.throws(() => repository.save(null, { datos: withFolio('AV-2026-007') }), error => error.statusCode === 422 && /cancelado/.test(error.message));

  const visit = repository.applyVisit({ visitaId: 'visita-folio-repetido', folio: 'AV-2026-001', fields: { usoActual: 'Casa' } });
  assert.ok(visit.id, 'una visita de campo no falla por un folio repetido');
});

test('estatus: cancelar con motivo, fuera de estadísticas, y un concluido no se elimina', t => {
  const { repository } = createTempRepository(t);
  const datos = { fields: { folioExpediente: 'AV-2026-001', fechaAvaluo: '2026-10-01', superficieConstruccion: '100' } };
  const saved = repository.save(null, { datos, resumen: { valorConcluido: 1500000, enfoque: 'Comparativo de mercado' } });
  assert.equal(repository.get(saved.id).estatus, 'en_proceso');

  assert.throws(() => repository.setStatus(saved.id, { estatus: 'cancelado', motivo: ' ' }), error => error.statusCode === 400);
  assert.throws(() => repository.setStatus(saved.id, { estatus: 'archivado' }), error => error.statusCode === 400);
  const cancelled = repository.setStatus(saved.id, { estatus: 'cancelado', motivo: 'Inmueble con litigio' });
  assert.equal(cancelled.estatus, 'cancelado');
  assert.equal(cancelled.estatus_motivo, 'Inmueble con litigio');
  assert.match(cancelled.estatus_fecha, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.equal(repository.statistics().length, 0, 'un cancelado no cuenta en las estadísticas');
  assert.equal(repository.list()[0].estatus, 'cancelado', 'sigue en la lista');

  const concluded = repository.setStatus(saved.id, { estatus: 'concluido' });
  assert.equal(concluded.estatus_motivo, null);
  assert.equal(repository.statistics().length, 1);
  assert.throws(() => repository.remove(saved.id), error => error.statusCode === 409);
  repository.setStatus(saved.id, { estatus: 'en_proceso' });
  assert.equal(repository.remove(saved.id), true);
  assert.throws(() => repository.setStatus(saved.id, { estatus: 'concluido' }), error => error.statusCode === 404);
});
