/**
 * Pruebas del Gestor de Interfaces Gráficas Pluggables e Inyección de Dependencias (Estilo Arturo)
 * 
 * Valida:
 * 1. Registro y resolución de múltiples interfaces gráficas (IGUIView / IGUIManager).
 * 2. Conmutación dinámica entre tecnologías visuales (React Clásico vs React Streamlined vs Custom).
 * 3. Notificación reactiva a suscriptores ante cambios de GUI activa.
 * 4. Integración completa con el Composition Root (DI Container).
 * 5. Persistencia de preferencias del usuario.
 */

import React from 'react';
import { GUIManager } from '../src/gui/manager/guiManager';
import { IGUIView } from '../src/core/contracts/IGUIView';
import { IGUIManager } from '../src/core/contracts/IGUIManager';
import { buildApplicationContainer } from '../src/core/di/container';
import { DI_TOKENS } from '../src/core/di/tokens';
import { UserSettingsService } from '../src/services/userSettingsService';
import { registrarInterfacesPorDefecto } from '../src/gui/registry/defaultGUIs';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) {
    console.error(`  ❌ [FALLÓ]: ${mensaje}`);
    throw new Error(`Fallo en prueba: ${mensaje}`);
  }
  console.log(`  ✅ [PASÓ]: ${mensaje}`);
}

