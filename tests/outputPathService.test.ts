/**
 * Pruebas unitarias para OutputPathService y la política de ruta de guardado por defecto
 * 
 * Regla de negocio probada:
 * "Al finalizar, los archivos generados, su ruta destino siempre será la ruta origen
 * del archivo o archivos cargados a menos que el usuario indique otra ruta."
 */

import { OutputPathService } from '../src/services/transcription/outputPathService';
import { UserSettingsService } from '../src/services/userSettingsService';

async function ejecutarPruebasOutputPathService() {
  console.log('========================================================');
  console.log('🧪 Iniciando Pruebas de OutputPathService (Ruta Origen Por Defecto)');
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

  // 1. Estado inicial predeterminado: SIEMPRE 'original'
  console.log('📂 1. Validando configuración de fábrica por defecto...');
  OutputPathService.resetParaPruebas();
  const modoInicial = OutputPathService.obtenerModoActual();
  afirmar(
    modoInicial === 'original',
    `El modo predeterminado del sistema es 'original': "${modoInicial}"`
  );

  const configUsuario = UserSettingsService.obtenerConfiguracion();
  afirmar(
    configUsuario.modoDestino === 'original',
    `UserSettingsService tiene 'original' por defecto en modoDestino: "${configUsuario.modoDestino}"`
  );

  // 2. Extracción de directorio contenedor
  console.log('\n🔍 2. Validando extracción de directorio contenedor...');
  const dirWindows = OutputPathService.extraerDirectorioDeRuta('C:\\Grabaciones\\Audiencias\\audiencia_01.mp3');
  afirmar(
    dirWindows === 'C:\\Grabaciones\\Audiencias',
    `Extrae correctamente directorio en Windows: "${dirWindows}"`
  );

  const dirLinux = OutputPathService.extraerDirectorioDeRuta('/home/perito/casos/evidencia.wav');
  afirmar(
    dirLinux === '/home/perito/casos',
    `Extrae correctamente directorio en entorno POSIX: "${dirLinux}"`
  );

  // 3. Resolución en la ruta origen del archivo (Comportamiento por defecto)
  console.log('\n📁 3. Validando resolución de salida en ruta de origen (por defecto)...');
  const salidaWindows = OutputPathService.resolverRutaCompletaSalida(
    'audiencia_01.txt',
    'C:\\Grabaciones\\Audiencias\\audiencia_01.mp3',
    'original'
  );
  afirmar(
    salidaWindows === 'C:\\Grabaciones\\Audiencias\\audiencia_01.txt',
    `El archivo .txt se guarda exactamente en la carpeta origen del archivo cargado: "${salidaWindows}"`
  );

  const salidaSrtWindows = OutputPathService.resolverRutaCompletaSalida(
    'audiencia_01.srt',
    'C:\\Grabaciones\\Audiencias\\audiencia_01.mp3',
    'original'
  );
  afirmar(
    salidaSrtWindows === 'C:\\Grabaciones\\Audiencias\\audiencia_01.srt',
    `El archivo .srt se guarda en la misma carpeta origen: "${salidaSrtWindows}"`
  );

  // 4. Múltiples archivos cargados desde distintas carpetas
  console.log('\n📚 4. Validando múltiples archivos de distintas carpetas origen...');
  const archivoA = 'D:\\JuzgadoA\\Expediente101\\sesion1.mp3';
  const archivoB = 'E:\\Peritajes\\Caso202\\interrogatorio.wav';

  const destinoA = OutputPathService.resolverRutaCompletaSalida('sesion1.txt', archivoA, 'original');
  const destinoB = OutputPathService.resolverRutaCompletaSalida('interrogatorio.txt', archivoB, 'original');

  afirmar(
    destinoA === 'D:\\JuzgadoA\\Expediente101\\sesion1.txt',
    `Archivo A conserva su propia carpeta de origen: "${destinoA}"`
  );
  afirmar(
    destinoB === 'E:\\Peritajes\\Caso202\\interrogatorio.txt',
    `Archivo B conserva su propia carpeta de origen independiente: "${destinoB}"`
  );

  // 5. El usuario indica otra ruta (modo 'custom')
  console.log('\n⚙️ 5. Validando cuando el usuario indica otra ruta personalizada...');
  const carpetaElegida = 'D:\\MisTranscripcionesPersonalizadas';
  OutputPathService.establecerRutaPersonalizada(carpetaElegida);
  OutputPathService.establecerModo('custom');

  afirmar(
    OutputPathService.obtenerModoActual() === 'custom',
    'Modo actualizado a "custom"'
  );
  afirmar(
    OutputPathService.obtenerRutaPersonalizada() === carpetaElegida,
    'Ruta personalizada almacenada correctamente'
  );

  const salidaCustom = OutputPathService.resolverRutaCompletaSalida('sesion1.txt', archivoA, 'custom');
  afirmar(
    salidaCustom === 'D:\\MisTranscripcionesPersonalizadas\\sesion1.txt',
    `Cuando el usuario indica otra ruta, los archivos generados se guardan en esa ruta elegida: "${salidaCustom}"`
  );

  // 6. El usuario indica ruta por defecto del sistema (modo 'default')
  console.log('\n🏢 6. Validando cuando el usuario indica ruta oficial del sistema...');
  OutputPathService.establecerModo('default');
  const rutaDefault = OutputPathService.obtenerRutaPorDefecto();
  const salidaDefault = OutputPathService.resolverRutaCompletaSalida('sesion1.txt', archivoA, 'default');
  afirmar(
    salidaDefault.startsWith(rutaDefault),
    `Cuando el usuario elige 'default', se guarda en la carpeta del sistema: "${salidaDefault}"`
  );

  // 7. Fallback seguro cuando no hay ruta física de archivo
  console.log('\n🛡️ 7. Validando fallback seguro sin ruta física...');
  const salidaSinRuta = OutputPathService.resolverRutaCompletaSalida('grabacion.txt', '', 'original');
  afirmar(
    salidaSinRuta.includes('Transcripciones'),
    `Fallback sin ruta física utiliza ruta por defecto de manera segura: "${salidaSinRuta}"`
  );

  // Limpieza al finalizar
  OutputPathService.resetParaPruebas();

  console.log('\n--------------------------------------------------------');
  console.log(`✨ Total Pruebas OutputPathService: ${superadas}/${totales} superadas exitosamente.`);
  console.log('========================================================\n');
}

// Ejecución
ejecutarPruebasOutputPathService().catch((e) => {
  console.error('❌ Error fatal en pruebas de OutputPathService:', e);
  process.exit(1);
});
