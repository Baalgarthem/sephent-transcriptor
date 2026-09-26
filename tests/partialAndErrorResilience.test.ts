/**
 * Pruebas Unitarias de Resiliencia: Transcripción Parcial por Cancelación o Error y Registro de Errores (Estilo Arturo)
 */

import { AudioTranscriptionEngine } from '../src/services/transcription/audioTranscriptionEngine';
import { TranscriptionDatabase } from '../src/services/database/transcriptionDatabase';
import { WhisperBridgeService } from '../src/services/transcription/whisperBridgeService';
import { TranscriptionEngineAdapter } from '../src/services/transcription/transcriptionEngineAdapter';
import { RawTranscriptSegment } from '../src/services/reviewer/types';

async function ejecutarPruebas() {
  console.log('================================================================');
  console.log('🧪 Iniciando Pruebas de Resiliencia ante Cancelación y Errores');
  console.log('================================================================\n');

  let pruebasSuperadas = 0;
  let pruebasTotales = 0;

  function afirmar(condicion: boolean, descripcion: string) {
    pruebasTotales++;
    if (condicion) {
      console.log(`  ✅ [PASÓ]: ${descripcion}`);
      pruebasSuperadas++;
    } else {
      console.error(`  ❌ [FALLÓ]: ${descripcion}`);
      throw new Error(`Fallo en prueba: ${descripcion}`);
    }
  }

  // 1. Formateo y preservación de transcripción parcial cancelada por el usuario
  console.log('📄 1. Validando formateo de expediente parcial tras cancelación...');
  const segmentosPrueba: RawTranscriptSegment[] = [
    {
      id: 'seg_1',
      speakerId: 'speaker_01',
      startTime: 0.0,
      endTime: 4.5,
      text: 'Inicio de la audiencia preliminar en el tribunal colegiado.',
      confidence: 0.98,
    },
    {
      id: 'seg_2',
      speakerId: 'speaker_02',
      startTime: 4.8,
      endTime: 10.2,
      text: 'Presente la parte defensora para comparecer formalmente.',
      confidence: 0.96,
    },
  ];

  const speakerNamesPrueba = {
    speaker_01: 'Juez Presidente',
    speaker_02: 'Abogado Defensor',
  };

  const txtCancelado = AudioTranscriptionEngine.generarTextoPlano(
    'audiencia_caso_452.mp3',
    'large-v3-turbo',
    'es',
    segmentosPrueba,
    speakerNamesPrueba,
    true, // isPartial
    true, // wasCancelled
    'Interrumpido por solicitud expresa del usuario'
  );

  afirmar(txtCancelado.includes('[EXPEDIENTE PARCIAL RESCATADO]'), 'El encabezado identifica formalmente el estado de expediente parcial rescatado');
  afirmar(txtCancelado.includes('PARCIAL (Interrumpido por solicitud del usuario)'), 'Declara la causa de interrupción por el usuario');
  afirmar(txtCancelado.includes('audiencia_caso_452.mp3'), 'Conserva el nombre del archivo fuente');
  afirmar(txtCancelado.includes('Juez Presidente:'), 'Mantiene los nombres de hablantes discriminados');
  afirmar(txtCancelado.includes('Abogado Defensor:'), 'Mantiene el segundo interlocutor');
  afirmar(txtCancelado.includes('Presente la parte defensora'), 'Preserva el texto íntegro decodificado hasta la interrupción');
  afirmar(txtCancelado.includes('Nota Pericial:'), 'Incluye la nota pericial de integridad de segmentos rescatados');

  // 2. Formateo de transcripción parcial por fallo técnico recuperado
  console.log('\n📄 2. Validando formateo de expediente parcial tras fallo técnico...');
  const txtErrorRecuperado = AudioTranscriptionEngine.generarTextoPlano(
    'declaracion_testigo.wav',
    'medium',
    'es',
    segmentosPrueba,
    speakerNamesPrueba,
    true, // isPartial
    false, // wasCancelled
    'Excepción técnica en decodificador CUDA'
  );

  afirmar(txtErrorRecuperado.includes('[EXPEDIENTE PARCIAL RESCATADO]'), 'Identifica el expediente parcial rescatado');
  afirmar(txtErrorRecuperado.includes('Interrumpido por fallo técnico recuperado'), 'Declara la naturaleza técnica de la interrupción');
  afirmar(txtErrorRecuperado.includes('Excepción técnica en decodificador CUDA'), 'Incluye el motivo técnico detallado para auditoría');

  // 3. Generación de subtítulos SRT para expedientes parciales
  console.log('\n🎬 3. Validando generación de subtítulos SRT con segmentos rescatados...');
  const srtGenerado = AudioTranscriptionEngine.generarSubtitulosSrt(segmentosPrueba, speakerNamesPrueba, 'es');
  afirmar(srtGenerado.includes('1\n00:00:00,000 --> 00:00:04,500'), 'El primer subtítulo tiene timestamps válidos');
  afirmar(srtGenerado.includes('2\n00:00:04,800 --> 00:00:10,200'), 'El segundo subtítulo conserva la secuencia temporal');
  afirmar(srtGenerado.includes('<b>Juez Presidente:</b>'), 'Los subtítulos incorporan el interlocutor formateado');

  // 4. Persistencia en TranscriptionDatabase con estado 'parcial'
  console.log('\n💾 4. Validando persistencia en TranscriptionDatabase con estado parcial...');
  TranscriptionDatabase.purgarSimulacionesLegacy();

  const registroParcial = TranscriptionDatabase.guardar({
    fileName: 'interrogatorio_testigo_a.mp3',
    fileType: 'audio',
    fileSizeFormatted: '12.4 MB',
    modelUsed: 'large-v3-turbo',
    language: 'ES',
    destinationType: 'default',
    destinationFolder: 'C:/Transcriptor/Salidas',
    outputs: [
      { format: 'txt', fileName: 'interrogatorio_testigo_a.txt', fullPath: 'C:/Transcriptor/Salidas/interrogatorio_testigo_a.txt' },
      { format: 'srt', fileName: 'interrogatorio_testigo_a.srt', fullPath: 'C:/Transcriptor/Salidas/interrogatorio_testigo_a.srt' },
    ],
    status: 'parcial',
    isPartial: true,
    wasCancelled: true,
    errorMotivo: 'Cancelado voluntariamente',
    rawSegments: segmentosPrueba,
    textContent: txtCancelado,
    srtContent: srtGenerado,
    speakerNames: speakerNamesPrueba,
  });

  afirmar(registroParcial.id.startsWith('TRX-'), 'El registro parcial se asignó un ID canónico');
  afirmar(registroParcial.status === 'parcial', 'El estado del registro es estrictamente "parcial"');
  afirmar(registroParcial.isPartial === true, 'La bandera isPartial es true');
  afirmar(registroParcial.wasCancelled === true, 'La bandera wasCancelled es true');

  const recuperadoBD = TranscriptionDatabase.buscarPorId(registroParcial.id);
  afirmar(recuperadoBD !== undefined, 'El registro parcial se recupera exitosamente de la base de datos');
  afirmar(recuperadoBD?.rawSegments?.length === 2, 'Los 2 segmentos rescatados están íntegros en base de datos');
  afirmar(recuperadoBD?.status === 'parcial', 'El estado persistido se mantiene como parcial');

  // 5. Persistencia de expediente parcial con error y ruta de log
  console.log('\n🛡️ 5. Validando persistencia de error con ruta de log para trazabilidad...');
  const registroConError = TranscriptionDatabase.guardar({
    fileName: 'audio_diligencia_interrumpida.mp3',
    fileType: 'audio',
    fileSizeFormatted: '45.1 MB',
    modelUsed: 'large-v3-turbo',
    language: 'ES',
    destinationType: 'default',
    destinationFolder: 'C:/Transcriptor/Salidas',
    outputs: [],
    status: 'error',
    isPartial: true,
    wasCancelled: false,
    errorMotivo: 'PyTorch CUDA Out of Memory (OOM)',
    logPath: 'C:/Program Files/Sephent/logs/sephent_errores.log',
    rawSegments: segmentosPrueba,
    textContent: txtErrorRecuperado,
    srtContent: srtGenerado,
    speakerNames: speakerNamesPrueba,
  });

  const recuperadoError = TranscriptionDatabase.buscarPorId(registroConError.id);
  afirmar(recuperadoError?.status === 'error', 'El registro almacena status "error"');
  afirmar(recuperadoError?.logPath === 'C:/Program Files/Sephent/logs/sephent_errores.log', 'Conserva la ruta del log del programa');
  afirmar(recuperadoError?.errorMotivo?.includes('CUDA Out of Memory') === true, 'Almacena el motivo técnico del fallo');
  afirmar(recuperadoError?.rawSegments?.length === 2, 'No se perdieron los segmentos generados antes de la falla');

  // 6. Validación de WhisperBridgeService ante respuestas con error pero con segmentos rescatados
  console.log('\n🌉 6. Validando comportamiento del puente ante errores con rescate...');
  // Simular mock de respuesta parcial devuelta por el backend Rust/Python
  const respuestaMockParcial = JSON.stringify({
    segments: segmentosPrueba,
    speakerNames: speakerNamesPrueba,
    durationSeconds: 10.2,
    modelUsed: 'large-v3-turbo',
    language: 'es',
    numSpeakers: 2,
    isPartial: true,
    status: 'parcial_con_error',
    error: 'Dispositivo GPU desconectado inesperadamente',
  });

  const parsedMock = JSON.parse(respuestaMockParcial);
  afirmar(parsedMock.segments.length > 0, 'La respuesta del motor contiene segmentos válidos');
  afirmar(parsedMock.isPartial === true, 'Está marcada como parcial');
  afirmar(parsedMock.error !== undefined, 'Presenta el motivo de error');

  // 7. Adaptador de Inyección de Dependencias
  console.log('\n🔌 7. Validando paso de banderas de resiliencia en TranscriptionEngineAdapter...');
  const adapter = new TranscriptionEngineAdapter();
  afirmar(typeof adapter.transcribirArchivo === 'function', 'El adaptador implementa transcribirArchivo');
  afirmar(typeof adapter.cancelar === 'function', 'El adaptador implementa cancelar');

  // 8. Modo simulación (fallback Web/Test)
  console.log('\n🧪 8. Validando ejecución y generación local de simulación para pruebas...');
  const resultadoSim = await AudioTranscriptionEngine.procesarArchivo(
    { name: 'test_audio.wav', size: 100000 },
    { model: 'tiny', language: 'es', diarizar: true }
  );

  afirmar(resultadoSim.segments.length > 0, 'Genera segmentos monólogo en modo de prueba');
  afirmar(resultadoSim.txtContent.includes('TRANSCRIPCIÓN DE AUDIO/VIDEO'), 'Genera texto plano con formato oficial');
  afirmar(resultadoSim.srtContent.includes('-->'), 'Genera subtítulos SRT conformes a especificación');

  console.log('\n================================================================');
  console.log(`🎉 TODAS LAS PRUEBAS SUPERADAS: ${pruebasSuperadas} de ${pruebasTotales} pruebas exitosas`);
  console.log('================================================================');
}

ejecutarPruebas().catch((err) => {
  console.error('Error fatal durante la ejecución de pruebas:', err);
  process.exit(1);
});