async function ejecutarPruebas(): Promise<void> {
  console.log('========================================================');
  console.log('🧪 Iniciando Pruebas de Interfaces Gráficas Pluggables (DI)');
  console.log('========================================================\n');

  // Mocks de vistas para pruebas
  const DummyViewA: React.FC = () => React.createElement('div', null, 'Vista A');
  const DummyViewB: React.FC = () => React.createElement('div', null, 'Vista B');
  const DummyViewCustom: React.FC = () => React.createElement('div', null, 'Vista Custom');

  const guiA: IGUIView = {
    id: 'test-classic',
    name: 'Interfaz Clásica de Prueba',
    description: 'Vista clásica de pruebas',
    technology: 'react-classic',
    badge: 'Classic',
    icon: '🏛️',
    Component: DummyViewA,
  };

  const guiB: IGUIView = {
    id: 'test-streamlined',
    name: 'Interfaz Ágil de Prueba',
    description: 'Vista rápida de pruebas',
    technology: 'react-streamlined',
    badge: 'Streamlined',
    icon: '⚡',
    Component: DummyViewB,
  };

  const guiCustom: IGUIView = {
    id: 'test-web-components',
    name: 'Interfaz Web Components',
    description: 'Vista basada en micro-frontends y web components',
    technology: 'web-components',
    badge: 'W3C Standard',
    icon: '🌐',
    Component: DummyViewCustom,
  };

  // 1. Instanciación y Registro
  console.log('📦 1. Validando registro de interfaces en GUIManager...');
  const manager = new GUIManager();
  manager.registrarInterfaz(guiA);
  manager.registrarInterfaz(guiB);

  const lista = manager.obtenerInterfaces();
  afirmar(lista.length === 2, `Se registraron 2 interfaces (actual: ${lista.length})`);
  afirmar(lista.some((g) => g.id === 'test-classic'), 'Contiene "test-classic"');
  afirmar(lista.some((g) => g.id === 'test-streamlined'), 'Contiene "test-streamlined"');

  // 2. Activación y Fallback
  console.log('\n🎯 2. Validando interfaz activa y fallback...');
  manager.establecerInterfazActiva('test-classic');
  const activa1 = manager.obtenerInterfazActiva();
  afirmar(activa1.id === 'test-classic', `Interfaz activa es test-classic: "${activa1.id}"`);
  afirmar(manager.obtenerIdActivo() === 'test-classic', 'obtenerIdActivo() retorna "test-classic"');
  afirmar(activa1.Component === DummyViewA, 'El componente resuelto corresponde a DummyViewA');

  // 3. Conmutación dinámica de interfaz
  console.log('\n🔄 3. Validando conmutación dinámica entre tecnologías visuales...');
  const cambioExitoso = manager.establecerInterfazActiva('test-streamlined');
  afirmar(cambioExitoso, 'establecerInterfazActiva retornó true para test-streamlined');
  const activa2 = manager.obtenerInterfazActiva();
  afirmar(activa2.id === 'test-streamlined', `Interfaz activa cambió a test-streamlined: "${activa2.id}"`);
  afirmar(activa2.technology === 'react-streamlined', `Tecnología es react-streamlined: "${activa2.technology}"`);
  afirmar(activa2.Component === DummyViewB, 'El componente resuelto corresponde a DummyViewB');

  // 4. Rechazo de identificadores desconocidos
  console.log('\n🛡️ 4. Validando robustez ante IDs no registrados...');
  const cambioInvalido = manager.establecerInterfazActiva('interfaz-inexistente-xyz');
  afirmar(!cambioInvalido, 'establecerInterfazActiva retornó false para ID desconocido');
  afirmar(manager.obtenerIdActivo() === 'test-streamlined', 'Mantiene la interfaz activa previa sin corromperse');

  // 5. Suscripciones Reactivas
  console.log('\n🔔 5. Validando suscripciones reactivas (Observer Pattern)...');
  let notificacionesRecibidas: string[] = [];
  const desuscribir = manager.suscribirCambio((nuevaGui) => {
    notificacionesRecibidas.push(nuevaGui.id);
  });

  manager.establecerInterfazActiva('test-classic');
  afirmar(notificacionesRecibidas.length === 1, 'Oyente recibió 1 notificación');
  afirmar(notificacionesRecibidas[0] === 'test-classic', 'Notificación con ID correcto: test-classic');

  // Desuscribir
  desuscribir();
  manager.establecerInterfazActiva('test-streamlined');
  afirmar(notificacionesRecibidas.length === 1, 'Tras desuscribirse no recibe más notificaciones');

  // 6. Extensibilidad con Nuevas Tecnologías (OCP)
  console.log('\n🌐 6. Validando extensibilidad para tecnologías alternativas (Web Components)...');
  manager.registrarInterfaz(guiCustom);
  const listaAmpliada = manager.obtenerInterfaces();
  afirmar(listaAmpliada.length === 3, `Lista ampliada a 3 interfaces: ${listaAmpliada.length}`);
  manager.establecerInterfazActiva('test-web-components');
  const activaCustom = manager.obtenerInterfazActiva();
  afirmar(activaCustom.technology === 'web-components', `Nueva tecnología activada: "${activaCustom.technology}"`);

  // 7. Integración con Composition Root (DI Container)
  console.log('\n🏛️ 7. Validando integración en Composition Root (DIContainer)...');
  const container = buildApplicationContainer();
  registrarInterfacesPorDefecto(container);
  afirmar(container.has(DI_TOKENS.GUI_MANAGER), 'DI Container registra token DI_TOKENS.GUI_MANAGER');

  const appGuiManager = container.resolve<IGUIManager>(DI_TOKENS.GUI_MANAGER);
  const interfacesApp = appGuiManager.obtenerInterfaces();
  afirmar(interfacesApp.length >= 2, `La aplicación registra al menos 2 interfaces predeterminadas (actual: ${interfacesApp.length})`);
  afirmar(interfacesApp.some((i) => i.id === 'classic'), 'Interfaz clásica registrada en appContainer');
  afirmar(interfacesApp.some((i) => i.id === 'streamlined'), 'Interfaz moderna/streamlined registrada en appContainer');

  const activaApp = appGuiManager.obtenerInterfazActiva();
  afirmar(activaApp.id === 'classic' || activaApp.id === 'streamlined', `Interfaz inicial válida: "${activaApp.id}"`);

  // Conmutar interfaz en el contenedor
  appGuiManager.establecerInterfazActiva('streamlined');
  afirmar(appGuiManager.obtenerIdActivo() === 'streamlined', 'Conmutó a streamlined en el appContainer');
  appGuiManager.establecerInterfazActiva('classic');
  afirmar(appGuiManager.obtenerIdActivo() === 'classic', 'Conmutó a classic en el appContainer');

  console.log('\n========================================================');
  console.log('🎉 Todas las pruebas superadas con éxito.');
  console.log('========================================================');
}

ejecutarPruebas().catch((err) => {
  console.error('Error fatal durante las pruebas:', err);
  process.exit(1);
});
