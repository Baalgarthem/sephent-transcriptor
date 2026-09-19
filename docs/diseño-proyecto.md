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

## 2. Componentes Clave

### 2.1 WhisperPathService
- **Ubicación:** `src/services/whisperPathService.ts`
- **Función:** Detectar la plataforma del usuario (Windows, Linux, macOS) y retornar la ruta canónica oficial (`%USERPROFILE%\.cache\whisper` o `~/.cache/whisper`).
- **Resiliencia:** Funciona tanto en navegador, Node.js como en entorno Tauri nativo.

### 2.2 DuplicateDetector
- **Ubicación:** `src/services/duplicateDetector.ts`
- **Función:** Inspección criptográfica basada en `crypto.subtle.digest('SHA-256')`.
- **Estrategia Antiduplicado:**
  1. Comparación por Hash SHA-256 con los modelos ya existentes en la ruta oficial.
  2. Comparación por nombre y tamaño aproximado.
  3. Cotejo con la base de firmas oficiales de OpenAI.
  4. Si se detecta identidad, se omite la copia/escritura y se emite notificación pedagógica.

### 2.3 ModelManager
- **Ubicación:** `src/services/modelManager.ts`
- **Función:** Orquesta la verificación de archivos locales, la descarga directa desde los servidores oficiales de Azure CDN de OpenAI y la importación de respaldos aportados por el usuario.

### 2.4 ModelManagerModal
- **Ubicación:** `src/components/ModelManagerModal.tsx`
- **Función:** Interfaz interactiva donde el usuario visualiza la ruta oficial detectada, el estado de cada modelo oficial y el botón para examinar e importar copias de seguridad de modelos sin generar redundancia de espacio. Incorpora efecto hover sobrio y telemetría de descarga en tiempo real.

---

## 3. Subsistema de Diseño Visual (Lexis & Archive)

- **Tokens Centralizados:** Toda la apariencia se gestiona de forma centralizada en `src/styles/tokens.css` y `src/config/themeTokens.ts`.
- **Eje Cromático:** Marfil pergamino (`#FBFBF9`), blanco puro (`#FFFFFF`), negro obsidiana (`#121212`), carbón mate (`#1C1C1A`), acentos en taupe (`#B5A795`) y estados funcionales en verde oliva y ámbar siena.
- **Tipografía Híbrida:** Serif clásico (`Georgia`, `Newsreader`) para títulos principales solemnes; Sans-serif geométrica para controles y transcripciones; Monospace para hashes y rutas.
- **Documentación Completa:** Véase [`assets/design-list.md`](file:///d:/Development/app-development/desktop-development/sephent-transcriptor/assets/design-list.md) y [`docs/design-system.md`](file:///d:/Development/app-development/desktop-development/sephent-transcriptor/docs/design-system.md).
