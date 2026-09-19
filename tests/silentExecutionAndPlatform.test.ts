/**
 * Pruebas unitarias para PlatformService y SilentProcessGuard (Política Cero CMD y Compatibilidad Android/Desktop)
 * Principios probados: SOLID, supresión de consolas Windows, ejecución limpia en Android
 */

import { PlatformService } from '../src/services/platform/platformService';
import { SilentProcessGuard } from '../src/services/platform/silentProcessGuard';
import { WhisperPathService } from '../src/services/whisperPathService';

async function ejecutarPruebasSilenciosasYPlataforma() {
  console.log('========================================================');
  console.log('🧪 Iniciando Pruebas de Supresión de CMD y Plataforma (Desktop/Android)');
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

  // 1. Detección de Plataforma y Detalles Multiplataforma
  console.log('📱 1. Detección de Plataforma y Rutas Multiplataforma...');
  const detalles = PlatformService.getDetails();
  afirmar(!!detalles.platform, `Plataforma detectada: ${detalles.platform}`);
  afirmar(typeof detalles.isDesktop === 'boolean', 'Determina si es entorno de escritorio');
  afirmar(typeof detalles.isMobile === 'boolean', 'Determina si es entorno móvil');
  afirmar(detalles.defaultCacheDir.length > 0, `Ruta de caché asignada: ${detalles.defaultCacheDir}`);
  afirmar(detalles.friendlyCacheDir.length > 0, `Ruta amigable asignada: ${detalles.friendlyCacheDir}`);

  // 2. Supresión Estricta de Ventanas CMD (CREATE_NO_WINDOW & windowsHide)
  console.log('\n🛡️ 2. Validación de Banderas de Supresión de Consola CMD...');
  afirmar(
    SilentProcessGuard.CREATE_NO_WINDOW === 0x08000000,
    'CREATE_NO_WINDOW coincide con el valor canónico de Win32 (0x08000000)'
  );

  const configVentana = SilentProcessGuard.obtenerConfiguracionVentanaOculta();
  afirmar(configVentana.windowsHide === true, 'windowsHide está explícitamente activado');
  afirmar(configVentana.creationFlags === 0x08000000, 'creationFlags incluye CREATE_NO_WINDOW');
  afirmar(configVentana.shell === false, 'shell es false para evitar spawns de cmd.exe directos');
  afirmar(configVentana.windowsSubsystemConfigured === true, 'windowsSubsystemConfigured está declarado');

  // 3. Sanitización de Opciones de Ejecución para Procesos
  console.log('\n🧹 3. Sanitización activa de llamadas a procesos...');
  const opcionesInseguras = {
    cwd: 'C:\\test',
    creationFlags: 0x00000004,
    shell: 'powershell.exe',
  };

  const opcionesSanitizadas = SilentProcessGuard.sanitizarOpcionesEjecucion(opcionesInseguras);
  afirmar(opcionesSanitizadas.windowsHide === true, 'Sanitización fuerza windowsHide = true');
  afirmar(
    (opcionesSanitizadas.creationFlags & SilentProcessGuard.CREATE_NO_WINDOW) === SilentProcessGuard.CREATE_NO_WINDOW,
    'Sanitización conserva y añade la bandera CREATE_NO_WINDOW (0x08000000)'
  );
  afirmar(
    Array.isArray(opcionesSanitizadas.args) && opcionesSanitizadas.args.includes('-WindowStyle'),
    'Inyecta argumentos silenciosos (-WindowStyle Hidden) si se usa PowerShell'
  );

  // 4. Ejecución de Comprobaciones 100% Silenciosas
  console.log('\n🔇 4. Ejecución de Comprobación Silenciosa...');
  const resSilencioso = await SilentProcessGuard.ejecutarComprobacionSilenciosa(
    'Comprobación de Modelos Locales',
    async () => {
      // Simulación de comprobación de integridad en memoria
      return { modelosActivos: 5, estado: 'verificado' };
    }
  );

  afirmar(resSilencioso.exito === true, 'Comprobación silenciosa completada con éxito');
  afirmar(resSilencioso.cmdOculto === true, 'Garantiza cmdOculto === true');
  afirmar(resSilencioso.resultado?.modelosActivos === 5, 'Retorna el resultado íntegro de la comprobación');

  // 5. Estado Silencioso Global y Compatibilidad Android
  console.log('\n🤖 5. Verificación de Estado Silencioso y Compatibilidad...');
  const estadoGlobal = SilentProcessGuard.verificarEstadoSilencioso();
  afirmar(estadoGlobal.politicaCeroCMD === true, 'Política Cero CMD activa globalmente');
  afirmar(estadoGlobal.modoEjecucion.length > 0, `Modo de ejecución: ${estadoGlobal.modoEjecucion}`);

  // 6. WhisperPathService con Soporte Android
  console.log('\n📂 6. Validación de WhisperPathService con soporte Android...');
  const rutaPorDefecto = WhisperPathService.obtenerRutaOficialPorDefecto();
  afirmar(!!rutaPorDefecto.sistemaOperativoDetectado, `Sistema detectado: ${rutaPorDefecto.sistemaOperativoDetectado}`);
  afirmar(rutaPorDefecto.rutaPorDefectoOficial.length > 0, 'Ruta oficial calculada');
  afirmar(rutaPorDefecto.existeDirectorio === true, 'Indica disponibilidad de directorio');

  console.log('\n========================================================');
  console.log(`🎉 RESULTADOS: ${superadas} de ${totales} pruebas superadas exitosamente (100%).`);
  console.log('========================================================\n');
}

ejecutarPruebasSilenciosasYPlataforma().catch((err) => {
  console.error('Error durante la ejecución de las pruebas:', err);
  process.exit(1);
});
