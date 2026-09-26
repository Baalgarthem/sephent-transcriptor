/**
 * Pruebas Unitarias del Contenedor de Inyección de Dependencias y Subsistemas (Estilo Arturo)
 */

import { DIContainer, buildApplicationContainer } from '../src/core/di/container';
import { DI_TOKENS } from '../src/core/di/tokens';
import { ITranscriptionEngine } from '../src/core/contracts/ITranscriptionEngine';
import { IPericialService } from '../src/core/contracts/IPericialService';
import { ITelemetryService } from '../src/core/contracts/ITelemetryService';

async function ejecutarPruebas() {
  console.log('========================================================');
  console.log('🧪 Iniciando Pruebas de Inyección de Dependencias (DI)');
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

  // 1. Prueba básica de registro y resolución en DIContainer
  console.log('📦 1. Validando registro y resolución en DIContainer...');
  const testContainer = new DIContainer();
  testContainer.register<string>('Mensaje', () => 'Hola Arturo', true);
  afirmar(testContainer.has('Mensaje'), 'El contenedor reconoce el token registrado');
  afirmar(testContainer.resolve<string>('Mensaje') === 'Hola Arturo', 'Resuelve el valor registrado correctamente');

  // 2. Validación de Singleton vs Transient
  console.log('\n🔄 2. Validando ciclo de vida Singleton vs Transient...');
  class Contador {
    public static contador = 0;
    public id = ++Contador.contador;
  }
  testContainer.register('SingletonContador', () => new Contador(), true);
  testContainer.register('TransientContador', () => new Contador(), false);

  const s1 = testContainer.resolve<Contador>('SingletonContador');
  const s2 = testContainer.resolve<Contador>('SingletonContador');
  afirmar(s1.id === s2.id, `Singleton devuelve la misma instancia (id: ${s1.id})`);

  const t1 = testContainer.resolve<Contador>('TransientContador');
  const t2 = testContainer.resolve<Contador>('TransientContador');
  afirmar(t1.id !== t2.id, `Transient genera instancias independientes (id1: ${t1.id}, id2: ${t2.id})`);

  // 3. Manejo de error al resolver token no existente
  console.log('\n🛡️ 3. Validando captura de error en tokens no registrados...');
  let errorCapturado = false;
  try {
    testContainer.resolve('TokenInexistente');
  } catch (e: any) {
    errorCapturado = true;
    afirmar(e.message.includes('TokenInexistente'), `Error descriptivo capturado: "${e.message}"`);
  }
  afirmar(errorCapturado, 'Lanza excepción al solicitar servicio no registrado');

  // 4. Comprobación del Composition Root canónico
  console.log('\n🏛️ 4. Validando Composition Root de Sephent Transcriptor...');
  const appCont = buildApplicationContainer();
  afirmar(appCont.has(DI_TOKENS.TRANSCRIPTION_ENGINE), 'ITranscriptionEngine registrado en Composition Root');
  afirmar(appCont.has(DI_TOKENS.PERICIAL_SERVICE), 'IPericialService registrado en Composition Root');
  afirmar(appCont.has(DI_TOKENS.TELEMETRY_SERVICE), 'ITelemetryService registrado en Composition Root');
  afirmar(appCont.has(DI_TOKENS.MODEL_STORAGE), 'IModelStorageService registrado en Composition Root');
  afirmar(appCont.has(DI_TOKENS.GUI_MANAGER), 'IGUIManager registrado en Composition Root');

  // 5. Verificación de ITelemetryService (Cálculo de ETA y progreso)
  console.log('\n⏱️ 5. Validando Servicio de Telemetría (ITelemetryService)...');
  const telemetry = appCont.resolve<ITelemetryService>(DI_TOKENS.TELEMETRY_SERVICE);
  telemetry.iniciarSesion(4, 120); // 4 etapas, 120s de audio
  const met1 = telemetry.actualizar(25, 'Etapa 2: Decodificando', {
    tiempoEstimadoSegundos: 45,
    velocidadFactor: 2.5,
  });
  afirmar(met1.porcentaje === 25, 'Porcentaje actualizado correctamente al 25%');
  afirmar(met1.etapaActual === 2, 'Etapa identificada como 2');
  afirmar(met1.totalEtapas === 4, 'Total de etapas conservado en 4');
  afirmar(met1.velocidadFactor === 2.5, 'Factor de velocidad recibido y preservado (2.5x)');
  afirmar(met1.tiempoRestanteSegundos > 0, `ETA calculado coherentemente: ~${met1.tiempoRestanteSegundos}s`);

  const metFin = telemetry.finalizar();
  afirmar(metFin.porcentaje === 100, 'Telemetría finalizada al 100%');
  afirmar(!metFin.estaActivo, 'Sesión de telemetría inactiva tras finalizar');

  // 6. Verificación de IPericialService (Validación de requisitos forenses)
  console.log('\n⚖️ 6. Validando Subsistema Pericial (IPericialService)...');
  const pericial = appCont.resolve<IPericialService>(DI_TOKENS.PERICIAL_SERVICE);

  const segmentosPrueba = [
    { id: '1', startTime: 0, endTime: 5, text: 'Hola, buenas tardes.', speakerId: 'speaker_01' },
    { id: '2', startTime: 5, endTime: 10, text: 'Buenas tardes señor.', speakerId: 'speaker_02' },
  ];

  // Caso 1: Nombres genéricos sin identificar
  const validacionIncompleta = pericial.validarRequisitosPericiales(
    segmentosPrueba,
    { speaker_01: 'speaker_01', speaker_02: 'speaker_02' },
    ''
  );
  afirmar(!validacionIncompleta.puedeEmitirInforme, 'Bloquea emisión de dictamen oficial si no hay nombres reales');
  afirmar(validacionIncompleta.hablantesPendientes.length === 2, 'Detecta correctamente los 2 hablantes no identificados');

  // Caso 2: Nombres plenamente identificados pero sin hash de audio
  const validacionSinHash = pericial.validarRequisitosPericiales(
    segmentosPrueba,
    { speaker_01: 'Juan Pérez', speaker_02: 'Agente García' },
    'hash_corto'
  );
  afirmar(!validacionSinHash.puedeEmitirInforme, 'Bloquea si el hash SHA-256 no tiene longitud canónica de 64 caracteres');

  // Caso 3: Requisitos periciales completos y emisión de dictamen
  const hashValido = 'a'.repeat(64);
  const validacionCompleta = pericial.validarRequisitosPericiales(
    segmentosPrueba,
    { speaker_01: 'Juan Pérez', speaker_02: 'Agente García' },
    hashValido
  );
  afirmar(validacionCompleta.puedeEmitirInforme, 'Habilita emisión pericial cuando interlocutores y SHA-256 están verificados');

  const dictamen = await pericial.emitirInformePericial(
    'test_trx_001',
    segmentosPrueba,
    { speaker_01: 'Juan Pérez', speaker_02: 'Agente García' },
    {
      perito: 'Perito Forense Oficial Lic. A. Gómez',
      expediente: 'EXP-2026/0491',
      notasPericiales: 'Registro fonético nítido sin alteraciones.',
      hashAudio: hashValido,
    }
  );

  afirmar(Boolean(dictamen.codigoInforme), `Código de dictamen generado: ${dictamen.codigoInforme}`);
  afirmar(dictamen.contenidoDocumento.includes('EXP-2026/0491'), 'El dictamen pericial contiene el número de expediente');
  afirmar(dictamen.contenidoDocumento.includes('Juan Pérez'), 'El dictamen pericial incluye los nombres acreditados');
  afirmar(dictamen.contenidoDocumento.includes('CERTIFICACIÓN DE INMUTABILIDAD'), 'Contiene la certificación de inmutabilidad pericial');

  console.log('\n========================================================');
  console.log(`🎉 Todas las pruebas superadas con éxito: ${pruebasSuperadas}/${pruebasTotales}`);
  console.log('========================================================');
}

ejecutarPruebas().catch((e) => {
  console.error('Error fatal durante las pruebas:', e);
  process.exit(1);
});
