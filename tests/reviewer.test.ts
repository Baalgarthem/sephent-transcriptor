/**
 * Pruebas unitarias y de integración para el Módulo de Revisión y Depuración Inteligente Pericial
 */

import { DictionaryService } from '../src/services/reviewer/dictionary/dictionaryService';
import { CustomDictionaryService } from '../src/services/reviewer/dictionary/customDictionaryService';
import { PhoneticNormalizer } from '../src/services/reviewer/correction/phoneticNormalizer';
import { StringSimilarity } from '../src/services/reviewer/correction/stringSimilarity';
import { AcronymResolver } from '../src/services/reviewer/correction/acronymResolver';
import { CorrectionEngine } from '../src/services/reviewer/correction/correctionEngine';
import { MergeRules } from '../src/services/reviewer/reconstruction/mergeRules';
import { SegmentMergerEngine } from '../src/services/reviewer/reconstruction/segmentMergerEngine';
import { SpeakerRegistry } from '../src/services/reviewer/speakers/speakerRegistry';
import { SpeakerPalette } from '../src/services/reviewer/speakers/speakerPalette';
import { TranscriptionReviewerService } from '../src/services/reviewer/transcriptionReviewerService';
import { ReviewerDatabase } from '../src/services/reviewer/storage/reviewerDatabase';
import { RawTranscriptSegment } from '../src/services/reviewer/types';

