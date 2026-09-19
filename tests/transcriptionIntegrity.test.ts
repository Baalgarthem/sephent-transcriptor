/**
 * Pruebas unitarias de Integridad Criptográfica Forense,
 * Marcado de Revisión Obligatorio y Bloqueo Estricto de Informe de Transcripción.
 */

import { TranscriptionReviewerService } from '../src/services/reviewer/transcriptionReviewerService';
import { TranscriptionDatabase } from '../src/services/database/transcriptionDatabase';

async function ejecutarPruebasIntegridad() {
  console.log('========================================================');
  console.log('🧪 Iniciando Pruebas de Integridad, Hashes y Validación Pericial');
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

  // 1. Validando Cálculo Criptográfico de Hash SHA-256
  console.log('🛡️ 1. Validando Cálculo de Hash SHA-256 de Integridad...');
  const segmentosPrueba = [
    { id: 'seg_1', speakerId: 'speaker_01', startTime: 0, endTime: 5, text: 'Declaración inicial del imputado.', confidence: 0.95 },
    { id: 'seg_2', speakerId: 'speaker_02', startTime: 5.5, endTime: 10, text: 'Pregunta formulada por el ministerio público.', confidence: 0.92 },
  ];
  const dossier = TranscriptionReviewerService.crearExpediente({
    sourceFileName: 'declaracion_imputado.mp3',
    originalTranscriptionId: 'TRX-TEST-001',
    rawSegments: segmentosPrueba,
    nombresInicialesHablantes: {
      speaker_01: 'Lic. Roberto Méndez',
      speaker_02: 'Perito Forense Gómez',
    },
  });

  afirmar(!dossier.revisado, 'El expediente inicia sin revisar (revisado: falsy)');
  afirmar(!dossier.hashSha256, 'El expediente inicia sin hash calculado');

  const hashCalculado = await TranscriptionReviewerService.generarHashIntegridad(dossier);
  afirmar(typeof hashCalculado === 'string', 'El hash calculado es una cadena de texto');
  afirmar(hashCalculado.length === 64, `El hash SHA-256 tiene longitud exacta de 64 caracteres hex (actual: ${hashCalculado.length})`);
  afirmar(/^[a-f0-9]{64}$/i.test(hashCalculado), 'El hash generado contiene caracteres hexadecimales válidos');

  // Mismo contenido produce mismo hash
  const hashSegundo = await TranscriptionReviewerService.generarHashIntegridad(dossier);
  afirmar(hashCalculado === hashSegundo, 'El cálculo del hash SHA-256 es determinista y consistente');

  // 2. Validando Bloqueo Estricto de Informe si NO está Revisada
  console.log('\n🔒 2. Validando Bloqueo Estricto de Informe de Transcripción...');
  let bloqueoExitoso = false;
  try {
    TranscriptionReviewerService.generarInformeOficialTranscripcion(dossier);
  } catch (err: any) {
    bloqueoExitoso = true;
    afirmar(
      err.message.includes('Bloqueo de seguridad: No se puede realizar el informe'),
      'Lanza excepción pericial detallando el motivo de bloqueo por falta de revisión'
    );
  }
  afirmar(bloqueoExitoso, 'Imposible emitir el informe de transcripción sin haber marcado la transcripción como revisada');

  // 3. Validando Marcado de Revisión y Desbloqueo de Informe
  console.log('\n☑️ 3. Validando Marcado de Revisión y Generación de Informe...');
  const dossierRevisado = TranscriptionReviewerService.marcarComoRevisado(dossier, true, hashCalculado);
  afirmar(dossierRevisado.revisado === true, 'Expediente marcado exitosamente como revisado (revisado: true)');
  afirmar(typeof dossierRevisado.fechaRevision === 'string', 'Registra la fecha y hora de revisión en formato ISO');
  afirmar(dossierRevisado.hashSha256 === hashCalculado, 'Registra la firma SHA-256 dentro del expediente');

  const informeOficial = TranscriptionReviewerService.generarInformeOficialTranscripcion(dossierRevisado, {
    notasPericiales: 'Declaración tomada bajo protesta de decir verdad. Audio cotejado en sala.',
    nombreGrupo: 'Causa Penal 2026/89',
  });

  afirmar(typeof informeOficial === 'string' && informeOficial.length > 200, 'Informe oficial generado correctamente');
  afirmar(informeOficial.includes('INFORME OFICIAL DE TRANSCRIPCIÓN Y ACTA PERICIAL'), 'Contiene el encabezado oficial pericial');
  afirmar(informeOficial.includes(hashCalculado), 'El informe incluye la firma digital Hash SHA-256');
  afirmar(informeOficial.includes('CERTIFICADO Y REVISADO [✓ APROBADO]'), 'El informe incluye el sello de validación aprobado');
  afirmar(informeOficial.includes('Lic. Roberto Méndez'), 'El informe incluye el nombre asignado al primer hablante');
  afirmar(informeOficial.includes('Perito Forense Gómez'), 'El informe incluye el nombre asignado al segundo hablante');
  afirmar(informeOficial.includes('Causa Penal 2026/89'), 'El informe incluye el nombre del expediente judicial');
  afirmar(informeOficial.includes('Declaración tomada bajo protesta'), 'El informe incluye las notas periciales');

  // 4. Validando Desmarcado de Revisión
  console.log('\n↩️ 4. Validando Desmarcado de Revisión y Rebloqueo...');
  const dossierDesmarcado = TranscriptionReviewerService.marcarComoRevisado(dossierRevisado, false);
  afirmar(dossierDesmarcado.revisado === false, 'Expediente marcado nuevamente como no revisado');
  afirmar(dossierDesmarcado.fechaRevision === undefined, 'Fecha de revisión se anula al desmarcar');

  let rebloqueoExitoso = false;
  try {
    TranscriptionReviewerService.generarInformeOficialTranscripcion(dossierDesmarcado);
  } catch {
    rebloqueoExitoso = true;
  }
  afirmar(rebloqueoExitoso, 'El informe vuelve a quedar estrictamente bloqueado tras desmarcar');

  // 5. Validando Persistencia en TranscriptionDatabase
  console.log('\n🗄️ 5. Validando Persistencia en TranscriptionDatabase...');
  TranscriptionDatabase.limpiarTodo();
  const registroGuardado = TranscriptionDatabase.guardar({
    fileName: 'audiencia_prueba.wav',
    fileType: 'audio',
    fileSizeFormatted: '12.4 MB',
    modelUsed: 'base',
    language: 'ES',
    destinationType: 'default',
    destinationFolder: 'C:\\Transcriptor\\Output',
    outputs: [
      { format: 'txt', fileName: 'audiencia_prueba.txt', fullPath: 'C:\\Transcriptor\\Output\\audiencia_prueba.txt' }
    ],
    status: 'completado',
  });

  afirmar(registroGuardado.revisado === undefined, 'Registro nuevo en BD inicia sin estado revisado');

  const actualizado = TranscriptionDatabase.marcarComoRevisada(registroGuardado.id, true, hashCalculado);
  afirmar(actualizado === true, 'marcarComoRevisada retorna true para registro existente');

  const recuperado = TranscriptionDatabase.buscarPorId(registroGuardado.id);
  afirmar(recuperado?.revisado === true, 'El registro en BD persiste revisado === true');
  afirmar(recuperado?.hashSha256 === hashCalculado, 'El registro en BD persiste el hash SHA-256');
  afirmar(typeof recuperado?.fechaRevision === 'string', 'El registro en BD persiste la fecha de revisión');

  const desmarcadoBD = TranscriptionDatabase.marcarComoRevisada(registroGuardado.id, false);
  afirmar(desmarcadoBD === true, 'Desmarcar en BD retorna true');
  const recuperadoDesmarcado = TranscriptionDatabase.buscarPorId(registroGuardado.id);
  afirmar(recuperadoDesmarcado?.revisado === false, 'El registro en BD persiste revisado === false tras desmarcar');

  console.log('\n========================================================');
  console.log(`🎉 Resultados: ${superadas} de ${totales} pruebas PASARON exitosamente.`);
  console.log('========================================================\n');
}

ejecutarPruebasIntegridad().catch((err) => {
  console.error('Error durante ejecución de pruebas de integridad:', err);
  process.exit(1);
});
