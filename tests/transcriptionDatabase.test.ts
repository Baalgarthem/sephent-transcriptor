/**
 * Pruebas unitarias para TranscriptionDatabase y OutputPathService
 * Validación de persistencia, CRUD, resolución de rutas y prevención de colisiones.
 */

import { TranscriptionDatabase, formatearDuracion } from '../src/services/database/transcriptionDatabase';
import { OutputPathService } from '../src/services/transcription/outputPathService';

async function ejecutarPruebasDatabase() {
  console.log('========================================================');
  console.log('🧪 Iniciando Pruebas de Base de Datos y Rutas de Salida');
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

  // 1. Validando OutputPathService
  console.log('📁 1. Validando OutputPathService (Rutas y Modos)...');
  const rutaDefault = OutputPathService.obtenerRutaPorDefecto();
  afirmar(
    rutaDefault.includes('Documents') && rutaDefault.includes('Transcripciones'),
    `Ruta por defecto contiene 'Documents\\Transcripciones': "${rutaDefault}"`
  );

  OutputPathService.establecerModo('original');
  afirmar(
    OutputPathService.obtenerModoActual() === 'original',
    'Modo establecido a "original" (predeterminado) correctamente'
  );

  const carpetaOriginalConDir = OutputPathService.resolverCarpetaDestino('audio.mp3', 'original', 'C:\\AudiosGrabados');
  afirmar(
    carpetaOriginalConDir === 'C:\\AudiosGrabados',
    `Resuelve carpeta original con directorio físico correctamente: "${carpetaOriginalConDir}"`
  );

  const rutaSalidaOriginal = OutputPathService.resolverRutaCompletaSalida('audio.txt', 'C:\\AudiosGrabados\\audio.mp3', 'original');
  afirmar(
    rutaSalidaOriginal === 'C:\\AudiosGrabados\\audio.txt',
    `Resuelve ruta completa de salida en carpeta de origen: "${rutaSalidaOriginal}"`
  );

  OutputPathService.establecerModo('default');
  afirmar(
    OutputPathService.obtenerModoActual() === 'default',
    'Modo establecido a "default" correctamente'
  );

  const carpetaDefault = OutputPathService.resolverCarpetaDestino('audio.mp3', 'default');
  afirmar(
    carpetaDefault === rutaDefault,
    'Resuelve carpeta default correctamente'
  );

  OutputPathService.establecerModo('original');

  // 2. Validando TranscriptionDatabase CRUD
  console.log('\n🗄️ 2. Validando TranscriptionDatabase (Repository CRUD)...');
  TranscriptionDatabase.limpiarTodo();
  afirmar(TranscriptionDatabase.contar() === 0, 'Base de datos inicia vacía tras limpiarTodo()');

  const registro1 = TranscriptionDatabase.guardar({
    fileName: 'audiencia_laboral_001.mp4',
    fileType: 'video',
    fileSizeFormatted: '18.4 MB',
    modelUsed: 'Whisper Medium (medium.pt)',
    language: 'ES',
    destinationType: 'default',
    destinationFolder: rutaDefault,
    outputs: [
      { format: 'txt', fileName: 'audiencia_laboral_001.txt', fullPath: `${rutaDefault}\\audiencia_laboral_001.txt` },
      { format: 'srt', fileName: 'audiencia_laboral_001.srt', fullPath: `${rutaDefault}\\audiencia_laboral_001.srt` },
    ],
    status: 'completado',
  });

  afirmar(registro1.id.startsWith('TRX-'), `El ID asignado tiene prefijo formal TRX-: "${registro1.id}"`);
  afirmar(TranscriptionDatabase.contar() === 1, 'Base de datos cuenta con 1 registro tras guardar');

  const encontrado = TranscriptionDatabase.buscarPorId(registro1.id);
  afirmar(encontrado !== null, 'Busca y recupera el registro guardado por ID');
  afirmar(encontrado?.fileName === 'audiencia_laboral_001.mp4', 'Preserva el nombre de archivo exacto');
  afirmar(encontrado?.outputs.length === 2, 'Contiene las 2 salidas generadas con sus rutas completas');

  const registro2 = TranscriptionDatabase.guardar({
    fileName: 'interrogatorio_testigo.wav',
    fileType: 'audio',
    fileSizeFormatted: '4.2 MB',
    modelUsed: 'Whisper Base (base.pt)',
    language: 'Detección automática',
    destinationType: 'original',
    destinationFolder: 'Misma carpeta de origen (interrogatorio_testigo.wav)',
    outputs: [
      { format: 'txt', fileName: 'interrogatorio_testigo.txt', fullPath: `[Carpeta origen]\\interrogatorio_testigo.txt` },
    ],
    status: 'completado',
  });

  afirmar(TranscriptionDatabase.contar() === 2, 'Base de datos almacena múltiples expedientes acumulados (2)');

  const todas = TranscriptionDatabase.obtenerTodas();
  afirmar(todas[0].id === registro2.id, 'Ordena cronológicamente: el más reciente primero');

  const eliminado = TranscriptionDatabase.eliminar(registro1.id);
  afirmar(eliminado === true, 'Elimina registro existente correctamente');
  afirmar(TranscriptionDatabase.contar() === 1, 'Total de registros disminuye a 1 tras eliminación');
  afirmar(TranscriptionDatabase.buscarPorId(registro1.id) === null, 'El registro eliminado ya no existe');

  // 3. Validando Modificación y Persistencia de Hablantes por Transcripción
  console.log('\n👥 3. Validando Modificación y Persistencia de Hablantes por Transcripción...');
  const modificadoExitoso = TranscriptionDatabase.actualizarHablantes(registro2.id, {
    speaker_01: 'Lic. Roberto Gómez (Juez)',
    speaker_02: 'Dra. María Morales (Defensora)',
  });
  afirmar(modificadoExitoso === true, 'actualizarHablantes retorna true para registro existente');

  const registroConHablantes = TranscriptionDatabase.buscarPorId(registro2.id);
  afirmar(
    registroConHablantes?.speakerNames?.speaker_01 === 'Lic. Roberto Gómez (Juez)',
    'speaker_01 persistió correctamente el nuevo nombre asignado'
  );
  afirmar(
    registroConHablantes?.speakerNames?.speaker_02 === 'Dra. María Morales (Defensora)',
    'speaker_02 persistió correctamente el nuevo nombre asignado'
  );

  // Actualización acumulativa/parcial de hablantes
  TranscriptionDatabase.actualizarHablantes(registro2.id, {
    speaker_03: 'Perito Dr. Sánchez',
  });
  const registroActualizado3 = TranscriptionDatabase.buscarPorId(registro2.id);
  afirmar(
    registroActualizado3?.speakerNames?.speaker_01 === 'Lic. Roberto Gómez (Juez)' &&
    registroActualizado3?.speakerNames?.speaker_03 === 'Perito Dr. Sánchez',
    'Preserva los hablantes previos al añadir o modificar un nuevo hablante'
  );

  const falloIdInexistente = TranscriptionDatabase.actualizarHablantes('TRX-INEXISTENTE-999', { speaker_01: 'X' });
  afirmar(falloIdInexistente === false, 'actualizarHablantes retorna false si el ID no existe');

  // 4. Validando actualizarContenidoCompleto y combinarDosTranscripciones
  console.log('\n🧩 4. Validando Actualización Completa y Combinación de Transcripciones...');
  const trxBase1 = TranscriptionDatabase.guardar({
    fileName: 'declaracion_parte_1.mp3',
    fileType: 'audio',
    fileSizeFormatted: '5.0 MB',
    modelUsed: 'Whisper Small',
    language: 'ES',
    destinationType: 'default',
    destinationFolder: rutaDefault,
    textContent: 'Primer testimonio del testigo Juan.',
    srtContent: '1\n00:00:00,000 --> 00:00:05,000\nPrimer testimonio del testigo Juan.\n',
    rawSegments: [
      { id: 'seg_1_1', speakerId: 'speaker_01', startTime: 0, endTime: 5, text: 'Primer testimonio del testigo Juan.' }
    ],
    outputs: [
      { format: 'txt', fileName: 'declaracion_parte_1.txt', fullPath: `${rutaDefault}\\declaracion_parte_1.txt` },
      { format: 'srt', fileName: 'declaracion_parte_1.srt', fullPath: `${rutaDefault}\\declaracion_parte_1.srt` }
    ],
    status: 'completado',
  });

  const trxBase2 = TranscriptionDatabase.guardar({
    fileName: 'declaracion_parte_2.mp3',
    fileType: 'audio',
    fileSizeFormatted: '6.0 MB',
    modelUsed: 'Whisper Small',
    language: 'ES',
    destinationType: 'default',
    destinationFolder: rutaDefault,
    textContent: 'Segunda parte del testimonio y conclusión.',
    srtContent: '1\n00:00:00,000 --> 00:00:06,000\nSegunda parte del testimonio y conclusión.\n',
    rawSegments: [
      { id: 'seg_2_1', speakerId: 'speaker_02', startTime: 0, endTime: 6, text: 'Segunda parte del testimonio y conclusión.' }
    ],
    outputs: [
      { format: 'txt', fileName: 'declaracion_parte_2.txt', fullPath: `${rutaDefault}\\declaracion_parte_2.txt` }
    ],
    status: 'completado',
  });

  // Test actualizarContenidoCompleto
  const exitoActualizar = TranscriptionDatabase.actualizarContenidoCompleto(trxBase1.id, {
    textContent: '[00:00:00 - 00:00:05] Juan Pérez: Primer testimonio editado.',
    srtContent: '1\n00:00:00,000 --> 00:00:05,000\nJuan Pérez: Primer testimonio editado.\n',
    speakerNames: { speaker_01: 'Juan Pérez' },
  });
  afirmar(exitoActualizar === true, 'actualizarContenidoCompleto retorna true');
  const recuperadaTrx1 = TranscriptionDatabase.buscarPorId(trxBase1.id);
  afirmar(recuperadaTrx1?.textContent?.includes('Juan Pérez: Primer testimonio editado.') === true, 'textContent se actualizó correctamente en la base de datos');
  afirmar(recuperadaTrx1?.speakerNames?.speaker_01 === 'Juan Pérez', 'speakerNames se sincronizó en la base de datos');

  // Test combinarDosTranscripciones
  const trxCombinada = TranscriptionDatabase.combinarDosTranscripciones(trxBase1.id, trxBase2.id);
  afirmar(Boolean(trxCombinada), 'combinarDosTranscripciones retorna la nueva transcripción combinada');
  afirmar(trxCombinada?.fileName.includes('_Y_'), `Nombre de archivo unificado contiene "_Y_": ${trxCombinada?.fileName}`);
  afirmar(Boolean(trxCombinada?.textContent?.includes('Primer testimonio editado') && trxCombinada?.textContent?.includes('declaracion_parte_2.mp3')), 'El texto unificado incluye el contenido de ambas partes y el separador');
  afirmar((trxCombinada?.rawSegments?.length || 0) === 2, 'Los rawSegments se concatenaron (total 2 segmentos)');
  // El segundo segmento debe tener offset de 5 segundos
  const segundoSeg = trxCombinada?.rawSegments?.[1];
  afirmar(segundoSeg?.startTime === 5 && segundoSeg?.endTime === 11, `El segundo segmento tiene offset temporal acumulado: [${segundoSeg?.startTime} - ${segundoSeg?.endTime}]`);

  // 5. Validando formatearDuracion y telemetría de tiempos
  console.log('\n⏱️ 5. Validando formatearDuracion y Telemetría Temporal...');
  afirmar(formatearDuracion(0) === '0s', 'formatearDuracion(0) retorna "0s"');
  afirmar(formatearDuracion(45) === '45s', 'formatearDuracion(45) retorna "45s"');
  afirmar(formatearDuracion(155) === '2m 35s', 'formatearDuracion(155) retorna "2m 35s"');
  afirmar(formatearDuracion(3665) === '1h 1m 5s', 'formatearDuracion(3665) retorna "1h 1m 5s"');

  const trxConTiempos = TranscriptionDatabase.guardar({
    fileName: 'juicio_oral_tiempo.wav',
    fileType: 'audio',
    fileSizeFormatted: '12.0 MB',
    modelUsed: 'Whisper Small',
    language: 'ES',
    destinationType: 'original',
    destinationFolder: 'C:\\Audios',
    outputs: [],
    status: 'completado',
    horaInicio: '10:15:30',
    horaFin: '10:18:05',
    duracionSegundos: 155,
  });

  afirmar(trxConTiempos.horaInicio === '10:15:30', 'Almacena horaInicio de forma persistente');
  afirmar(trxConTiempos.horaFin === '10:18:05', 'Almacena horaFin de forma persistente');
  afirmar(trxConTiempos.duracionSegundos === 155, 'Almacena duracionSegundos de forma persistente');
  afirmar(trxConTiempos.duracionFormateada === '2m 35s', 'Calcula automáticamente duracionFormateada si no se proporciona');

  console.log('\n========================================================');
  console.log(`🎉 Resultados: ${superadas} de ${totales} pruebas PASARON exitosamente.`);
  console.log('========================================================\n');
}

ejecutarPruebasDatabase().catch((err) => {
  console.error('Error durante la ejecución de pruebas:', err);
  process.exit(1);
});
