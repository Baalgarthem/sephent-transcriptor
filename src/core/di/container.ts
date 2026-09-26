/**
 * Contenedor de Inyección de Dependencias y Composition Root (Estilo Arturo)
 * 
 * Principios:
 * - Unico punto de ensamble de dependencias.
 * - Registro por contratos (interfaces / tokens).
 * - Ciclo de vida explícito (Singleton / Transient).
 */

import { DI_TOKENS, DITokenKey } from './tokens';
import { ITranscriptionEngine } from '../contracts/ITranscriptionEngine';
import { IPericialService } from '../contracts/IPericialService';
import { ITelemetryService } from '../contracts/ITelemetryService';
import { IModelStorageService } from '../../services/models/modelStorageTypes';
import { TranscriptionEngineAdapter } from '../../services/transcription/transcriptionEngineAdapter';
import { PericialService } from '../../services/pericial/pericialService';
import { TelemetryService } from '../../services/telemetry/telemetryService';
import { ModelStorageServiceFactory } from '../../services/models/modelStorageService';

type ServiceFactory<T = any> = (container: DIContainer) => T;

export class DIContainer {
  private factories = new Map<string, { factory: ServiceFactory; isSingleton: boolean }>();
  private singletons = new Map<string, any>();

  public register<T>(token: string, factory: ServiceFactory<T>, isSingleton: boolean = true): this {
    this.factories.set(token, { factory, isSingleton });
    return this;
  }

  public registerInstance<T>(token: string, instance: T): this {
    this.singletons.set(token, instance);
    this.factories.set(token, { factory: () => instance, isSingleton: true });
    return this;
  }

  public resolve<T>(token: string): T {
    if (this.singletons.has(token)) {
      return this.singletons.get(token);
    }

    const reg = this.factories.get(token);
    if (!reg) {
      throw new Error(`[DIContainer] No se encontró registro para el token: "${token}"`);
    }

    const instance = reg.factory(this);
    if (reg.isSingleton) {
      this.singletons.set(token, instance);
    }
    return instance;
  }

  public has(token: string): boolean {
    return this.factories.has(token) || this.singletons.has(token);
  }

  public clear(): void {
    this.factories.clear();
    this.singletons.clear();
  }
}

/**
 * Composition Root de la Aplicación Sephent Transcriptor
 */
export function buildApplicationContainer(): DIContainer {
  const container = new DIContainer();

  // 1. Motor de Transcripción
  container.register<ITranscriptionEngine>(
    DI_TOKENS.TRANSCRIPTION_ENGINE,
    () => new TranscriptionEngineAdapter(),
    true
  );

  // 2. Almacenamiento y Relocalización de Modelos
  container.register<IModelStorageService>(
    DI_TOKENS.MODEL_STORAGE,
    () => ModelStorageServiceFactory.obtenerServicio(),
    true
  );

  // 3. Subsistema Pericial y Forense
  container.register<IPericialService>(
    DI_TOKENS.PERICIAL_SERVICE,
    () => new PericialService(),
    true
  );

  // 4. Servicio de Telemetría y ETA
  container.register<ITelemetryService>(
    DI_TOKENS.TELEMETRY_SERVICE,
    () => new TelemetryService(),
    false // Transient para que cada sesión tenga su propio ciclo si se requiere
  );

  return container;
}

export const appContainer = buildApplicationContainer();
