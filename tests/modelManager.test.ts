/**
 * Pruebas unitarias para WhisperPathService y DuplicateDetector
 */

import { WhisperPathService } from '../src/services/whisperPathService';
import { DuplicateDetector } from '../src/services/duplicateDetector';
import { WHISPER_MODELS } from '../src/config/whisperConfig';

async function ejecutarPruebas() {
  console.log('========================================================');
  console.log('🧪 Iniciando Pruebas de Detección de Rutas y Antiduplicados');
  console.log('========================================================\n');

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

  // 1. Prueba de identificación de ruta por defecto oficial
  console.log('📁 1. Validando WhisperPathService...');
  const infoRuta = WhisperPathService.obtenerRutaOficialPorDefecto();
  afirmar(
    infoRuta.rutaPorDefectoOficial.includes('.cache\\whisper') || infoRuta.rutaPorDefectoOficial.includes('.cache/whisper'),
    `La ruta oficial detectada contiene el directorio canónico '.cache/whisper': "${infoRuta.rutaPorDefectoOficial}"`
  );
  afirmar(
    infoRuta.sistemaOperativoDetectado === 'windows' || infoRuta.sistemaOperativoDetectado === 'linux' || infoRuta.sistemaOperativoDetectado === 'macos',
    `Sistema operativo detectado de manera válida: "${infoRuta.sistemaOperativoDetectado}"`
  );

  // 2. Prueba del catálogo de modelos oficiales
  console.log('\n📦 2. Validando catálogo canónico de modelos OpenAI Whisper...');
  afirmar(Boolean(WHISPER_MODELS.tiny), 'Modelo tiny está registrado');
  afirmar(Boolean(WHISPER_MODELS.base), 'Modelo base está registrado');
  afirmar(Boolean(WHISPER_MODELS.small), 'Modelo small está registrado');
  afirmar(Boolean(WHISPER_MODELS.medium), 'Modelo medium está registrado');
  afirmar(Boolean(WHISPER_MODELS.large), 'Modelo large-v3 está registrado');
  afirmar(Boolean(WHISPER_MODELS.turbo), 'Modelo turbo está registrado');

  afirmar(
    WHISPER_MODELS.base.sha256Esperado === 'ed3a0b6b1c0edf879ad9b11b1af5a0e6ab5db9205f891f668f8b0e6c6326e34e',
    'El hash SHA-256 de base.pt coincide exactamente con la firma oficial de OpenAI'
  );

  // 3. Prueba de cálculo SHA-256
  console.log('\n🔒 3. Validando DuplicateDetector (Cálculo de Hash SHA-256)...');
  const bufferPrueba = new TextEncoder().encode('sephent-test-model-content').buffer;
  const hashGenerado = await DuplicateDetector.calcularSha256(bufferPrueba);
  afirmar(typeof hashGenerado === 'string' && hashGenerado.length === 64, `El hash SHA-256 es hexadecimal de 64 caracteres: ${hashGenerado}`);

  // 4. Prueba de rechazo de duplicado exacto
  console.log('\n🚫 4. Validando Prevención de Duplicados...');
  // Simular archivo mock
  const archivoMock = {
    name: 'base.pt',
    size: 142 * 1024 * 1024,
    arrayBuffer: async () => bufferPrueba,
  } as unknown as File;

  const modelosExistentesMock = [
    {
      nombreArchivo: 'base.pt',
      hashSha256: hashGenerado,
      tamanoBytes: 142 * 1024 * 1024,
    },
  ];

  const resultadoDuplicado = await DuplicateDetector.verificarDuplicado(archivoMock, modelosExistentesMock);
  afirmar(resultadoDuplicado.esDuplicado === true, 'El archivo con hash idéntico fue marcado correctamente como DUPLICADO');
  afirmar(resultadoDuplicado.motivo === 'hash-identico', `Motivo exacto identificado: ${resultadoDuplicado.motivo}`);
  afirmar(resultadoDuplicado.mensajePedagogico.includes('No se duplicará'), 'El mensaje pedagógico informa que no se duplicará para ahorrar espacio');

  // 5. Prueba de archivo no duplicado
  console.log('\n✨ 5. Validando Aceptación de Archivo Nuevo...');
  const bufferPrueba2 = new TextEncoder().encode('otro-contenido-diferente').buffer;
  const archivoNuevoMock = {
    name: 'medium.pt',
    size: 1420 * 1024 * 1024,
    arrayBuffer: async () => bufferPrueba2,
  } as unknown as File;

  const resultadoNuevo = await DuplicateDetector.verificarDuplicado(archivoNuevoMock, modelosExistentesMock);
  afirmar(resultadoNuevo.esDuplicado === false, 'El archivo nuevo no es considerado duplicado');

  // 6. Prueba de persistencia del último modelo utilizado / descargado
  console.log('\n🔄 6. Validando Regla: Siempre usar el último modelo descargado o utilizado...');
  const { ModelManager } = await import('../src/services/modelManager');

  ModelManager.registrarUltimoModeloDescargado('medium');
  afirmar(
    ModelManager.obtenerUltimoModeloUtilizadoODescargado() === 'medium',
    'El modelo medium registrado como último descargado es devuelto como modelo activo'
  );

  ModelManager.registrarUltimoModeloUtilizado('large');
  afirmar(
    ModelManager.obtenerUltimoModeloUtilizadoODescargado() === 'large',
    'Al utilizar large, el sistema lo adopta de forma persistente como el último modelo utilizado'
  );

  ModelManager.setModeloActivo('tiny');
  afirmar(
    ModelManager.obtenerUltimoModeloUtilizadoODescargado() === 'tiny',
    'setModeloActivo actualiza y persiste tiny como el modelo activo de la sesión'
  );

  // 7. Prueba de la regla de selección por defecto de modelo según cantidad descargada y transcripciones
  console.log('\n🎯 7. Validando Reglas de Selección por Defecto (1 descargado vs >1 con transcripciones)...');
  const { TranscriptionDatabase } = await import('../src/services/database/transcriptionDatabase');

  // Limpiar estado
  ModelManager.limpiarModelosRegistrados();
  TranscriptionDatabase.limpiarTodo();

  // Caso 1: Solamente 1 modelo descargado -> se selecciona por defecto siempre
  ModelManager.registrarModeloDisponible('base', 'descarga');
  afirmar(
    ModelManager.obtenerModelosDescargados().length === 1,
    'Actualmente hay exactamente 1 modelo descargado (base)'
  );
  afirmar(
    ModelManager.resolverModeloPorDefecto() === 'base',
    'Con 1 solo modelo descargado, se selecciona siempre "base" por defecto'
  );

  // Incluso si el usuario había registrado otro modelo como preferido previamente
  ModelManager.registrarUltimoModeloUtilizado('large');
  afirmar(
    ModelManager.resolverModeloPorDefecto() === 'base',
    'Habiendo 1 solo modelo descargado (base), ignora preferencias externas y selecciona siempre el descargado'
  );

  // Caso 2: Más de un modelo descargado -> se selecciona el último usado en transcripciones
  ModelManager.registrarModeloDisponible('small', 'descarga');
  afirmar(
    ModelManager.obtenerModelosDescargados().length === 2,
    'Ahora hay 2 modelos descargados (base y small)'
  );

  // Realizar una primera transcripción con 'small'
  TranscriptionDatabase.guardar({
    fileName: 'audiencia_laboral.mp3',
    fileType: 'audio',
    fileSizeFormatted: '12 MB',
    modelUsed: 'small',
    language: 'es',
    destinationType: 'default',
    destinationFolder: 'C:\\Transcripciones',
    outputs: [],
    status: 'completado',
  });

  afirmar(
    ModelManager.resolverModeloPorDefecto() === 'small',
    'Con 2 modelos descargados, selecciona por defecto "small" por ser el último usado en transcripciones'
  );

  // Realizar una transcripción posterior con 'base'
  TranscriptionDatabase.guardar({
    fileName: 'declaracion_testigo.mp3',
    fileType: 'audio',
    fileSizeFormatted: '8 MB',
    modelUsed: 'base',
    language: 'es',
    destinationType: 'default',
    destinationFolder: 'C:\\Transcripciones',
    outputs: [],
    status: 'completado',
  });

  afirmar(
    ModelManager.resolverModeloPorDefecto() === 'base',
    'Al transcribir después con "base", se selecciona ahora "base" por ser el más reciente en transcripciones'
  );

  // Caso 3: Desinstalar o retirar un modelo hasta que quede 1 solo
  ModelManager.desregistrarModelo('base');
  afirmar(
    ModelManager.obtenerModelosDescargados().length === 1,
    'Se retiró base; ahora queda únicamente 1 modelo descargado (small)'
  );
  afirmar(
    ModelManager.resolverModeloPorDefecto() === 'small',
    'Aunque la última transcripción fue con base, al quedar solo 1 descargado (small) se selecciona siempre por defecto'
  );

  // 8. Prueba de Descarga y Recuperación tras Limpieza Total
  console.log('\n📥 8. Validando Descarga de Modelo y Disponibilidad tras Limpieza...');
  ModelManager.limpiarModelosRegistrados();
  TranscriptionDatabase.limpiarTodo();
  afirmar(!ModelManager.isModelActive('tiny'), 'Tras limpiar, tiny no está marcado como activo');

  // Ejecutar descarga gestionada
  let progresoEmitido = false;
  const modeloDescargado = await ModelManager.descargarModeloHaciaRutaOficial('tiny', (pct) => {
    if (pct > 0) progresoEmitido = true;
  });
  afirmar(progresoEmitido, 'La descarga reporta progreso interactivo');
  afirmar(modeloDescargado.estaDisponible, 'El modelo descargado se marca como disponible');
  afirmar(ModelManager.isModelActive('tiny'), 'isModelActive("tiny") retorna true inmediatamente tras descarga');
  afirmar(ModelManager.obtenerUltimoModeloUtilizadoODescargado() === 'tiny', 'tiny se adopta como último modelo descargado');

  // Limpiar para siguientes suites
  ModelManager.limpiarModelosRegistrados();
  TranscriptionDatabase.limpiarTodo();

  console.log('\n========================================================');
  console.log(`🎉 Resultados: ${pruebasSuperadas} de ${pruebasTotales} pruebas PASARON exitosamente.`);
  console.log('========================================================');
}

ejecutarPruebas().catch((err) => {
  console.error('Error al ejecutar pruebas:', err);
  process.exit(1);
});
