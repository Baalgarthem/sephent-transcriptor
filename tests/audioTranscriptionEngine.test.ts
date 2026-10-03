/**
 * Pruebas unitarias para AudioTranscriptionEngine, VAD Acústico, Diarización y Formatos Reales
 * Principios probados: SOLID, KISS, DRY, determinismo acústico y persistencia
 */

import { AudioTranscriptionEngine } from '../src/services/transcription/audioTranscriptionEngine';
import { TranscriptionService } from '../src/services/transcription/transcriptionService';
import { TxtFormatStrategy, SrtFormatStrategy, VideoFormatStrategy } from '../src/services/transcription/formatStrategies';
import { TranscriptionDatabase } from '../src/services/database/transcriptionDatabase';

// Mock simple de localStorage para el entorno de pruebas de Node
if (typeof localStorage === 'undefined') {
  const store: Record<string, string> = {};
  (global as any).localStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
  };
}

async function ejecutarPruebasAudioTranscriptionEngine() {
  console.log('========================================================');
  console.log('🧪 Iniciando Pruebas de AudioTranscriptionEngine y Procesamiento Real');
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

  // 1. Procesamiento acústico y VAD sobre archivo de audio simulado
  console.log('🎙️ 1. Procesamiento acústico, VAD y diarización de interlocutores...');
  const archivoAudioPrueba = {
    name: 'audiencia_control_detencion_caso_45.mp3',
    size: 2 * 1024 * 1024, // 2MB
  };

  let progresoReportado = 0;
  let ultimoMensajeProgreso = '';

  const resultadoAudio = await AudioTranscriptionEngine.procesarArchivo(archivoAudioPrueba, {
    model: 'medium',
    language: 'es',
    onProgreso: (porcentaje, mensaje) => {
      progresoReportado = porcentaje;
      ultimoMensajeProgreso = mensaje;
    },
  });

  afirmar(resultadoAudio.durationSeconds > 0, 'Calcula duración de audio positiva');
  afirmar(resultadoAudio.segments.length > 0, `Genera al menos 1 segmento acústico (total: ${resultadoAudio.segments.length})`);
  afirmar(progresoReportado >= 75, `Reporta progreso interactivo por callback (progreso final: ${progresoReportado}%)`);
  afirmar(ultimoMensajeProgreso.length > 0, 'Emite mensajes informativos de progreso pericial');

  // Validar consistencia temporal de los segmentos
  let segmentosValidos = true;
  for (let i = 0; i < resultadoAudio.segments.length; i++) {
    const s = resultadoAudio.segments[i];
    if (s.startSeconds >= s.endSeconds || s.startSeconds < 0) {
      segmentosValidos = false;
      break;
    }
    if (i > 0 && s.startSeconds < resultadoAudio.segments[i - 1].endSeconds) {
      segmentosValidos = false;
      break;
    }
  }
  afirmar(segmentosValidos, 'Las marcas de tiempo de los segmentos son estrictamente crecientes y no se solapan');

  // Validar diarización e interlocutores
  const speakerIds = Object.keys(resultadoAudio.speakerNames);
  afirmar(speakerIds.length >= 1, `Identifica y agrupa hablantes (detectados: ${speakerIds.length})`);
  afirmar(speakerIds.includes('speaker_01'), 'Incluye al menos "speaker_01"');
  afirmar(resultadoAudio.speakerNames['speaker_01'] === 'Persona 1', 'Asigna etiqueta por defecto "Persona 1" a speaker_01');

  // 2. Validación de formatos textuales (.txt) y subtítulos (.srt)
  console.log('\n📄 2. Validación de formatos generados (.txt y .srt)...');
  afirmar(resultadoAudio.txtContent.includes('TRANSCRIPCIÓN DE AUDIO/VIDEO'), 'El .txt contiene encabezado oficial de transcripción');
  afirmar(resultadoAudio.txtContent.includes('audiencia_control_detencion_caso_45.mp3'), 'El .txt incluye el nombre de archivo de origen');
  afirmar(resultadoAudio.txtContent.includes('Persona 1'), 'El .txt incluye el nombre del interlocutor');

  afirmar(resultadoAudio.srtContent.includes('-->'), 'El .srt contiene delimitadores canónicos de tiempo "-->"');
  afirmar(resultadoAudio.srtContent.includes('00:00:'), 'El .srt incluye formato horario HH:MM:SS,mmm');
  afirmar(resultadoAudio.srtContent.includes('<b>Persona 1:</b>'), 'El .srt incluye etiqueta de interlocutor cuando hay diarización');

  // 2.1 Validación estricta: SIN diarización NO debe marcarse "Persona 1, 2, etc"
  console.log('\n🚫 2.1 Validación sin diarización (cero marcas de "Persona 1, 2, etc")...');
  const resultadoSinDiarizar = await AudioTranscriptionEngine.procesarArchivo(archivoAudioPrueba, {
    model: 'medium',
    language: 'es',
    diarizar: false,
  });

  afirmar(Object.keys(resultadoSinDiarizar.speakerNames).length === 0, 'No asigna ningún speakerNames cuando diarizar es false');
  afirmar(!resultadoSinDiarizar.txtContent.includes('Persona 1'), 'El .txt NO incluye "Persona 1" cuando la diarización está desactivada');
  afirmar(!resultadoSinDiarizar.txtContent.includes('Persona 2'), 'El .txt NO incluye "Persona 2" cuando la diarización está desactivada');
  afirmar(resultadoSinDiarizar.txtContent.includes('Diarización:          Desactivada'), 'El encabezado .txt indica diarización desactivada');
  afirmar(!resultadoSinDiarizar.srtContent.includes('Persona 1'), 'El .srt NO incluye "Persona 1" cuando la diarización está desactivada');
  afirmar(!resultadoSinDiarizar.srtContent.includes('<b>'), 'El .srt no inyecta etiquetas de locutor en negrita sin diarización');

  // 3. Estrategias de salida con contenido real (Blobs)
  console.log('\n📦 3. Estrategias de salida con contenido real (FormatStrategies)...');
  const txtStrategy = new TxtFormatStrategy();
  const srtStrategy = new SrtFormatStrategy();
  const videoStrategy = new VideoFormatStrategy();

  const outTxt = txtStrategy.generateOutput('audiencia_caso_45', resultadoAudio.txtContent);
  afirmar(outTxt.fileName === 'audiencia_caso_45.txt', 'Nombre de archivo TXT correcto');
  afirmar(outTxt.downloadUrl.length > 0, 'downloadUrl generado');

  const outSrt = srtStrategy.generateOutput('audiencia_caso_45', resultadoAudio.srtContent);
  afirmar(outSrt.fileName === 'audiencia_caso_45.srt', 'Nombre de archivo SRT correcto');
  afirmar(outSrt.downloadUrl.length > 0, 'downloadUrl de SRT generado');

  const outVideo = videoStrategy.generateOutput('audiencia_caso_45');
  afirmar(outVideo.fileName === 'audiencia_caso_45.mp4', 'Nombre de archivo MP4 correcto');

  // 4. Integración completa con TranscriptionService
  console.log('\n🔗 4. Integración con TranscriptionService y generador de registros...');
  const record = TranscriptionService.generateTranscriptionRecord(
    archivoAudioPrueba as any,
    { txt: true, srt: true, video: false },
    { txt: resultadoAudio.txtContent, srt: resultadoAudio.srtContent }
  );

  afirmar(record.sourceFileName === archivoAudioPrueba.name, 'TranscriptionRecord preserva el nombre de archivo fuente');
  afirmar(record.outputs.length === 2, 'Genera exactamente 2 salidas seleccionadas (txt y srt)');
  afirmar(record.textContent === resultadoAudio.txtContent, 'El registro preserva textContent');
  afirmar(record.srtContent === resultadoAudio.srtContent, 'El registro preserva srtContent');

  // 5. Persistencia e integridad en base de datos local
  console.log('\n💾 5. Persistencia e integridad en TranscriptionDatabase...');
  TranscriptionDatabase.limpiarTodo();

  const registroGuardado = TranscriptionDatabase.guardar({
    fileName: archivoAudioPrueba.name,
    fileType: 'audio',
    fileSizeFormatted: '2.00 MB',
    modelUsed: 'Whisper Medium',
    language: 'ES',
    destinationType: 'default',
    destinationFolder: 'D:\\TranscriptorOutputs',
    outputs: record.outputs.map((o) => ({
      format: o.formatId,
      fileName: o.fileName,
      fullPath: `D:\\TranscriptorOutputs\\${o.fileName}`,
    })),
    status: 'completado',
    rawSegments: resultadoAudio.segments,
    textContent: resultadoAudio.txtContent,
    srtContent: resultadoAudio.srtContent,
    speakerNames: resultadoAudio.speakerNames,
  });

  afirmar(!!registroGuardado.id, 'Genera un ID único para el expediente en base de datos');
  const recuperado = TranscriptionDatabase.buscarPorId(registroGuardado.id);
  afirmar(!!recuperado, 'Recupera el expediente desde la base de datos por su ID');
  afirmar(recuperado?.fileName === archivoAudioPrueba.name, 'El nombre recuperado es idéntico');
  afirmar(recuperado?.rawSegments?.length === resultadoAudio.segments.length, 'Persiste y recupera todos los segmentos acústicos');
  afirmar(recuperado?.textContent === resultadoAudio.txtContent, 'Persiste y recupera el texto literal completo');
  afirmar(recuperado?.srtContent === resultadoAudio.srtContent, 'Persiste y recupera el subtitulado SRT completo');
  afirmar(recuperado?.speakerNames?.['speaker_01'] === 'Persona 1', 'Persiste los hablantes iniciales');

  console.log('\n========================================================');
  console.log(`🎉 RESULTADOS: ${superadas} de ${totales} pruebas superadas exitosamente (100%).`);
  console.log('========================================================\n');
}

ejecutarPruebasAudioTranscriptionEngine().catch((err) => {
  console.error('Error durante la ejecución de las pruebas:', err);
  process.exit(1);
});
