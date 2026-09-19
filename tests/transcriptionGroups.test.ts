/**
 * Pruebas unitarias para TranscriptionGroupService y gestión de grupos/expedientes
 * Valida creación de grupos, metadatos estructurados, campos personalizados,
 * arrastrar/mover transcripciones entre grupos y persistencia de notas.
 */

import { TranscriptionGroupService } from '../src/services/database/transcriptionGroupService';
import { TranscriptionDatabase } from '../src/services/database/transcriptionDatabase';

async function ejecutarPruebasGrupos() {
  console.log('========================================================');
  console.log('🧪 Iniciando Pruebas de Grupos, Expedientes y Drag-and-Drop');
  console.log('========================================================\n');

  let superadas = 0;
  let totales = 0;

  function afirmar(condicion: boolean, descripcion: string) {
    totales++;
    if (condicion) {
      console.log(`  ✅ [PASÓ]: ${descripcion}`);
      superadas++;
    } else {
      console.error(`  ❌ [FALLÓ]: ${descripcion}`);
      throw new Error(`Fallo en prueba: ${descripcion}`);
    }
  }

  // 1. Validando CRUD de Grupos de Expedientes
  console.log('📁 1. Validando TranscriptionGroupService (CRUD y Metadatos)...');
  TranscriptionGroupService.limpiarTodo();
  afirmar(TranscriptionGroupService.obtenerTodos().length === 0, 'La base de datos de grupos inicia vacía tras limpiarTodo()');

  const grupo1 = TranscriptionGroupService.crear({
    nombre: 'Causa Penal 402/2026 - Homicidio Culposo',
    personaInvolucrada: 'Lic. Fernando Méndez Juárez',
    numeroExpediente: 'EXP-402-2026',
    instanciaAutoridad: 'Juzgado Tercero de Distrito en Materia Penal',
    fechaExpediente: '2026-09-17',
    notasGrupo: 'Investigación pericial de audio y testimonios recabados.',
    colorBadge: '#2C5282',
    camposPersonalizados: [
      { id: 'f1', etiqueta: 'Delito Imputado', valor: 'Homicidio culposo por tránsito vehicular' },
      { id: 'f2', etiqueta: 'Etapa Procesal', valor: 'Audiencia Intermedia' },
    ],
  });

  afirmar(grupo1.id.startsWith('GRP-'), `El ID generado tiene prefijo formal GRP-: "${grupo1.id}"`);
  afirmar(grupo1.nombre === 'Causa Penal 402/2026 - Homicidio Culposo', 'Preserva el nombre del expediente');
  afirmar(grupo1.personaInvolucrada === 'Lic. Fernando Méndez Juárez', 'Preserva el nombre de la persona involucrada');
  afirmar(grupo1.numeroExpediente === 'EXP-402-2026', 'Preserva el número de causa/expediente');
  afirmar(grupo1.instanciaAutoridad === 'Juzgado Tercero de Distrito en Materia Penal', 'Preserva la autoridad/juzgado');
  afirmar(grupo1.camposPersonalizados?.length === 2, 'Registra los 2 campos personalizados dinámicos');
  afirmar(TranscriptionGroupService.obtenerTodos().length === 1, 'Cuenta con 1 grupo registrado');

  // Buscar por ID
  const grupoBuscado = TranscriptionGroupService.buscarPorId(grupo1.id);
  afirmar(grupoBuscado !== null, 'Busca y recupera el grupo por ID');
  afirmar(grupoBuscado?.colorBadge === '#2C5282', 'Preserva el color del distintivo');

  // Actualizar grupo
  const grupoActualizado = TranscriptionGroupService.actualizar(grupo1.id, {
    personaInvolucrada: 'Lic. Fernando Méndez Juárez (Defensa)',
    numeroExpediente: 'EXP-402-2026-BIS',
  });
  afirmar(
    grupoActualizado?.personaInvolucrada === 'Lic. Fernando Méndez Juárez (Defensa)',
    'Actualiza la persona involucrada correctamente'
  );
  afirmar(
    grupoActualizado?.numeroExpediente === 'EXP-402-2026-BIS',
    'Actualiza el número de expediente correctamente'
  );

  // Crear un segundo grupo
  const grupo2 = TranscriptionGroupService.crear({
    nombre: 'Investigación Pericial Laboral 2026',
    personaInvolucrada: 'Dra. Patricia Solís',
    colorBadge: '#276749',
  });
  afirmar(TranscriptionGroupService.obtenerTodos().length === 2, 'Almacena múltiples grupos acumulados (2)');

  // 2. Validando Drag and Drop / Movimiento de Transcripciones entre Grupos
  console.log('\n📦 2. Validando Drag and Drop / Reubicación entre Grupos...');
  TranscriptionDatabase.limpiarTodo();

  const trx1 = TranscriptionDatabase.guardar({
    fileName: 'declaracion_testigo_01.mp3',
    fileType: 'audio',
    fileSizeFormatted: '12.5 MB',
    modelUsed: 'Whisper Medium',
    language: 'ES',
    destinationType: 'default',
    destinationFolder: 'C:\\Documents\\Transcripciones',
    outputs: [{ format: 'txt', fileName: 'declaracion_testigo_01.txt', fullPath: 'C:\\test.txt' }],
    status: 'completado',
  });

  const trx2 = TranscriptionDatabase.guardar({
    fileName: 'audiencia_inicial_interrogatorio.mp4',
    fileType: 'video',
    fileSizeFormatted: '45.1 MB',
    modelUsed: 'Whisper Large',
    language: 'ES',
    destinationType: 'default',
    destinationFolder: 'C:\\Documents\\Transcripciones',
    outputs: [{ format: 'txt', fileName: 'audiencia_inicial_interrogatorio.txt', fullPath: 'C:\\test2.txt' }],
    status: 'completado',
  });

  afirmar(trx1.groupId === undefined, 'Las transcripciones inician sin grupo (en Bandeja General)');

  // Simular Drag & Drop: Asignar trx1 a grupo1
  const movidoAGrupo1 = TranscriptionGroupService.asignarTranscripcion(trx1.id, grupo1.id);
  afirmar(movidoAGrupo1 === true, 'Asignar transcripción a grupo1 retorna true');

  const trx1EnDB = TranscriptionDatabase.buscarPorId(trx1.id);
  afirmar(trx1EnDB?.groupId === grupo1.id, 'trx1 tiene ahora el groupId del grupo1');

  // Simular Drag & Drop: Mover trx1 de grupo1 a grupo2
  const movidoAGrupo2 = TranscriptionGroupService.asignarTranscripcion(trx1.id, grupo2.id);
  afirmar(movidoAGrupo2 === true, 'Reubicar transcripción a grupo2 retorna true');
  afirmar(TranscriptionDatabase.buscarPorId(trx1.id)?.groupId === grupo2.id, 'trx1 adoptó inmediatamente el groupId del grupo2');

  // Simular Drag & Drop: Regresar trx1 a la Bandeja General (groupId: null)
  TranscriptionGroupService.asignarTranscripcion(trx1.id, null);
  afirmar(TranscriptionDatabase.buscarPorId(trx1.id)?.groupId === undefined, 'Al desasignar a Bandeja General, groupId se elimina limpiamente');

  // 3. Validando Desasignación Automática al Eliminar un Grupo
  console.log('\n🗑️ 3. Validando Desasignación al Eliminar un Grupo...');
  // Asignamos trx1 y trx2 a grupo1
  TranscriptionGroupService.asignarTranscripcion(trx1.id, grupo1.id);
  TranscriptionGroupService.asignarTranscripcion(trx2.id, grupo1.id);
  afirmar(TranscriptionDatabase.buscarPorId(trx1.id)?.groupId === grupo1.id, 'trx1 vinculada a grupo1');
  afirmar(TranscriptionDatabase.buscarPorId(trx2.id)?.groupId === grupo1.id, 'trx2 vinculada a grupo1');

  // Eliminamos grupo1
  const eliminado = TranscriptionGroupService.eliminar(grupo1.id);
  afirmar(eliminado === true, 'Grupo1 eliminado exitosamente');
  afirmar(TranscriptionGroupService.buscarPorId(grupo1.id) === null, 'Grupo1 ya no existe en el catálogo');

  // Verificar que sus transcripciones NO se borraron, sino que volvieron a Bandeja General
  const trx1TrasEliminar = TranscriptionDatabase.buscarPorId(trx1.id);
  const trx2TrasEliminar = TranscriptionDatabase.buscarPorId(trx2.id);
  afirmar(trx1TrasEliminar !== null, 'trx1 sigue existiendo en la base de datos');
  afirmar(trx1TrasEliminar?.groupId === undefined, 'trx1 regresó automáticamente a la Bandeja General');
  afirmar(trx2TrasEliminar?.groupId === undefined, 'trx2 regresó automáticamente a la Bandeja General');

  // 4. Validando Cuaderno de Notas y Observaciones por Transcripción
  console.log('\n📝 4. Validando Cuaderno de Notas y Observaciones...');
  const notasGuardadas = TranscriptionDatabase.actualizarNotas(
    trx1.id,
    'En el minuto 04:12 el declarante cae en contradicción respecto a la hora de salida del vehículo.'
  );
  afirmar(notasGuardadas === true, 'actualizarNotas retorna true para registro existente');

  const trx1ConNotas = TranscriptionDatabase.buscarPorId(trx1.id);
  afirmar(
    trx1ConNotas?.notes?.includes('minuto 04:12 el declarante cae en contradicción') === true,
    'Las notas periciales se persistieron y recuperaron con exactitud'
  );

  // 5. Validando Subsección de Personas Dinámicas dentro de la Transcripción (Tantas como sean necesarias)
  console.log('\n👥 5. Validando Subsección de Personas Dinámicas en la Transcripción...');
  const { TranscriptionReviewerService } = await import('../src/services/reviewer/transcriptionReviewerService');
  const segmentosGrupoTest = [
    { id: 'seg_1', speakerId: 'speaker_01', startTime: 0, endTime: 4, text: 'Testimonio inicial.', confidence: 0.95 },
    { id: 'seg_2', speakerId: 'speaker_02', startTime: 4.5, endTime: 8, text: 'Pregunta del abogado.', confidence: 0.93 },
  ];
  const dossierBase = TranscriptionReviewerService.crearExpediente({
    sourceFileName: 'declaracion_testigo_01.mp3',
    originalTranscriptionId: trx1.id,
    rawSegments: segmentosGrupoTest,
  });

  const conteoInicial = Object.keys(dossierBase.speakers).length;
  // Añadir una persona adicional a la transcripción
  const dossierConNuevaPersona = TranscriptionReviewerService.agregarHablante(
    dossierBase,
    'Perito Psicólogo Lic. Carlos Rivera',
    'Perito / Especialista'
  );
  afirmar(
    Object.keys(dossierConNuevaPersona.speakers).length === conteoInicial + 1,
    'Se añadió exitosamente una nueva persona a la subsección de personas de la transcripción'
  );

  const nuevaPersonaPerfil = Object.values(dossierConNuevaPersona.speakers).find(
    (s) => s.displayName === 'Perito Psicólogo Lic. Carlos Rivera'
  );
  afirmar(nuevaPersonaPerfil !== undefined, 'La persona añadida conserva su nombre asignado');
  afirmar(nuevaPersonaPerfil?.role === 'Perito / Especialista', 'La persona añadida conserva su rol procesal');

  // Añadir otra persona más (verificar que se pueden agrupar tantas como sean necesarias)
  const dossierConCuartaPersona = TranscriptionReviewerService.agregarHablante(dossierConNuevaPersona);
  afirmar(
    Object.keys(dossierConCuartaPersona.speakers).length === conteoInicial + 2,
    'Se agrupan tantas personas como sean necesarias en la misma transcripción'
  );

  console.log('\n========================================================');
  console.log(`🎉 Resultados: ${superadas} de ${totales} pruebas PASARON exitosamente.`);
  console.log('========================================================\n');
}

ejecutarPruebasGrupos().catch((err) => {
  console.error('Error durante la ejecución de pruebas de grupos:', err);
  process.exit(1);
});
