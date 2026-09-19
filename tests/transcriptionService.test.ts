/**
 * Pruebas unitarias para TranscriptionService, Strategy Pattern y preservación de nombres de archivo
 * Principios probados: SOLID (SRP, OCP, LSP, ISP, DIP), KISS y DRY
 */

import { TranscriptionService } from '../src/services/transcription/transcriptionService';
import { OutputFormatFactory, TxtFormatStrategy, SrtFormatStrategy, VideoFormatStrategy } from '../src/services/transcription/formatStrategies';

async function ejecutarPruebasTranscriptionService() {
  console.log('========================================================');
  console.log('🧪 Iniciando Pruebas de TranscriptionService y Formatos (SOLID & DRY)');
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

  // 1. Extracción de nombre base (KISS / DRY)
  console.log('📂 1. Validando extracción de nombre base (extractBaseName)...');
  afirmar(
    TranscriptionService.extractBaseName('declaracion_testigo.mp3') === 'declaracion_testigo',
    'Extrae nombre base simple: "declaracion_testigo.mp3" -> "declaracion_testigo"'
  );
  afirmar(
    TranscriptionService.extractBaseName('audiencia.pericial.caso.2026.final.wav') === 'audiencia.pericial.caso.2026.final',
    'Maneja archivos con múltiples puntos: conserva todos los puntos intermedios'
  );
  afirmar(
    TranscriptionService.extractBaseName('archivo_sin_extension') === 'archivo_sin_extension',
    'Maneja archivo sin extensión sin alterar el nombre'
  );

  // 2. Estrategias de formato individuales (Strategy Pattern / Open-Closed Principle)
  console.log('\n📐 2. Validando Strategy Pattern para formatos de salida...');
  const txtStrategy = new TxtFormatStrategy();
  const srtStrategy = new SrtFormatStrategy();
  const videoStrategy = new VideoFormatStrategy();

  const outTxt = txtStrategy.generateOutput('expediente_001');
  afirmar(outTxt.fileName === 'expediente_001.txt', 'TxtFormatStrategy genera "expediente_001.txt" idéntico');
  afirmar(outTxt.extension === 'txt', 'Extensión correcta: txt');

  const outSrt = srtStrategy.generateOutput('expediente_001');
  afirmar(outSrt.fileName === 'expediente_001.srt', 'SrtFormatStrategy genera "expediente_001.srt" idéntico');
  afirmar(outSrt.extension === 'srt', 'Extensión correcta: srt');

  const outVideo = videoStrategy.generateOutput('expediente_001');
  afirmar(outVideo.fileName === 'expediente_001.mp4', 'VideoFormatStrategy genera "expediente_001.mp4" idéntico');
  afirmar(outVideo.extension === 'mp4', 'Extensión correcta: mp4');

  // 3. Factoría de formatos (Factory Pattern / DIP)
  console.log('\n🏭 3. Validando OutputFormatFactory...');
  const estrategias = OutputFormatFactory.getStrategies({ txt: true, srt: true, video: false });
  afirmar(estrategias.length === 2, 'Retorna exactamente 2 estrategias para txt y srt');
  afirmar(estrategias.some((e) => e.formatId === 'txt'), 'Contiene estrategia txt');
  afirmar(estrategias.some((e) => e.formatId === 'srt'), 'Contiene estrategia srt');

  // 4. Servicio completo (Regla de negocio del usuario: mismo nombre, solo cambia formato)
  console.log('\n🎯 4. Validando regla del usuario: Salidas con nombre idéntico al archivo cargado...');
  const archivoMock = {
    name: 'acta_audiencia_penal_14_septiembre.m4a',
    size: 25000000,
  };

  const registro = TranscriptionService.generateTranscriptionRecord(archivoMock as any, {
    txt: true,
    srt: true,
    video: true,
  });

  afirmar(registro.sourceFileName === 'acta_audiencia_penal_14_septiembre.m4a', 'Registra archivo fuente original');
  afirmar(registro.baseName === 'acta_audiencia_penal_14_septiembre', 'Identifica baseName idéntico');
  afirmar(registro.outputs.length === 3, 'Genera 3 salidas correspondientes a los 3 formatos seleccionados');

  const nombresGenerados = registro.outputs.map((o) => o.fileName);
  afirmar(
    nombresGenerados.includes('acta_audiencia_penal_14_septiembre.txt'),
    'Salida TXT tiene el nombre exacto del archivo cargado: acta_audiencia_penal_14_septiembre.txt'
  );
  afirmar(
    nombresGenerados.includes('acta_audiencia_penal_14_septiembre.srt'),
    'Salida SRT tiene el nombre exacto del archivo cargado: acta_audiencia_penal_14_septiembre.srt'
  );
  afirmar(
    nombresGenerados.includes('acta_audiencia_penal_14_septiembre.mp4'),
    'Salida Video tiene el nombre exacto del archivo cargado: acta_audiencia_penal_14_septiembre.mp4'
  );

  console.log('\n========================================================');
  console.log(`🎉 Resultados: ${superadas} de ${totales} pruebas PASARON exitosamente.`);
  console.log('========================================================');
}

ejecutarPruebasTranscriptionService().catch((err) => {
  console.error('Error al ejecutar pruebas de TranscriptionService:', err);
  process.exit(1);
});