async function ejecutarPruebasRevisor() {
  console.log('========================================================');
  console.log('🧪 Iniciando Pruebas del Módulo de Revisión y Depuración Pericial');
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

  // 1. Diccionario Especializado y Extensible
  console.log('📖 1. Validando Diccionario Canónico y Personalizado...');
  CustomDictionaryService.limpiarTodo();
  const catalogoBase = DictionaryService.obtenerCatalogoCompleto();
  afirmar(catalogoBase.length >= 20, `Catálogo canónico contiene ${catalogoBase.length} términos especializados`);

  const terminoCfe = DictionaryService.buscarPorTermino('CFE');
  afirmar(Boolean(terminoCfe), 'Término CFE está registrado en el catálogo oficial');
  afirmar(terminoCfe?.category === 'siglas', 'Categoría de CFE es "siglas"');

  // Agregar término personalizado
  const nuevoTermino = CustomDictionaryService.agregarTermino({
    term: 'COFECE',
    category: 'siglas',
    acronymExpanded: 'Comisión Federal de Competencia Económica',
    frequentMisrecognitions: ['cofese', 'co fe ce'],
    contextKeywords: ['competencia', 'mercado', 'monopolio'],
  });
  afirmar(Boolean(DictionaryService.buscarPorTermino('COFECE')), 'Término personalizado COFECE añadido exitosamente');
  afirmar(CustomDictionaryService.obtenerTodos().length === 1, 'Diccionario personalizado registra 1 término');

  CustomDictionaryService.eliminarTermino(nuevoTermino.id);
  afirmar(CustomDictionaryService.obtenerTodos().length === 0, 'Eliminación de término personalizado funciona correctamente');

  // 2. Normalización Fonética y Similitud Ortográfica
  console.log('\n🔊 2. Validando Normalización Fonética y Similitud...');
  const fonetico1 = PhoneticNormalizer.normalizarFoneticamente('litisconsorcio');
  const fonetico2 = PhoneticNormalizer.normalizarFoneticamente('litisconsorzio');
  afirmar(fonetico1 === fonetico2, `Normalización fonética de seseo z/s coincide: "${fonetico1}" === "${fonetico2}"`);

  const deletreoCfe = PhoneticNormalizer.normalizarDeletreoSigla('se fe e');
  afirmar(deletreoCfe === 'cfe', `Normalización fonética de deletreo "se fe e" produce "cfe": "${deletreoCfe}"`);

  const simExacta = StringSimilarity.similitudNormalizada('software', 'software');
  afirmar(simExacta === 1.0, 'Similitud de palabras idénticas es exactamente 1.0');

  const simAproximada = StringSimilarity.similitudNormalizada('sofware', 'software');
  afirmar(simAproximada >= 0.85, `Similitud aproximada Damerau-Levenshtein es alta (${simAproximada.toFixed(2)})`);

  // 3. Resolvedor Especializado de Siglas
  console.log('\n🏛️ 3. Validando AcronymResolver (Siglas y Nomenclaturas)...');
  const resEspaciado = AcronymResolver.resolverSiglaEnTexto('C F E', 'pago de C F E', [terminoCfe!]);
  afirmar(Boolean(resEspaciado?.matched), 'Detecta y resuelve sigla espaciada "C F E" hacia CFE');
  afirmar(resEspaciado?.matchedAcronym === 'CFE', 'Sigla resuelta es "CFE"');

  const resContextual = AcronymResolver.resolverSiglaEnTexto('CF', 'recibo de luz ante la CF por la tarifa de electricidad', [terminoCfe!]);
  afirmar(Boolean(resContextual?.matched), 'Detecta "CF" con apoyo de contexto eléctrico y lo resuelve a CFE');
  afirmar(resContextual?.confidence! >= 0.90, `Confianza contextual de CFE es alta: ${resContextual?.confidence}`);

  // 4. Motor de Corrección Léxico-Contextual
  console.log('\n🔍 4. Validando CorrectionEngine (Auto-seguras vs Sugerencias)...');
  const evaluacion = CorrectionEngine.depurarTexto('Fuimos a las oficinas de C F E para pagar el recibo.');
  afirmar(evaluacion.reviewedText.includes('CFE'), `Texto revisado corrigió "C F E" hacia "CFE": "${evaluacion.reviewedText}"`);
  afirmar(evaluacion.corrections.length >= 1, 'Se generó bitácora de corrección');
  afirmar(evaluacion.corrections[0].type === 'auto_safe', 'La corrección de sigla fue clasificada como auto_safe');

  // 5. Reconstructor de Oraciones y Fusión de Segmentos
  console.log('\n🧩 5. Validando Reconstrucción de Oraciones y Fusión de Segmentos...');
  const seg1: RawTranscriptSegment = {
    id: 's1',
    speakerId: 'speaker_01',
    startTime: 10.0,
    endTime: 12.5,
    text: 'el documento fue entregado ayer',
  };
  const seg2: RawTranscriptSegment = {
    id: 's2',
    speakerId: 'speaker_01',
    startTime: 12.8,
    endTime: 15.0,
    text: 'por la tarde.',
  };
  const segDistintoHablante: RawTranscriptSegment = {
    id: 's3',
    speakerId: 'speaker_02',
    startTime: 15.2,
    endTime: 18.0,
    text: '¿Tiene el acuse de recibo?',
  };

  const decisionUnir = MergeRules.debenFusionarse(seg1, seg2);
  afirmar(decisionUnir.debeUnir === true, 'Segmentos continuos del mismo hablante con pausa corta deben unirse');

  const decisionNoUnir = MergeRules.debenFusionarse(seg2, segDistintoHablante);
  afirmar(decisionNoUnir.debeUnir === false, 'Segmentos de distinto hablante NUNCA deben unirse');

  const bloques = SegmentMergerEngine.reconstruirYDepurarSegmentos([seg1, seg2, segDistintoHablante]);
  afirmar(bloques.length === 2, `Reconstruyó 3 microfragmentos en 2 bloques semánticos (actual: ${bloques.length})`);

  const bloque1 = bloques[0];
  afirmar(bloque1.startTime === 10.0, `Timestamp inicial del bloque unificado es el del primer segmento (10.0): ${bloque1.startTime}`);
  afirmar(bloque1.endTime === 15.0, `Timestamp final del bloque unificado es el del último segmento (15.0): ${bloque1.endTime}`);
  afirmar(bloque1.wasMerged === true, 'El bloque 1 está marcado como wasMerged: true');
  afirmar(bloque1.originalSegments.length === 2, 'Bloque 1 conserva los 2 segmentos originales intactos para cotejo');

  // 6. Gestión de Hablantes y Diarización
  console.log('\n👥 6. Validando SpeakerRegistry y Paleta Cromática...');
  const registry = new SpeakerRegistry();
  const perfil1 = registry.registrarODescubrirHablante('speaker_01', 'Persona 1');
  afirmar(perfil1.speakerId === 'speaker_01', 'Identificador técnico inmutable es speaker_01');
  afirmar(perfil1.displayName === 'Persona 1', 'Nombre inicial es Persona 1');
  afirmar(Boolean(perfil1.color), 'Se asignó color ejecutivo al hablante');

  const perfilRenombrado = registry.renombrarHablante('speaker_01', 'Pedro González');
  afirmar(perfilRenombrado.speakerId === 'speaker_01', 'Identificador técnico inmutable permanece como speaker_01');
  afirmar(perfilRenombrado.displayName === 'Pedro González', 'Nombre visible actualizado a "Pedro González"');

  // 7. Servicio Orquestador de Revisión Pericial
  console.log('\n⚖️ 7. Validando TranscriptionReviewerService (Expediente Pericial)...');
  const dossier = TranscriptionReviewerService.crearExpediente({
    sourceFileName: 'audiencia_laboral_caso_01.mp3',
    originalTranscriptionId: 'TRX-TEST-001',
    rawSegments: [seg1, seg2, segDistintoHablante],
    nombresInicialesHablantes: {
      speaker_01: 'Persona 1',
      speaker_02: 'Persona 2',
    },
  });

  afirmar(dossier.reviewedBlocks.length === 2, 'Dossier contiene 2 bloques revisados');
  afirmar(dossier.originalSegments.length === 3, 'Dossier conserva los 3 segmentos originales intactos');

  // Renombrar hablante y verificar propagación inmediata a todos los bloques
  const dossierActualizado = TranscriptionReviewerService.renombrarHablanteEnDossier(
    dossier,
    'speaker_01',
    'Lic. Pedro González'
  );
  afirmar(
    dossierActualizado.reviewedBlocks[0].speakerName === 'Lic. Pedro González',
    'El bloque 1 actualizó el nombre visible del hablante a "Lic. Pedro González"'
  );
  afirmar(
    dossierActualizado.reviewedBlocks[0].speakerId === 'speaker_01',
    'El bloque 1 preserva el ID técnico "speaker_01"'
  );

  // Exportar texto depurado
  const textoExportado = TranscriptionReviewerService.exportarTextoDepurado(dossierActualizado);
  afirmar(textoExportado.includes('Lic. Pedro González'), 'Texto exportado contiene el nombre del hablante');
  afirmar(textoExportado.includes('[00:00:10 - 00:00:15]'), 'Texto exportado contiene el rango de timestamps exacto');

  // Exportar SRT
  const srtExportado = TranscriptionReviewerService.exportarSrtDepurado(dossierActualizado);
  afirmar(srtExportado.includes('00:00:10,000 --> 00:00:15,000'), 'Subtítulos SRT exportados contienen timestamps formateados');

  // Exportar Informe Pericial de Cambios
  const informeMd = TranscriptionReviewerService.generarInformePericialCambios(dossierActualizado);
  afirmar(informeMd.includes('Dictamen de Trazabilidad y Depuración Ortotipográfica'), 'Dictamen de trazabilidad pericial generado correctamente');

  // 8. Validando Búsqueda y Persistencia de Expediente por ID de Transcripción
  console.log('\n🗄️ 8. Validando Persistencia de Expediente por ID de Transcripción...');
  const expedienteEncontrado = ReviewerDatabase.buscarPorTranscripcionId('TRX-TEST-001');
  afirmar(expedienteEncontrado !== null, 'buscarPorTranscripcionId recupera el dossier asociado a la transcripción');
  afirmar(expedienteEncontrado?.speakers['speaker_01']?.displayName === 'Lic. Pedro González', 'El expediente recuperado conserva los nombres de hablantes modificados');

  // 9. Validando Unión Interactiva de Bloques y Generación de TXT/SRT en Caliente
  console.log('\n🔗 9. Validando Unión Interactiva de Bloques (unirBloques) y Generación en Caliente...');
  const blockId1 = dossierActualizado.reviewedBlocks[0].id;
  const blockId2 = dossierActualizado.reviewedBlocks[1].id;
  const dossierUnido = TranscriptionReviewerService.unirBloques(dossierActualizado, [blockId1, blockId2]);

  afirmar(dossierUnido.reviewedBlocks.length === 1, `unirBloques redujo los 2 bloques a 1 solo bloque continuo (restantes: ${dossierUnido.reviewedBlocks.length})`);
  const bloqueFusionado = dossierUnido.reviewedBlocks[0];
  afirmar(bloqueFusionado.startTime === 10.0, 'El bloque fusionado inicia en el startTime del primer bloque (10.0)');
  afirmar(bloqueFusionado.endTime === 18.0, `El bloque fusionado finaliza en el endTime del último bloque (18.0): ${bloqueFusionado.endTime}`);
  afirmar(bloqueFusionado.speakerName === 'Lic. Pedro González', 'El bloque fusionado mantiene el nombre del primer hablante');
  afirmar(bloqueFusionado.wasMerged === true, 'El bloque fusionado está marcado con wasMerged: true');

  const txtGenerado = TranscriptionReviewerService.generarTxtDesdeBloques(dossierUnido);
  afirmar(txtGenerado.includes('Lic. Pedro González:'), 'generarTxtDesdeBloques contiene el nombre del hablante con dos puntos');
  afirmar(txtGenerado.includes('[00:00:10 - 00:00:18]'), 'generarTxtDesdeBloques contiene el intervalo de tiempo completo');

  const srtGenerado = TranscriptionReviewerService.generarSrtDesdeBloques(dossierUnido);
  afirmar(srtGenerado.includes('00:00:10,000 --> 00:00:18,000'), 'generarSrtDesdeBloques contiene las marcas de tiempo en formato SRT');
  afirmar(srtGenerado.includes('Lic. Pedro González:'), 'generarSrtDesdeBloques incluye el nombre del hablante');

  console.log('\n========================================================');
  console.log(`🎉 Resultados: ${superadas} de ${totales} pruebas PASARON exitosamente.`);
  console.log('========================================================\n');
}

ejecutarPruebasRevisor().catch((err) => {
  console.error('Error al ejecutar pruebas del revisor:', err);
  process.exit(1);
});
