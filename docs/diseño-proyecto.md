# Documento de Diseño de Proyecto y Arquitectura (diseño-proyecto.md)

Referencia estándar: ISO/IEC/IEEE 42010

---

## 1. Arquitectura General y Modularidad

El sistema **Sephent Transcriptor** se organiza bajo un patrón de capas desacopladas con responsabilidades delimitadas:

```
┌─────────────────────────────────────────────────────────────┐
│                       Capa de Presentación                  │
│  src/App.tsx | TranscriptionPanel.tsx | ModelManagerModal.tsx│
│  ModelNotDownloadedModal.tsx | DownloadProgressBar.tsx     │
│           ProgressBar.tsx | DonateButton.tsx                │
└──────────────────────────────┬──────────────────────────────┘
                               │ Consume servicios y tokens
┌──────────────────────────────▼──────────────────────────────┐
│                    Capa de Lógica y Servicios               │
│  - WhisperPathService: Detección y resolución de rutas       │
│  - DuplicateDetector: Cálculo SHA-256 y antiduplicados       │
│  - ModelManager: Orquestador de modelos y backups           │
└──────────────────────────────┬──────────────────────────────┘
                               │ Lee configuraciones
┌──────────────────────────────▼──────────────────────────────┐
│                  Capa de Configuración y Datos              │
│  - appConfig.ts: Título, versión, tema                      │
│  - whisperConfig.ts: Catálogo oficial, hashes, URLs OpenAI   │
│  - themeTokens.ts: Tokens del sistema visual Lexis & Archive│
│  - src/styles/tokens.css & global.css: Variables de diseño  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Componentes Clave y Subsistemas (Estilo Arturo)

### 2.1 Inyección de Dependencias y Composition Root
- **Ubicación:** `src/core/di/container.ts`, `src/core/di/tokens.ts`, `src/core/di/DIContext.tsx`.
- **Principios:**
  - Registro de contratos tipados con ciclo de vida explícito (Singleton / Transient).
  - Inversión de control: componentes de React consumen abstracciones vía `useService<T>(DI_TOKENS.TOKEN)`.
  - Desacoplamiento de la infraestructura nativa (Tauri/Whisper) respecto a la capa de usuario.

### 2.2 Motor de Transcripción Acústica (`ITranscriptionEngine`)
- **Ubicación:** `src/core/contracts/ITranscriptionEngine.ts` y `src/services/transcription/transcriptionEngineAdapter.ts`.
- **Función:** Coordina la decodificación Whisper y diarización PyAnnote/Community con emisión periódica de telemetría a través del evento unificado `onProgreso(telemetria)`.

### 2.3 Subsistema Pericial y Forense Aislado (`IPericialService`)
- **Ubicación:** `src/core/contracts/IPericialService.ts` y `src/services/pericial/pericialService.ts`.
- **Función:**
  - Cadena de custodia documental con hashes criptográficos SHA-256.
  - Validación de interlocutores fehacientes (bloquea la emisión del dictamen judicial si existen nombres genéricos sin identificar).
  - Emisión de Dictámenes Periciales Oficiales sin interferir con la descarga libre y directa de transcripciones regulares (.txt, .srt).

### 2.4 Servicio de Telemetría y Tiempo Estimado (`ITelemetryService`)
- **Ubicación:** `src/core/contracts/ITelemetryService.ts` y `src/services/telemetry/telemetryService.ts`.
- **Función:**
  - Algoritmo de suavizado EMA para predicción de ETA (~mm:ss).
  - Monitoreo en tiempo real de porcentaje %, etapa actual (1 a 4), tiempo transcurrido y factor de velocidad respecto a tiempo real.

### 2.5 Barra de Progreso Mejorada (`TranscriptionProgressBar`)
- **Ubicación:** `src/components/TranscriptionProgressBar.tsx`.
- **Función:** Provee al usuario retroalimentación continua con porcentaje grande, barra animada a rayas, insignia de etapa canónica, tiempo transcurrido, cuenta regresiva de tiempo estimado y botón de detención inmediata.

### 2.6 WhisperPathService y DuplicateDetector
- **Ubicación:** `src/services/whisperPathService.ts` y `src/services/duplicateDetector.ts`.
- **Función:** Detección de ruta canónica y prevención estricta de duplicación basada en hashes SHA-256 de 64 caracteres.

### 2.7 ModelStorageService (Relocalización a Carpeta Personalizada)
- **Ubicación:** `src/services/models/modelStorageService.ts` y comando Rust `mover_modelos_whisper`.
- **Función:** Permite mover y cambiar la carpeta por defecto de modelos Whisper hacia discos secundarios de forma segura frente a fallos de partición cruzada (`EXDEV`).

---

## 3. Subsistema de Diseño Visual (Lexis & Archive)

- **Tokens Centralizados:** Toda la apariencia se gestiona de forma centralizada en `src/styles/tokens.css` y `src/config/themeTokens.ts`.
- **Eje Cromático:** Marfil pergamino (`#FBFBF9`), blanco puro (`#FFFFFF`), negro obsidiana (`#121212`), carbón mate (`#1C1C1A`), acentos en taupe (`#B5A795`) y estados funcionales en verde oliva y ámbar siena.
- **Tipografía Híbrida:** Serif clásico (`Georgia`, `Newsreader`) para títulos principales solemnes; Sans-serif geométrica para controles y transcripciones; Monospace para hashes y rutas.
- **Documentación Completa:** Véase [`assets/design-list.md`](file:///d:/Development/app-development/desktop-development/sephent-transcriptor/assets/design-list.md) y [`docs/design-system.md`](file:///d:/Development/app-development/desktop-development/sephent-transcriptor/docs/design-system.md).
