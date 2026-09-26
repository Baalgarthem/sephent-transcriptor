/**
 * Pruebas Unitarias del Sistema Anti-Truncamiento en Archivos Largos (Estilo Arturo)
 */

import { AntiTruncationService } from '../src/services/transcription/antiTruncationService';
import { IAntiTruncationService } from '../src/core/contracts/IAntiTruncationService';
import { buildApplicationContainer } from '../src/core/di/container';
import { DI_TOKENS } from '../src/core/di/tokens';
import { UserSettingsService } from '../src/services/userSettingsService';
import { AudioTranscriptionEngine } from '../src/services/transcription/audioTranscriptionEngine';
import { RawTranscriptSegment } from '../src/services/reviewer/types';

async function ejecutarPruebas() {
  console.log('================================================================');
  console.log('🛡️ Iniciando Pruebas Unitarias de Anti-Truncamiento (Estilo Arturo)');
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

  const servicio = new AntiTruncationService();

  // 1. Detección de archivos largos
  console.log('🔍 1. Validando discriminación de archivos largos (>600s)...');
  afirmar(!servicio.esArchivoLargo(120), '120s (2 min) NO se clasifica como archivo largo');
  afirmar(!servicio.esArchivoLargo(599), '599s NO se clasifica como archivo largo');
  afirmar(servicio.esArchivoLargo(600), '600s (10 min exactos) SÍ se clasifica como archivo largo');
  afirmar(servicio.esArchivoLargo(3600), '3600s (1 hora) SÍ se clasifica como archivo largo');
  afirmar(servicio.esArchivoLargo(14400), '14400s (4 horas) SÍ se clasifica como archivo largo');

  // 2. Cálculo de ventanas de procesamiento temporal con solapamiento seguro
  console.log('\n🪟 2. Validando cálculo de ventanas temporales continuas...');
  const ventanasCorto = servicio.calcularVentanas(300, 600, 3.0);
  afirmar(ventanasCorto.length === 1, 'Audio de 300s genera exactamente 1 ventana');
  afirmar(ventanasCorto[0].inicioSegundos === 0 && ventanasCorto[0].finSegundos === 300 && ventanasCorto[0].esUltima, 'Ventana única cubre de 0 a 300s y se marca como última');

  // Audio de 1500s (25 minutos) con ventanas de 600s y 3s solapamiento
  const ventanasLargo = servicio.calcularVentanas(1500, 600, 3.0);
  afirmar(ventanasLargo.length === 3, 'Audio de 1500s genera 3 ventanas continuas');
  afirmar(ventanasLargo[0].inicioSegundos === 0 && ventanasLargo[0].finSegundos === 600 && !ventanasLargo[0].esUltima, 'Ventana 1: 0s a 600s');
  afirmar(ventanasLargo[1].inicioSegundos === 597 && ventanasLargo[1].finSegundos === 1197 && !ventanasLargo[1].esUltima, 'Ventana 2: inicia en 597s (solapamiento de 3s)');
  afirmar(ventanasLargo[2].inicioSegundos === 1194 && ventanasLargo[2].finSegundos === 1500 && ventanasLargo[2].esUltima, 'Ventana 3: inicia en 1194s, concluye en 1500s y es la última');

  // 3. Reconciliación de segmentos solapados y desduplicación en la frontera
  console.log('\n🤝 3. Validando reconciliación de segmentos y desduplicación en frontera...');
  const lote1: RawTranscriptSegment[] = [
    { id: 'seg_1', speakerId: 'speaker_01', startTime: 0.0, endTime: 4.5, text: 'Buenos días a todos.', confidence: 0.95 },
    { id: 'seg_2', speakerId: 'speaker_02', startTime: 4.6, endTime: 9.8, text: 'Iniciamos la audiencia pericial.', confidence: 0.92 },
  ];

  const lote2ConDuplicado: RawTranscriptSegment[] = [
    // Este segmento es duplicado del lote 1 en la zona de solapamiento
    { id: 'seg_chunk2_1', speakerId: 'speaker_02', startTime: 7.0, endTime: 9.8, text: 'Iniciamos la audiencia pericial.', confidence: 0.90 },
    // Este es nuevo
    { id: 'seg_chunk2_2', speakerId: 'speaker_01', startTime: 10.0, endTime: 15.2, text: 'Procedo a exponer el informe técnico.', confidence: 0.98 },
  ];

  const reconciliados = servicio.reconciliarSegmentosSolapados(lote1, lote2ConDuplicado, 3.0);
  afirmar(reconciliados.length === 3, 'El segmento duplicado en la frontera fue descartado con éxito (3 en total)');
  afirmar(reconciliados[2].text === 'Procedo a exponer el informe técnico.', 'El nuevo segmento fue añadido');
  afirmar(reconciliados[2].id === 'seg_3', 'Los identificadores secuenciales fueron normalizados coherente y ordenadamente (seg_3)');

  // 4. Auditoría y validación de cobertura temporal completa
  console.log('\n📋 4. Validando auditoría pericial de cobertura temporal...');
  const segmentosCompletos: RawTranscriptSegment[] = [
    { id: 'seg_1', speakerId: 'speaker_01', startTime: 0.0, endTime: 598.5, text: 'Exposición completa.', confidence: 0.95 },
  ];
  const auditCompleto = servicio.validarCobertura(600, segmentosCompletos);
  afirmar(!auditCompleto.tieneTruncamiento, 'Archivo con 598.5s de 600s está dentro de la tolerancia de cola (sin truncamiento)');
  afirmar(auditCompleto.coberturaPorcentaje >= 99.0, `Cobertura calculada alta: ${auditCompleto.coberturaPorcentaje}%`);

  // Archivo severamente truncado: duró 1200s pero la transcripción terminó en 600s
  const segmentosTruncados: RawTranscriptSegment[] = [
    { id: 'seg_1', speakerId: 'speaker_01', startTime: 0.0, endTime: 600.0, text: 'Texto interrumpido a la mitad.', confidence: 0.95 },
  ];
  const auditTruncado = servicio.validarCobertura(1200, segmentosTruncados);
  afirmar(auditTruncado.tieneTruncamiento, 'Detecta correctamente el truncamiento del 50%');
  afirmar(auditTruncado.segundosFaltantes === 600, 'Calcula con precisión que restan 600 segundos no transcritos');
  afirmar(auditTruncado.coberturaPorcentaje === 50.0, 'Calcula exactamente 50.0% de cobertura');

  // 5. Generación de segmentos de rescate pericial
  console.log('\n🛟 5. Validando generación de segmentos de rescate...');
  const rescate = servicio.generarSegmentosRescate(1200, 600, 'es');
  afirmar(rescate.length === 1, 'Genera segmento de rescate acústico');
  afirmar(rescate[0].startTime === 600 && rescate[0].endTime === 1200, 'El rescate cubre el intervalo faltante exacto [600s a 1200s]');
  afirmar(rescate[0].text.includes('Cierre de registro acústico'), 'El texto pericial documenta formalmente el cierre');

  // 6. Integración en el Contenedor de Inyección de Dependencias (DI)
  console.log('\n💉 6. Validando resolución de IAntiTruncationService en el Contenedor DI...');
  const diContainer = buildApplicationContainer();
  afirmar(diContainer.has(DI_TOKENS.ANTI_TRUNCATION), 'El token ANTI_TRUNCATION está registrado en el contenedor canónico');

  const servicioDesdeDI = diContainer.resolve<IAntiTruncationService>(DI_TOKENS.ANTI_TRUNCATION);
  afirmar(servicioDesdeDI !== null && servicioDesdeDI !== undefined, 'El servicio fue resuelto exitosamente desde el DI');
  afirmar(servicioDesdeDI.esArchivoLargo(1000) === true, 'El servicio resuelto ejecuta los métodos del contrato IAntiTruncationService');

  const segundaInstanciaDI = diContainer.resolve<IAntiTruncationService>(DI_TOKENS.ANTI_TRUNCATION);
  afirmar(servicioDesdeDI === segundaInstanciaDI, 'IAntiTruncationService es un Singleton en el contenedor DI');

  // 7. Persistencia en UserSettingsService
  console.log('\n⚙️ 7. Validando configuración de usuario para evitarTruncamiento...');
  const configActual = UserSettingsService.obtenerConfiguracion();
  afirmar(configActual.evitarTruncamiento !== undefined, 'La propiedad evitarTruncamiento existe en la configuración');

  UserSettingsService.guardarConfiguracion({ evitarTruncamiento: false });
  afirmar(UserSettingsService.obtenerConfiguracion().evitarTruncamiento === false, 'Permite desactivar la opción');

  UserSettingsService.guardarConfiguracion({ evitarTruncamiento: true });
  afirmar(UserSettingsService.obtenerConfiguracion().evitarTruncamiento === true, 'Permite reactivar y persiste en true por defecto');

  // 8. Integración con AudioTranscriptionEngine (sin techos artificiales)
  console.log('\n🚀 8. Validando AudioTranscriptionEngine en archivos de larga duración...');
  const archivoLargoSimulado = {
    name: 'audiencia_completa_2_horas.mp3',
    size: 115200000, // ~115 MB
  };

  const resultadoAudio = await AudioTranscriptionEngine.procesarArchivo(archivoLargoSimulado as any, {
    model: 'base',
    language: 'es',
    diarizar: true,
    evitarTruncamiento: true,
  });

  afirmar(resultadoAudio.durationSeconds > 600, `Duración calculada no fue truncada a 10 min: ${resultadoAudio.durationSeconds.toFixed(1)}s`);
  afirmar(resultadoAudio.segments.length > 25, `Segmentos generados no fueron truncados a 25 turnos: ${resultadoAudio.segments.length} segmentos`);

  const ultimoSegmento = resultadoAudio.segments[resultadoAudio.segments.length - 1];
  afirmar(ultimoSegmento.endTime >= resultadoAudio.durationSeconds - 5.0, 'El último segmento cubre hasta el final de la grabación sin truncamiento');

  console.log('\n================================================================');
  console.log(`🎉 Todas las pruebas de Anti-Truncamiento superadas con éxito: ${pruebasSuperadas}/${pruebasTotales}`);
  console.log('================================================================\n');
}

ejecutarPruebas().catch((err) => {
  console.error('Error fatal durante la ejecución de pruebas:', err);
  process.exit(1);
});
