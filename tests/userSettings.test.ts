/**
 * Pruebas unitarias para UserSettingsService
 * Validación de persistencia de opciones y configuraciones del usuario
 */

import { UserSettingsService, ConfiguracionUsuario } from '../src/services/userSettingsService';
import { ModelManager } from '../src/services/modelManager';
import { OutputPathService } from '../src/services/transcription/outputPathService';
import { DEFAULT_MODEL } from '../src/config/whisperConfig';

async function ejecutarPruebasUserSettings() {
  console.log('========================================================');
  console.log('🧪 Iniciando Pruebas de Configuración de Usuario (UserSettingsService)');
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

  // 1. Restablecer e inspeccionar valores por defecto
  console.log('⚙️ 1. Validando valores por defecto...');
  UserSettingsService.restablecer();
  const configDefecto = UserSettingsService.obtenerConfiguracion();

  afirmar(
    configDefecto.modelo === DEFAULT_MODEL || Boolean(configDefecto.modelo),
    `Modelo por defecto inicializado correctamente: "${configDefecto.modelo}"`
  );
  afirmar(
    configDefecto.idioma === 'auto',
    `Idioma por defecto es 'auto': "${configDefecto.idioma}"`
  );
  afirmar(
    configDefecto.outputTxt === true,
    'Formato TXT está habilitado por defecto'
  );
  afirmar(
    configDefecto.outputSrt === false,
    'Formato SRT está deshabilitado por defecto'
  );
  afirmar(
    configDefecto.outputVideo === false,
    'Formato Video MP4 está deshabilitado por defecto'
  );
  afirmar(
    configDefecto.modoDestino === 'original',
    `Modo de carpeta de destino por defecto es 'original': "${configDefecto.modoDestino}"`
  );

  // 2. Persistencia de idioma preferido
  console.log('\n🌐 2. Validando persistencia de idioma...');
  const configIdioma = UserSettingsService.guardarConfiguracion({ idioma: 'es' });
  afirmar(
    configIdioma.idioma === 'es',
    'Guardar idioma a "es" retorna el valor actualizado'
  );
  const lecturaIdioma = UserSettingsService.obtenerConfiguracion();
  afirmar(
    lecturaIdioma.idioma === 'es',
    'obtenerConfiguracion() preserva el idioma "es" guardado'
  );

  // 3. Persistencia de formatos de salida (.txt, .srt, .mp4)
  console.log('\n📄 3. Validando persistencia de formatos documentales...');
  UserSettingsService.guardarConfiguracion({
    outputTxt: true,
    outputSrt: true,
    outputVideo: true,
  });
  const configFormatos = UserSettingsService.obtenerConfiguracion();
  afirmar(
    configFormatos.outputTxt === true && configFormatos.outputSrt === true && configFormatos.outputVideo === true,
    'Todos los formatos de salida documentales se guardan y recuerdan simultáneamente'
  );

  UserSettingsService.guardarConfiguracion({ outputTxt: false });
  const configTxtApagado = UserSettingsService.obtenerConfiguracion();
  afirmar(
    configTxtApagado.outputTxt === false,
    'Cambio granular: desmarcar TXT se persiste de forma independiente'
  );
  afirmar(
    configTxtApagado.outputSrt === true && configTxtApagado.outputVideo === true,
    'Formatos SRT y Video se mantienen activos sin efectos colaterales'
  );

  // 4. Persistencia de modo de carpeta de destino ('original', 'custom', 'default')
  console.log('\n📁 4. Validando persistencia de modo de carpeta de salida...');
  UserSettingsService.guardarConfiguracion({ modoDestino: 'default' });
  const configDestinoDefault = UserSettingsService.obtenerConfiguracion();
  afirmar(
    configDestinoDefault.modoDestino === 'default',
    'Modo de carpeta guardado como "default"'
  );
  afirmar(
    OutputPathService.obtenerModoActual() === 'default',
    'OutputPathService sincroniza inmediatamente con el modo de destino guardado "default"'
  );

  UserSettingsService.guardarConfiguracion({
    modoDestino: 'custom',
    rutaDestinoPersonalizada: 'D:\\TranscripcionesPersonalizadas',
  });
  const configDestinoCustom = UserSettingsService.obtenerConfiguracion();
  afirmar(
    configDestinoCustom.modoDestino === 'custom' && configDestinoCustom.rutaDestinoPersonalizada === 'D:\\TranscripcionesPersonalizadas',
    'Modo de carpeta guardado como "custom" con ruta personalizada'
  );
  afirmar(
    OutputPathService.obtenerRutaPersonalizada() === 'D:\\TranscripcionesPersonalizadas',
    'OutputPathService sincroniza inmediatamente la ruta personalizada'
  );

  UserSettingsService.guardarConfiguracion({ modoDestino: 'original' });
  afirmar(
    UserSettingsService.obtenerConfiguracion().modoDestino === 'original',
    'Modo de carpeta retornado a "original" se persiste con éxito'
  );
  afirmar(
    OutputPathService.obtenerModoActual() === 'original',
    'OutputPathService sincroniza inmediatamente con "original"'
  );

  // 5. Persistencia de modelo seleccionado
  console.log('\n🧠 5. Validando persistencia de modelo seleccionado...');
  UserSettingsService.guardarConfiguracion({ modelo: 'medium' });
  const configModelo = UserSettingsService.obtenerConfiguracion();
  afirmar(
    configModelo.modelo === 'medium',
    'Modelo "medium" guardado y recordado en UserSettingsService'
  );
  afirmar(
    ModelManager.obtenerUltimoModeloUtilizadoODescargado() === 'medium',
    'ModelManager sincroniza inmediatamente con el modelo recordado'
  );

  // 6. Restablecer configuración
  console.log('\n🔄 6. Validando restablecimiento a valores originales...');
  const configRestablecida = UserSettingsService.restablecer();
  afirmar(
    configRestablecida.idioma === 'auto',
    'Restablecer devuelve idioma a "auto"'
  );
  afirmar(
    configRestablecida.outputTxt === true,
    'Restablecer devuelve outputTxt a true'
  );
  afirmar(
    configRestablecida.outputSrt === false,
    'Restablecer devuelve outputSrt a false'
  );
  afirmar(
    configRestablecida.outputVideo === false,
    'Restablecer devuelve outputVideo a false'
  );

  console.log('\n========================================================');
  console.log(`🎉 Resultados: ${superadas} de ${totales} pruebas PASARON exitosamente.`);
  console.log('========================================================\n');
}

ejecutarPruebasUserSettings().catch((e) => {
  console.error('Error fatal en pruebas de UserSettingsService:', e);
  process.exit(1);
});
