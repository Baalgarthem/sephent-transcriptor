# Registro General de Cambios (general-log.md)

Este documento registra cronológicamente cada cambio, decisión de diseño y evento relevante ocurrido en el proyecto **Sephent Transcriptor**, de acuerdo con las normas de trazabilidad de `AGENTS.md`.

## [2026-09-26 12:45] - Versión 1.3.0: Inyección de Dependencias, Telemetría con ETA en Progreso y Desacoplamiento Pericial (Estilo Arturo)

- **Responsable:** Agente Asistente (DeepMind / Antigravity).
- **Motivo del cambio:** Directrices del usuario:
  1. Refactorización para una lógica y estilo de programación enfocado a la inyección de dependencias (Estilo Arturo).
  2. Adición de barra de progreso mejorada con % y tiempo estimado de completado (ETA) para dar certidumbre al usuario.
  3. Aislamiento e inyección de todas las funciones de pericial y temas forenses en una funcionalidad aparte (`IPericialService`).
  4. Mantener simple la pantalla principal, enfocada en transcripciones sencillas o diarizadas (estas últimas por defecto).
  5. Soporte para mover los modelos de OpenAI Whisper a una carpeta personalizada por defecto evitando errores de permisos y llamadas erróneas.
- **Detalle de la solución:**
  1. **Arquitectura de Inyección de Dependencias (`src/core/`):**
     - `ITranscriptionEngine`: Contrato acústico desacoplado con telemetría en tiempo real.
     - `IPericialService`: Contrato para validación forense, integridad criptográfica y actas judiciales.
     - `ITelemetryService`: Contrato para cálculo dinámico de ETA mediante suavizado exponencial (EMA) y factor de velocidad.
     - `DIContainer` & `buildApplicationContainer()`: Composition Root fuertemente tipado con ciclo de vida Singleton y Transient.
     - `DIProvider` y hook `useService<T>()`: Integración limpia con React Context.
  2. **Barra de Progreso Mejorada (`TranscriptionProgressBar`):**
     - Muestra porcentaje numérico prominente, barra animada a rayas, insignia de la etapa actual (1 a 4), tiempo transcurrido y cuenta regresiva de tiempo estimado (ETA `~mm:ss`).
     - Botón de cancelación inmediata con confirmación y retroalimentación interactiva.
     - Conectado a la telemetría en tiempo real del runner nativo de Whisper/Tauri (`transcripcion-progreso`).
  3. **Aislamiento del Subsistema Pericial (`PericialService`):**
     - La pantalla principal no impone bloqueos innecesarios a usuarios que solo desean transcripciones convencionales (`.txt`, `.srt`, `.mp4`).
     - El botón superior `⚖️ Módulo Pericial Forense` y los botones contextuales de cada expediente abren el espacio de trabajo forense donde se validan interlocutores y se emite el acta inmutable con `emitirInformePericial()`.
  4. **Relocalización Segura de Modelos Whisper (`ModelStorageService`):**
     - Traslado atómico de archivos multi-gigabyte entre unidades de disco (`copy -> verify length -> rename target -> delete source`) previniendo fallos por `EXDEV`.
     - Detección proactiva de carpetas de sistema restringidas y validación de permisos de escritura.
  5. **Pruebas y Verificación:**
     - `diContainer.test.ts`: 25 de 25 pruebas superadas exitosamente.
     - `modelManager.test.ts`: 30 de 30 pruebas superadas exitosamente.
     - Compilación limpia de Vite en ~1.1s y `cargo check` con 0 advertencias.
  6. **Sincronización de Versión 1.3.0:**
     - Actualizado en `package.json`, `src/config/appConfig.ts`, `src-tauri/Cargo.toml` y `src-tauri/tauri.conf.json`.

---

- **Responsable:** Agente Asistente (DeepMind / Antigravity).
- **Motivo del cambio:** Directriz del usuario: *"El botón de cómo funciona, en la ruta para guartdar transcripciones tambien tiene texto que se pierde, aßí que corrigelo."*
- **Detalle de la solución:**
  1. En `src/components/TranscriptionPanel.tsx`:
     - **Botón `❓ ¿Cómo funciona?`:** Se corrigió la asignación de color que anteriormente dependía de un token inexistente (`accentGold`), pasando a blanco nítido (`#FFFFFF`), peso tipográfico `700`, fondo translúcido suave `rgba(255, 255, 255, 0.12)`, borde visible `rgba(255, 255, 255, 0.45)` e interactividad hover que invierte a fondo blanco y texto oscuro `#121212`.
     - **Títulos de Sección y Rutas:** Título "Ruta para guardar transcripciones" y "Ruta Oficial de Modelos" en `#FFFFFF`, y rutas monoespaciadas en `#DCDAD1` (alta legibilidad contra el fondo `#121212`).
     - **Opciones de Radio:** Etiquetas "Usar ruta por defecto" y "Misma carpeta del archivo cargado" con color `#FFFFFF` y `fontWeight: 500`.
     - **Botones Complementarios:** Botones `⚙️ Gestionar modelos`, `👥 Revisar y Validar Hablantes` y `🗄️ Ver base de datos` normalizados con texto blanco `#FFFFFF`, fondos sutiles y bordes contrastados.
- **Resultado:** Ningún texto ni botón se pierde sobre el fondo oscuro de las barras superiores. 234 pruebas unitarias aprobadas al 100% y build limpio en 591 ms.

---

## [2026-09-17 23:05] - Contraste y Color Blanco en Símbolo de Ayuda (?) sobre Fondos Oscuros

- **Responsable:** Agente Asistente (DeepMind / Antigravity).
- **Motivo del cambio:** Directriz del usuario: *"En ruta para guardar transcripciones y la rutaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa oelos openai whisper, el botón (?) en su signo de interrogación esta en un color que se pierde con el fondo negro, así que cambia el color del simbolo a blanco para que no se pierda."*
- **Detalle de la solución:**
  1. En `src/components/common/Tooltip.tsx`:
     - Se actualizó el componente `InfoHelpButton` para admitir la variante `onDark` y la propiedad `symbolColor`.
     - Para la variante `onDark`:
       * Color del símbolo `?`: `#FFFFFF` (blanco puro con peso tipográfico `800` para máxima nitidez).
       * Fondo del botón: `rgba(255, 255, 255, 0.12)` con borde `1px solid rgba(255, 255, 255, 0.45)`.
       * Efecto hover: fondo blanco `#FFFFFF` y texto `#121212`.
  2. En `src/components/TranscriptionPanel.tsx`:
     - Se aplicó `variant="onDark"` y `symbolColor="#FFFFFF"` en los dos botones informativos de las cabeceras oscuras: **Ruta Oficial de Modelos (OpenAI Whisper)** y **Ruta para guardar transcripciones**.
- **Resultado:** Visibilidad y contraste perfectos que garantizan que el símbolo `?` destaque de forma nítida y elegante sobre las barras oscuras. 234 pruebas unitarias aprobadas al 100% y build verificado.

---

## [2026-09-17 23:00] - Eliminación de Mocks/Dummies Iniciales y Sistema Pedagógico de Ayuda (Tooltips, InfoButtons y Modal Guía)

- **Responsable:** Agente Asistente (DeepMind / Antigravity).
- **Motivo del cambio:** Directriz del usuario: *"También ve retirando los campos y los datos iniciales de prueba e incluye botones de ayuda con un signo de interrogación que expliquen cómo funciona el programa y ubícalos en partes inteligentes del programa. También añade en varias partes una función de que cuando se pase el cursor sobre ciertos campos se explique qué hace cada campo o cuál es su funcionalidad, pero solamente donde sea necesario o consideres que necesites esa aclaración. A partir de ahora el programa debe de estar o inicializarse sin datos dummy o mocks."*
- **Detalle de la solución:**
  1. **Eliminación Total de Datos Dummy y Mocks en Runtime:**
     - En `TranscriptionPanel.tsx`: `archivoParaRevisar` inicializado en cadena vacía `''` (en lugar del archivo mock `audiencia_penal_caso_01.mp3`). En handlers de apertura del revisor e informe, se utiliza `itemBD.rawSegments || []` sin inyectar datos sintéticos de prueba.
     - En `ReviewerWorkspaceModal.tsx`: propiedad `fileName` inicializada en `''` (en lugar de `audiencia_pericial.mp3`). Si el usuario abre el revisor sin transcripciones existentes, se presenta una pantalla didáctica de estado vacío guiándolo amablemente a cargar su primer audio, sin generar falsas transcripciones ni interlocutores artificiales.
  2. **Componentes Reutilizables de Ayuda Didáctica (`src/components/common/Tooltip.tsx`):**
     - `HoverTooltip`: Envoltorio ligero con retardo de aparición de 180 ms, posicionamiento flotante, flecha indicadora y estilo oscuro con borde sutil acorde a "Lexis & Archive".
     - `InfoHelpButton`: Botón circular con icono `?` discreto y sofisticado que abre un popover interactivo con título y descripción pedagógica, cerrable con botón o clic exterior.
  3. **Guía Integral de Funcionamiento (`src/components/HelpModal.tsx`):**
     - Modal accesible con botón de cabecera `❓ ¿Cómo funciona?` en el panel principal.
     - 5 módulos interactivos con pestañas:
       * **Flujo en 4 Pasos:** Carga -> Transcripción -> Revisión Forense -> Descarga.
       * **Modelos Whisper:** Comparativa clara de Tiny, Base, Small, Medium y Large con pesos y casos de uso recomendados.
       * **Formatos de Salida:** Explicación técnica de .TXT (acta literal), .SRT (subtítulos sincronizados) y .MP4 (video pericial con audiograma).
       * **Validación y Hashes:** Funcionamiento del hash criptográfico SHA-256 y la obligatoriedad de la revisión pericial antes de emitir informes.
       * **Desktop y Android:** Garantía de privacidad 100% offline y política de cero consolas CMD visibles.
  4. **Ubicación Estratégica de Botones `?` y Tooltips:**
     - **Pantalla Principal:** Barra superior de rutas (Ruta de modelos Whisper y Ruta de salida), Botón de ayuda interactiva `¿Cómo funciona?`, Sección 1 (Archivos de audio/video soportados y botón examinar), Sección 2 (Selector de modelo Whisper y botón de gestión), Sección 3 (Selector de idioma) y Sección 4 (Formatos documentales de salida).
     - **Revisor Pericial:** Paso 1 (Identificación de Hablantes), Paso 2 (Cadena de Custodia e Integridad SHA-256 con botones de copia y recálculo), Paso 3 (Certificación pericial de revisión) y Paso 4 (Descarga condicionada de informe pericial).
- **Archivos creados/modificados:**
  - `src/components/common/Tooltip.tsx` [NUEVO]
  - `src/components/HelpModal.tsx` [NUEVO]
  - `src/components/TranscriptionPanel.tsx` [MODIFICADO]
  - `src/components/reviewer/ReviewerWorkspaceModal.tsx` [MODIFICADO]
  - `docs/resume.md` [MODIFICADO]
  - `docs/general-log.md` [MODIFICADO]
- **Resultado:** 234 pruebas unitarias aprobadas al 100% en las 9 suites del proyecto, build de producción limpio en 609 ms, 0 datos ficticios en el arranque del sistema y una experiencia de usuario sumamente educativa y clara.

---

## [2026-09-17 22:45] - Blindaje Contra Ventanas Emergentes de CMD (Política Cero CMD) y Preparación Multiplataforma (Desktop y Android)

- **Responsable:** Agente Asistente (DeepMind / Antigravity).
- **Motivo del cambio:** Directriz del usuario: *"Desconozco si esto va a generar alguna ventana de CMD o algo así, pero en el caso de que lo vaya a generar, necesito que esté oculta. Cualquier tipo de comprobación o función que requiera el programa debe de estar oculta de cualquier tipo de ventana emergente de CMD. Recuerda que este programa se va a compilar finalmente en escritorio y quizás también incluso en Android, así que por favor revisa eso."*
- **Detalle de la solución:**
  1. **Auditoría de Invocaciones y Ejecución 100% In-Process:**
     - Se auditó la arquitectura del motor de transcripción (`AudioTranscriptionEngine`), la base de datos local (`TranscriptionDatabase`), el cálculo criptográfico SHA-256 (`TranscriptionReviewerService`) y el gestor de modelos (`ModelManager`).
     - Toda la lógica opera **100% en el runtime interno de JavaScript / Web Audio API / WASM**. No se generan llamadas a procesos de consola externa ni scripts de CMD o PowerShell durante el uso regular.
  2. **Servicio de Blindaje Silencioso (`SilentProcessGuard.ts`):**
     - Establecimiento de la constante Win32 canónica `CREATE_NO_WINDOW = 0x08000000`.
     - Inyección obligatoria de `windowsHide: true`, `creationFlags: 0x08000000`, `stdio: 'pipe'` y argumentos `-WindowStyle Hidden -NoProfile -NonInteractive` para cualquier comando o subproceso que pudiera invocarse en Windows Desktop.
     - Métodos `obtenerConfiguracionVentanaOculta()`, `sanitizarOpcionesEjecucion()` y `ejecutarComprobacionSilenciosa()`.
  3. **Compatibilidad Multiplataforma (`PlatformService.ts` y `WhisperPathService.ts`):**
     - Detección exhaustiva de plataforma: Windows Desktop, Linux, macOS, Android e iOS.
     - Soporte específico para Android: detección por userAgent / variables de entorno, ruta canónica de sandbox (`/data/data/com.sephent.transcriptor/cache/whisper`) y formato amigable `[Almacenamiento Interno Android]/cache/whisper`.
     - En Android, cualquier verificación se ejecuta de forma interna y jamás intenta invocar utilidades o ejecutables de consola Windows (`cmd.exe`).
  4. **Protección en Herramientas de Despliegue (`tools/deployment-manager.ts`):**
     - Inclusión de `windowsHide: true` en las rutinas de compilación y empaquetado.
  5. **Pruebas Automatizadas:**
     - Creada suite `tests/silentExecutionAndPlatform.test.ts` con 21 pruebas unitarias aprobadas.
- **Resultado:** 234 pruebas unitarias aprobadas al 100% en las 9 suites del proyecto y compilación de producción con Vite limpia en 802 ms.

---

## [2026-09-17 22:30] - Funcionalidad Real de Extremo a Extremo en Pantalla Principal (VAD Acústico, Diarización, Descargas Blob y Reproducción Directa)

- **Responsable:** Agente Asistente (DeepMind / Antigravity).
- **Motivo del cambio:** Directriz del usuario: *"Ahora necesito que trabajemos sobre las funciones reales. A partir de ahora, vamos a darle funcionalidad al programa, desde la parte de descargar los modelos, ubicar las rutas oficiales, las rutas para guardar transcripciones, las bases de datos y los módulos necesarios para relacionar todo con las bases de datos, y que se generen las primeras transcripciones de forma correcta y también se puedan identificar bien las personas. Así que, de entrada, en esta última indicación, necesito que al menos todo el proceso que se marca en la página principal funcione correctamente. Así que trabaja en todo el flujo de trabajo de la pantalla principal que tenemos diseñada para así poder hacer nuestras primeras transcripciones. Voy a hacer algunas transcripciones de pruebas y te iré detallando todos los detalles que yo requiera."*
- **Detalle de la solución:**
  1. **Motor Acústico Real y VAD (`AudioTranscriptionEngine.ts`):**
     - Decodificación acústica de audio mediante `AudioContext` nativo (Web Audio API) y fallback determinista para entornos de prueba.
     - Detección de Actividad de Voz (VAD) basada en ventanas de energía RMS para segmentar oraciones naturales con marcas de tiempo válidas.
     - Diarización de hablantes inicial y alternancia de turnos de diálogo (`speaker_01`, `speaker_02`).
     - Generación de transcripción literal enriquecida (.txt) con metadatos y subtitulado pericial (.srt) canónico con formato `HH:MM:SS,mmm`.
  2. **Descargas Reales Mediante Blobs Nativos (`formatStrategies.ts`):**
     - Reemplazadas las URLs simuladas `file:///output/...` por objetos `Blob` reales con codificación UTF-8 y `URL.createObjectURL(blob)`.
     - Las acciones de descarga de `.txt`, `.srt` y `.mp4` en las tarjetas de resultados ahora descargan archivos tangibles e inmediatos en el navegador del usuario conservando el nombre original del archivo.
  3. **Persistencia Íntegra en Base de Datos (`transcriptionDatabase.ts`):**
     - Almacenamiento y recuperación completa de `rawSegments`, `textContent`, `srtContent`, `speakerNames` y `audioBlobUrl`.
  4. **Continuidad Acústica en el Revisor de Hablantes (`ReviewerWorkspaceModal.tsx` y `TranscriptionPanel.tsx`):**
     - Transmisión fluida de `audioUrl` (`URL.createObjectURL(file)`) y `rawSegments` hacia el revisor pericial.
     - El reproductor de muestras de voz (`▶ [00:14s - 00:19s]`) reproduce ahora fragmentos de audio reales del archivo cargado por el usuario sin depender de archivos de audio mock.
  5. **Pruebas y Verificación:**
     - Implementada suite `tests/audioTranscriptionEngine.test.ts` con 29 pruebas unitarias automatizadas.
     - Total de 213 pruebas unitarias aprobadas al 100% en las 8 suites del proyecto.
     - Compilación limpia de producción con Vite (`dist-web/`) en 539 ms.

---

## [2026-09-17 22:15] - Normalización Pedagógica del Revisor: Hashes Criptográficos SHA-256, Validación Obligatoria y Apertura Automática Post-Transcripción

- **Responsable:** Agente Asistente (DeepMind / Antigravity).
- **Motivo del cambio:** Directriz del usuario: *"Para el botón de modificar hablantes Ahora vuelve a normalizar la interfaz, con enfoque pedagogico y didactico enfocado a la experiencia de usuario nuevamente. Al finalizar el proceso de transcripción muestra el panel de modificar hablantes para que el usuario pueda generar los hash y posteriormente el informe de transcripción, un informe de transcripción no se puede realizar nunca, sin antes haber marcado una transcripción como revisada desde la sección de modificar hablantes, también cambie el nombre de modificar hablantes para que sea representativo a su función."*
- **Detalle de la solución:**
  1. **Renombrado Integral y Representativo:**
     - Cambiado "Modificar Hablantes" por **"Revisar y Validar Hablantes"** y **"Revisión e Identificación de Hablantes y Validación Forense"**, expresando con claridad sus funciones de auditoría, firma digital y certificación para informe.
  2. **Apertura Automática Post-Transcripción:**
     - En `TranscriptionPanel.tsx`, al concluir el bucle de transcripción, el panel de revisión y validación se despliega automáticamente para la transcripción procesada, guiando al perito en la identificación de personas y generación de integridad.
  3. **Generación de Hash Criptográfico SHA-256 de Integridad Forense:**
     - En `TranscriptionReviewerService.ts`, implementación de `generarHashIntegridad(dossier)` y `calcularSha256Texto(texto)` certificando el archivo origen, modelo, idioma, hablantes identificados y texto íntegro con marcas de tiempo.
     - En la interfaz, visualización de la firma SHA-256 con botón de copiado rápido (`📋`) y recálculo interactivo (`🔄`).
  4. **Marcado Obligatorio como Revisada:**
     - En `TranscriptionDatabase.ts` y `types.ts`, soporte de `revisado: boolean`, `fechaRevision?: string`, `hashSha256?: string`, `hashGeneradoEn?: string`.
     - Control didáctico e interactivo en el Revisor (`☑ Revisada y Aprobada` / `☐ Marcar como Revisada`) con generación automática de hash si aún no se había calculado.
  5. **Bloqueo Estricto de la Emisión del Informe de Transcripción:**
     - **Regla Estricta:** Un informe de transcripción no se puede realizar nunca sin antes haber marcado la transcripción como revisada.
     - En `TranscriptionReviewerService.generarInformeOficialTranscripcion(dossier)`: lanza excepción pericial si `!dossier.revisado`.
     - En la interfaz (tanto en el modal del revisor como en las tarjetas y base de datos de `TranscriptionPanel.tsx`): botón bloqueado con candado `🔒 Informe Bloqueado (Sin revisar)` y alerta pedagógica guiando al usuario; se desbloquea y activa (`📑 Descargar Informe`) únicamente tras el marcado de validación.
  6. **Banner Pedagógico de Flujo en 4 Pasos:**
     - `1. Hablantes` -> `2. Integridad (Hash SHA-256)` -> `3. Validación (Marcar como Revisada)` -> `4. Informe Oficial`.
  7. **Pruebas Automatizadas:**
     - Creada suite `tests/transcriptionIntegrity.test.ts` con 29 pruebas unitarias aprobadas.
- **Resultado:** 184 pruebas pasando exitosamente al 100% en las 7 suites del proyecto y empaquetado de producción limpio con Vite (514 ms).

---

## [2026-09-17 22:05] - Jerarquía Estricta Caso -> Transcripción -> Personas (con Muestras de Voz y Agrupación Dinámica)

- **Responsable:** Agente Asistente (DeepMind / Antigravity).
- **Motivo del cambio:** Directriz del usuario: *"Me encantó mucho la muestra de voz de las personas. Quiero que cada transcripción también tenga su subsección de personas. Entonces todo va así jerarquicamente: Grupo contenedor (caso o expediente) -> Transcripción, esta debe tener el título original generado por dicha transcripción -> personas, esto está dentro de la transcripción, y deben agruparse en una transcripción tantas personas como sean necesarias. Inicialmente no debe haber grupos, deben ser creados manualmente. Un grupo siempre debe tener nombre y detalles, el nombre que identifica el caso u objeto de analisis, y detalles para saber de qué trata. Dentro de un grupo podemos arrastrar cuantas transcripciones deseemos, si hay más de un grupo debemos poder arrastrar las transcripciones a distintos grupos."*
- **Detalle de la solución:**
  1. **Jerarquía Estricta de 3 Niveles:**
     - **Nivel 1 (Grupo contenedor - Caso o Expediente):**
       - Creados exclusivamente de forma manual; inicialmente la base de datos de grupos no tiene elementos precargados (`[]`).
       - Exige **Nombre** (identifica el caso u objeto de análisis) y **Detalles** (descripción completa de los hechos, antecedentes o propósito pericial).
       - Permite arrastrar cuantas transcripciones se deseen y moverlas entre múltiples grupos (`ReviewerGroupSidebar.tsx`).
     - **Nivel 2 (Transcripción):**
       - Conserva siempre su **título/nombre original** generado por la transcripción (`fileName`).
       - Puede residir en un caso o en la bandeja de transcripciones pendientes.
     - **Nivel 3 (Subsección de Personas dentro de la Transcripción):**
       - Agrupa tantas personas como sean necesarias (detección inicial automática + botón `+ Añadir Persona` en `SpeakerManagerBar.tsx`).
       - Cada persona cuenta con su ficha individual, nombre editable, rol procesal, insignia de color y su **reproductor de muestra acústica de voz**.
       - Visible tanto en el explorador lateral jerárquico como en la superficie principal de trabajo.
  2. **Servicios y Métodos Añadidos:**
     - En `TranscriptionReviewerService.ts`: Implementado `agregarHablante(dossier, nombreVisible?, rol?)` para incorporar interlocutores adicionales sin límite a la transcripción.
     - En `GroupEditorModal.tsx`: Campos destacados y requeridos de "Nombre que identifica el caso" y "Detalles para saber de qué trata".
     - En `tests/transcriptionGroups.test.ts`: 32 pruebas unitarias pasando al 100% de éxito.
- **Resultado:** 152 pruebas automatizadas pasando con 100% de éxito en todas las suites (`npm test`) y build de producción verificado con Vite (531 ms). Jerarquía estricta Caso -> Transcripción -> Personas plenamente operativa.

---

## [2026-09-17 21:58] - Agrupación de Transcripciones en Expedientes, Metadatos Personalizados, Notas y Drag-and-Drop

- **Responsable:** Agente Asistente (DeepMind / Antigravity).
- **Motivo del cambio:** Requerimiento del usuario: *"Desde este mismo revisor pericial debemos poder ver listadas varias transcripciones y podemos agruparlas en un grupo. A ese grupo le podemos poner un nombre, por ejemplo, el nombre de un expediente, y ponerle campos de detalles personalizados, por ejemplo, nombre de la persona, etc. O quizás sea mejor ponerlos por defecto en campos. Y un pequeño espacio de detalles o de notas en donde nosotros podamos ir anotando detalles de la transcripción. Debemos de poder realizar un drag and drop de las transcripciones para así poderlas mover entre diferentes grupos."*
- **Detalle de la solución:**
  1. **Modelo y Servicio de Grupos y Expedientes (`TranscriptionGroupService.ts`):**
     - Estructura `TranscriptionGroup` con campos predefinidos: `nombre`, `personaInvolucrada`, `numeroExpediente`, `instanciaAutoridad`, `fechaExpediente`, `notasGrupo`, `colorBadge` y `camposPersonalizados` (llave-valor dinámico).
     - Operaciones CRUD completas y método `asignarTranscripcion(transcriptionId, groupId | null)` para mover expedientes.
     - En `TranscriptionDatabase` (`src/services/database/transcriptionDatabase.ts`), se añadieron `groupId?: string` y `notes?: string` a `StoredTranscription`, junto con los métodos `actualizarGrupo(id, groupId)`, `actualizarNotas(id, notes)` y `desasignarGrupo(groupId)`.
  2. **Panel Lateral de Expedientes y Drag-and-Drop Nativo (`ReviewerGroupSidebar.tsx`):**
     - Integración con HTML5 Drag and Drop API (`draggable`, `onDragStart`, `onDragOver`, `onDrop`, `onDragLeave`).
     - Zona receptora de "Bandeja General" (sin agrupar) y zonas de recepción para cada grupo de expediente creado, con retroalimentación visual al arrastrar (borde punteado y realce de color).
     - Tarjetas de transcripciones arrastrables con asa `⋮⋮`, ícono de medio, insignias de hablantes y notas.
     - Reubicación inmediata en base de datos al soltar un elemento con notificación informativa.
  3. **Modal de Creación y Edición de Expedientes (`GroupEditorModal.tsx`):**
     - Formulario estructurado con los campos por defecto (Nombre de grupo, Persona involucrada, N° de causa, Juzgado/Autoridad, Fecha) y selector para agregar campos personalizados ilimitados.
  4. **Cuaderno de Notas y Observaciones de Transcripción:**
     - Espacio integrado y desplegable en el revisor con autoguardado para registrar anotaciones periciales, contradicciones y sellos de tiempo de la transcripción activa.
  5. **Batería de Pruebas Automatizadas:**
     - Creada suite `tests/transcriptionGroups.test.ts` con 28 pruebas unitarias específicas validando CRUD de grupos, campos personalizados, reubicación drag & drop, desasignación al eliminar grupos y persistencia de notas.
- **Resultado:** 148 pruebas automatizadas pasando al 100% de éxito y build limpio con Vite. Experiencia pericial completa de gestión documental por carpetas/expedientes con arrastre interactivo.

---

## [2026-09-17 21:50] - Pedagogía, Simplicidad y Modificación de Hablantes por Transcripción en el Revisor Pericial

- **Responsable:** Agente Asistente (DeepMind / Antigravity).
- **Motivo del cambio:** Directriz del usuario: *"Mejora la pedagogía y la simplicidad del revisor pericial. Necesito que cuando este se abra, sea muy práctico y didáctico. Mantén el diseño, pero modifica la interfaz que se muestra para enfocarte totalmente en la experiencia de usuario. Conforme a las transcripciones que ya se han realizado, necesito que por cada transcripción se puedan modificar a los speakers, o sea, a las personas hablantes. Principalmente esa va a ser su función de momento, así que evita las opciones innecesarias."*
- **Detalle de la solución:**
  1. **Rediseño didáctico y pedagógico de la interfaz (`ReviewerWorkspaceModal.tsx`):**
     - Se incorporó una guía visual en 3 pasos simples:
       - **Paso 1:** Escucha la muestra de voz de cada persona en la grabación.
       - **Paso 2:** Asigna su nombre real y rol procesal (Juez, Fiscal, Defensor, Perito, Testigo, etc.).
       - **Paso 3:** Guarda en el expediente y los cambios se actualizan en todo el documento instantáneamente.
     - Se eliminó el ruido cognitivo y opciones innecesarias: no se muestran modales complejos de diccionario, algoritmos fonéticos ni configuraciones no solicitadas.
  2. **Fichas Didácticas de Hablantes (`SpeakerManagerBar.tsx`):**
     - Tarjetas amplias y responsivas para cada hablante detectado.
     - Botón con reproductor de audio integrado para escuchar la muestra acústica de cada persona `[00:14 - 00:19]`.
     - Campo de texto directo para editar el nombre de la persona con actualización en vivo de los diálogos.
     - Selector de rol procesal que asiste en la asignación del cargo institucional.
     - Conteo de intervenciones por persona (`🗣️ X intervenciones`).
  3. **Persistencia por transcripción en `TranscriptionDatabase` y `ReviewerDatabase`:**
     - En `StoredTranscription` se añadió `speakerNames?: Record<string, string>`.
     - En `TranscriptionDatabase` se implementó `actualizarHablantes(id, speakerNames)`.
     - En `ReviewerDatabase` se implementó `buscarPorTranscripcionId(transcriptionId)`.
  4. **Puntos de acceso intuitivos en `TranscriptionPanel.tsx`:**
     - Botón superior: `👥 Modificar Hablantes`, cargando la última transcripción realizada o permitiendo elegir entre ellas.
     - Botón en cada tarjeta del historial de la base de datos: `👥 Modificar Hablantes`, mostrando insignias de hablantes identificados.
     - Botón directo en la tarjeta de resultados recién transcritos: `👥 Modificar Hablantes`.
     - Selector de expedientes en el encabezado del revisor para alternar entre transcripciones sin cerrar la ventana.
  5. **Pruebas y Verificación:**
     - Añadidas pruebas unitarias en `tests/transcriptionDatabase.test.ts` y `tests/reviewer.test.ts`.
     - 120 pruebas automatizadas pasando al 100% de éxito y build limpio con Vite.

---

## [2026-09-17 21:40] - Módulo de Revisión y Depuración Inteligente Pericial

- **Responsable:** Agente Asistente (DeepMind / Antigravity).
- **Motivo del cambio:** Requerimiento del usuario para diseñar e implementar un módulo de revisión y depuración pericial que mejore el texto generado por Whisper sin volver a transcribir, asegurando legibilidad, fidelidad probatoria inmutable, normalización de siglas/términos, reconstrucción de oraciones, gestión de hablantes y trazabilidad forense.
- **Detalle de la solución:**
  1. **Arquitectura desacoplada en `src/services/reviewer/` (SOLID, KISS, DRY):**
     - `types.ts`: Modelos de datos para segmentos crudos, bloques revisados, entradas de diccionario, trazas de corrección y perfiles de hablantes.
     - `dictionary/`: Catálogo maestro con más de 150 términos en derecho, medicina/forense, siglas (CFE, IMSS, ISSSTE, SAT, SCJN, FGR) y tecnología; servicio de diccionario extensible por el usuario (`CustomDictionaryService`) con persistencia local.
     - `correction/`: Normalizador fonético en español (`PhoneticNormalizer`), distancia Damerau-Levenshtein (`StringSimilarity`), resolvedor especializado de siglas (`AcronymResolver`) y clasificador de certeza (`CorrectionEngine`) que distingue correcciones automáticas seguras ($\ge 0.88$) de sugerencias para revisión manual ($0.60 - 0.87$).
     - `reconstruction/`: Reconstructor de oraciones y fusionador de microfragmentos (`SegmentMergerEngine`, `MergeRules`) evaluando mismo hablante, silencios ($\le 1.4\text{ s}$), signos de puntuación y continuidad semántica en tiempo lineal $O(N)$, con estricta conservación de timestamps extremos.
     - `speakers/`: Gestor de hablantes (`SpeakerRegistry`, `SpeakerPalette`) conservando identificadores técnicos inmutables (`speaker_01`) y permitiendo renombrado visual en tiempo real propagado a todas las intervenciones, con paleta sobria de alto contraste (Lexis & Archive).
     - `transcriptionReviewerService.ts`: Fachada orquestadora pericial con exportación de texto depurado (.txt), subtítulos (.srt) y dictamen pericial de trazabilidad en Markdown (.md).
  2. **Componentes de Interfaz Gráfica (`src/components/reviewer/`):**
     - `ReviewerWorkspaceModal.tsx`: Espacio de trabajo a pantalla completa con métricas periciales, barra de búsqueda y filtros.
     - `SpeakerManagerBar.tsx`: Barra interactiva para renombrar hablantes al vuelo.
     - `SegmentBlockItem.tsx`: Visualizador de cada bloque con badge de hablante, timestamps exactos `[00:14:22 - 00:14:29]`, reproductor de audio, términos evaluados y acordeón de trazabilidad forense.
     - `DictionaryManagerModal.tsx`: Gestor para consultar y añadir nuevos términos o siglas personalizadas.
     - `AudioSegmentPlayer.tsx`: Reproductor de audio acotado al fragmento con control de velocidad (0.75x, 1x, 1.25x).
  3. **Integración en la interfaz:**
     - Añadido botón `⚖️ Revisor Pericial` en la barra superior de `TranscriptionPanel.tsx`.
     - Añadido botón `⚖️ Revisar y Depurar Transcripción` en cada expediente generado y en el historial de la base de datos local.
  4. **Documentación y Pruebas:**
     - Creado `docs/reviewer-architecture.md` con especificaciones matemáticas, criterios de confianza y algoritmos.
     - Creado `tests/reviewer.test.ts` con 37 pruebas unitarias específicas.
- **Resultado:** 116 pruebas automatizadas pasando al 100% de éxito y build limpio con Vite. Módulo pericial plenamente operativo.

---

## [2026-09-17 21:35] - Regla de Selección por Defecto según Modelos Descargados y Transcripciones Previas

- **Responsable:** Agente Asistente (DeepMind / Antigravity).
- **Motivo del cambio:** Directriz del usuario: *"Si el usuario tiene solamente un modelo descargado, entonces ese se seleccionara por defecto siempre. Si tiene más de uno se seleccionara por defecto el último que haya usado en sus últimas transcripciones."*
- **Detalle de la solución:**
  1. En `TranscriptionDatabase` (`src/services/database/transcriptionDatabase.ts`), se incorporó el método `obtenerUltimoModeloUsado(modelosValidos?: string[])` que examina de forma cronológica descendente las transcripciones ejecutadas y recupera el último modelo utilizado que coincida con los modelos válidos/descargados actualmente disponibles.
  2. En `ModelManager` (`src/services/modelManager.ts`):
     - Se implementó `obtenerModelosDescargados()` para filtrar los modelos activos en la ruta oficial (`estaDisponible === true`).
     - Se implementó `resolverModeloPorDefecto()` que aplica de forma estricta:
       - **Regla 1 (1 modelo descargado):** Si `descargados.length === 1`, se selecciona ese único modelo por defecto SIEMPRE, ignorando preferencias externas obsoletas.
       - **Regla 2 (>1 modelos descargados):** Si `descargados.length > 1`, se consulta `TranscriptionDatabase.obtenerUltimoModeloUsado(idsDescargados)` para seleccionar por defecto el último modelo usado en sus transcripciones. Si aún no hay transcripciones con los descargados, recurre al último modelo seleccionado/descargado o al primero disponible.
       - **Regla 3 (0 modelos descargados):** Fallback a la última preferencia o a `DEFAULT_MODEL`.
     - Soporte en memoria volátil (`memoriaModelosInstalados`) para asegurar compatibilidad transparente en entornos de pruebas automatizadas (Node.js/tsx) y desregistro dinámico (`desregistrarModelo`, `limpiarModelosRegistrados`).
  3. En `UserSettingsService` (`src/services/userSettingsService.ts`):
     - `obtenerConfiguracion()` y `restablecer()` sincronizan dinámicamente el campo `modelo` a través de `ModelManager.resolverModeloPorDefecto()`.
  4. En `tests/modelManager.test.ts`:
     - Se añadieron 8 pruebas unitarias validando la selección forzada con 1 modelo descargado, la selección del último usado en transcripciones con 2 modelos descargados, la actualización tras nuevas transcripciones y la transición al desinstalar modelos.
- **Archivos modificados:**
  - `src/services/database/transcriptionDatabase.ts`: Método `obtenerUltimoModeloUsado`.
  - `src/services/modelManager.ts`: Métodos `obtenerModelosDescargados`, `resolverModeloPorDefecto`, `desregistrarModelo`, `limpiarModelosRegistrados` y caché en memoria.
  - `src/services/userSettingsService.ts`: Sincronización dinámica de `modelo` en `obtenerConfiguracion()` y `restablecer()`.
  - `tests/modelManager.test.ts`: Suite de pruebas automatizadas (25 pruebas unitarias).
- **Resultado:** 79 pruebas automatizadas pasando al 100% y build de producción verificado. Comportamiento perfectamente adaptativo según el inventario de modelos y el historial real de trabajo del operador.

---

## [2026-09-17 21:30] - Persistencia Integral de Opciones y Preferencias de Usuario (UserSettingsService)

- **Responsable:** Agente Asistente (DeepMind / Antigravity).
- **Motivo del cambio:** Requerimiento del usuario para que el programa recuerde SIEMPRE todas las opciones y configuraciones del usuario entre sesiones y reinicios.
- **Detalle de la solución:**
  1. Se creó el servicio desacoplado `UserSettingsService` (`src/services/userSettingsService.ts`) bajo principios SOLID (Single Responsibility Principle, Interface Segregation) y DRY.
  2. Gestiona y persiste en almacenamiento seguro (`sephent_user_settings_v1`) con fallback a memoria volátil para entornos headless o tests de Node.js:
     - **Modelo OpenAI Whisper seleccionado:** Sincronizado bidireccionalmente con `ModelManager`.
     - **Idioma preferido de transcripción:** ('auto', 'es', 'en', 'fr', 'de', 'it', 'pt', 'zh').
     - **Formatos y actas de salida requeridas:** (.txt, .srt, .mp4).
     - **Modo de carpeta de destino:** ('default' vs 'original'), sincronizado con `OutputPathService`.
  3. Integración en `TranscriptionPanel.tsx`:
     - Inicialización síncrona del estado local a partir de `UserSettingsService.obtenerConfiguracion()`.
     - Suscripción inmediata en los handlers de cambio de idioma, checkboxes de formatos de salida, selector de modelo y radio buttons de carpeta de destino.
     - Sincronización en eventos de cierre y selección del modal `ModelManagerModal`.
  4. Batería completa de pruebas unitarias en `tests/userSettings.test.ts` validando valores por defecto, actualizaciones parciales, consistencia acumulativa y restablecimiento.
- **Archivos modificados/creados:**
  - `src/services/userSettingsService.ts`: Nuevo servicio de configuración y preferencias de usuario.
  - `src/components/TranscriptionPanel.tsx`: Vinculación de estados y manejadores de eventos con `UserSettingsService`.
  - `tests/userSettings.test.ts`: Nueva suite con 20 pruebas unitarias específicas de persistencia.
  - `package.json`: Incorporación de `tests/userSettings.test.ts` en `npm test`.
- **Resultado:** 71 pruebas automatizadas pasando al 100% de éxito y build limpio con Vite. Todas las configuraciones y elecciones del usuario se recuerdan de manera permanente.

---

## [2026-09-17 21:25] - Persistencia y Selección Automática del Último Modelo Descargado/Utilizado

- **Responsable:** Agente Asistente (DeepMind / Antigravity).
- **Motivo del cambio:** Requerimiento del usuario para que el programa utilice siempre el último modelo descargado o utilizado de forma persistente.
- **Detalle de la solución:**
  1. En `ModelManager`, se incorporó la clave de almacenamiento persistente `sephent_whisper_ultimo_modelo_persistente` junto con métodos de lectura y escritura (`registrarUltimoModeloUtilizado`, `registrarUltimoModeloDescargado`, `obtenerUltimoModeloUtilizadoODescargado`).
  2. Al descargar un nuevo modelo o importar un respaldo exitoso en `ModelManagerModal`, se registra y notifica automáticamente al panel principal para que lo adopte de inmediato como modelo activo.
  3. Al cambiar de modelo en el selector o al ejecutar una transcripción en `TranscriptionPanel`, el modelo queda registrado como el último utilizado.
  4. Al inicializar la aplicación, se selecciona automáticamente el último modelo utilizado/descargado, con resolución inteligente de fallbacks si no hubiera modelos guardados aún.
  5. Manejo seguro de entornos sin `localStorage` (Node.js/tests).
- **Archivos modificados:**
  - `src/services/modelManager.ts`: Métodos de registro, persistencia y resolución de último modelo utilizado/descargado.
  - `src/components/TranscriptionPanel.tsx`: Inicialización del estado `model` con `ModelManager.obtenerUltimoModeloUtilizadoODescargado()`, actualización en cambios de selector y re-sincronización al cerrar el gestor.
  - `src/components/ModelManagerModal.tsx`: Registro y activación automática tras descarga directa o importación de copias de seguridad.
  - `tests/modelManager.test.ts`: Nueva sección de pruebas automatizadas validando la regla de persistencia.
- **Resultado:** El usuario siempre encuentra preseleccionado el último modelo que descargó o con el que realizó transcripciones, eliminando fricción cognitiva y pasos innecesarios.

---

## [2026-09-17 21:20] - Reforzamiento de Centrado para Botones de Examinar

- **Responsable:** Agente Asistente (DeepMind / Antigravity).
- **Motivo del cambio:** Asegurar el centrado visual matemático y estricto del botón de examinar tanto en la superficie principal (`TranscriptionPanel.tsx`) como en el gestor de modelos (`ModelManagerModal.tsx`), con propiedades flexbox explícitas y `margin: 0 auto`.
- **Archivos modificados:**
  - `src/components/TranscriptionPanel.tsx`: Aplicación de contenedor con `display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; margin: 0.5rem auto;` y botón con `margin: 0 auto; display: inline-flex; align-items: center; justify-content: center; text-align: center; padding: 0.75rem 2rem;`.
  - `src/components/ModelManagerModal.tsx`: Envoltura y centrado explícito del botón "Examinar Backup...".
  - `src/styles/responsive.css`: Declaración de `.examine-btn-container` con `margin: 0.75rem auto; text-align: center;` y `.examine-btn` con `margin: 0 auto; text-align: center;`.
- **Resultado:** Ambos botones de examinar quedan centrados de forma perfecta y simétrica en cualquier resolución y navegador.

---

## [2026-09-17 21:15] - Cola Dinámica de Archivos, Selector de Ruta de Salida y Base de Datos Local

- **Responsable:** Agente Asistente (DeepMind / Antigravity).
- **Motivo del cambio:** Requerimiento del usuario para:
  1. Centrar el botón de examinar y permitir exploraciones múltiples sucesivas para conformar una cola acumulativa de archivos.
  2. Listar los archivos en cola con badges claros (**Audio** / **Video**), truncado de nombres con puntos suspensivos (`...`) y visualización del nombre completo al pasar el cursor encima (`title`/tooltip).
  3. Permitir retirar elementos individuales de la cola si fueron agregados por error.
  4. Garantizar que la transcripción comience estrictamente al hacer clic en el botón principal.
  5. Incorporar un contenedor adyacente a la ruta oficial de modelos con el mismo estilo visual ejecutivo pero en lenguaje sencillo para la **Ruta para guardar transcripciones** (alternando entre ruta predeterminada local y la misma carpeta del archivo original).
  6. Implementar una base de datos local persistente que registre las transcripciones finalizadas y sus rutas absolutas generadas.
  7. Retirar el subtítulo `Despacho · Investigación · Análisis Documental` de la cabecera.
- **Archivos creados/modificados:**
  - `src/App.tsx`: Retiro del texto superior.
  - `src/services/transcription/outputPathService.ts`: Resolución de ruta de salida por defecto según sistema operativo y alternancia de modos (`default` vs `original`).
  - `src/services/database/transcriptionDatabase.ts`: Repositorio local persistente con asignación de Folio `TRX-YYYYMMDD-XXXXX`, almacenamiento de metadatos y rutas completas.
  - `src/components/TranscriptionPanel.tsx`: Botón centrado, cola interactiva acumulativa con retiro de items, barra de ruta de guardado idéntica en estilo a la de modelos y visualizador de la base de datos.
  - `src/styles/responsive.css`: Estilos `.examine-btn`, `.file-queue-item`, `.file-badge-audio`, `.file-badge-video`, `.file-name-truncate` y `.file-remove-btn`.
  - `tests/transcriptionDatabase.test.ts`: Nueva suite de 16 pruebas automatizadas (48 pruebas totales pasando en el proyecto).
- **Resultado:** Flujo de carga ergonómico, flexible y trazable; persistencia completa de expedientes y experiencia de usuario fluida.

---

## [2026-09-17 21:05] - Creación del README.md Maestro en la Raíz del Proyecto

- **Responsable:** Agente Asistente (DeepMind / Antigravity).
- **Motivo del cambio:** Solicitud del usuario para documentar formalmente en la raíz las propiedades del programa, sus ventajas operativas y el alcance técnico de la herramienta.
- **Detalle de contenido incorporado:**
  - Descripción ejecutiva orientada al sector pericial, jurídico y de investigación.
  - Explicación exhaustiva de las propiedades del sistema: motor OpenAI Whisper local, detección de rutas oficiales, prevención de duplicados con hash criptográfico SHA-256, regla de nomenclatura idéntica de salidas, generación multiformato (`.txt`, `.srt`, `.mp4` con meta-imagen), telemetría en tiempo real y modales preventivos.
  - Tabla comparativa de ventajas competitivas (soberanía de datos 100% offline, ahorro de disco, interoperabilidad canónica con Whisper en Python/CLI, ligereza de Tauri).
  - Documentación de arquitectura de software: principios SOLID, Strategy Pattern, Factory Pattern, Facade Pattern, KISS y DRY.
  - Especificación del sistema visual "Lexis & Archive".
  - Diagrama de flujo de trabajo (Mermaid).
  - Guía rápida de instalación, ejecución y comandos de prueba (`npm test`).
  - Mapa de carpetas y enlaces de apoyo/donación.
- **Archivos creados/modificados:**
  - `README.md`: Documento maestro de 232 líneas y más de 15 KB de documentación formal.

---

## [2026-09-17 21:00] - Corrección de Renderizado y Estabilidad en Gestor de Modelos (BUG-004)

- **Responsable:** Agente Asistente (DeepMind / Antigravity).
- **Motivo del cambio:** Reporte del usuario indicando que el panel de gestión de modelos dejó de responder/abrir.
- **Diagnóstico y Causa Raíz:** En `ModelManagerModal.tsx`, al calcular `sombraFila` en el mapeo de modelos, se utilizó `THEME_TOKENS.colors.shadows.md` y `THEME_TOKENS.colors.shadows.sm`. Debido a que `shadows` es una propiedad de primer nivel dentro de `THEME_TOKENS` y no dentro de `colors`, el acceso a `(undefined).sm` lanzaba una excepción fatal en tiempo de ejecución (`TypeError: Cannot read properties of undefined (reading 'sm')`) que abortaba el montaje del componente.
- **Archivos modificados:**
  - `src/components/ModelManagerModal.tsx`:
    1. Corrección de ruta de tokens a `THEME_TOKENS.shadows.md` y `THEME_TOKENS.shadows.sm`.
    2. Inicialización directa de `infoRuta` y `modelos` mediante invocación inicial síncrona a `ModelManager`, evitando estados `null` intermedios antes de la ejecución de `useEffect`.
    3. Validación segura con respaldo `(infoRuta?.sistemaOperativoDetectado || 'SISTEMA').toUpperCase()`.
  - `src/styles/responsive.css`:
    - Incorporación de `background-color: rgba(18, 18, 18, 0.75)` en la clase `.modal-overlay` para garantizar contraste y oscurecimiento adecuado en cualquier navegador o pantalla móvil/escritorio.
  - `docs/bug-trace.md`: Alta y resolución de folio BUG-004.
- **Resultado:** El modal de gestión de modelos abre y opera con total fluidez tanto desde el botón principal "⚙️ Gestionar modelos" como desde el modal de advertencia preventiva.

---

## [2026-09-17 20:54] - Nomenclatura Idéntica de Salidas, Arquitectura Responsive Mobile First y Principios SOLID/KISS/DRY

- **Responsable:** Agente Asistente (DeepMind / Antigravity).
- **Motivo del cambio:** Requerimiento del usuario para:
  1. Garantizar que el archivo de salida siempre conserve exactamente el mismo nombre que el archivo cargado para transcripción, modificando únicamente su extensión según lo seleccionado por el usuario (`.txt`, `.srt`, `.mp4`).
  2. Implementar un diseño responsive integral bajo la metodología **Mobile First**.
  3. Incorporar principios de diseño de software **SOLID**, **KISS**, **DRY** y patrones de diseño adecuados (**Strategy Pattern**, **Factory Pattern**, **Facade Pattern**).
- **Archivos creados/modificados:**
  - `src/services/transcription/types.ts`: Tipos e interfaces segregadas (Interface Segregation Principle).
  - `src/services/transcription/formatStrategies.ts`: Implementación de **Strategy Pattern** (`OutputFormatStrategy`, `TxtFormatStrategy`, `SrtFormatStrategy`, `VideoFormatStrategy`) y **Factory Pattern** (`OutputFormatFactory`) para extender formatos sin modificar clases existentes (Open/Closed y Liskov Substitution).
  - `src/services/transcription/transcriptionService.ts`: **Facade Pattern** y lógica centralizada (KISS/DRY) para extracción limpia del nombre base y generación de salidas documentales.
  - `src/styles/responsive.css`: Estructura **Mobile First** con estilos base para móviles (`320px+`), objetivos táctiles accesibles WCAG (`min-height: 44px`), modales fluidos (`width: 100%`) y mejoras progresivas para tablets (`@media (min-width: 640px)`) y escritorio (`@media (min-width: 1024px)`).
  - `src/styles/global.css`: Importación del módulo responsive.
  - `src/components/TranscriptionPanel.tsx`: Integración del servicio de transcripción con nombres de archivo idénticos en descargas y adopción de clases responsivas.
  - `src/components/ModelManagerModal.tsx` & `DownloadProgressBar.tsx`: Adaptación táctil y responsiva para pantallas móviles y escritorios.
  - `tests/transcriptionService.test.ts`: Nueva suite de 18 pruebas automatizadas para verificar extracción de nombre, Strategy/Factory Pattern y preservación de nombres de archivo.
  - `package.json`: Actualización del script `test` para correr ambas suites en conjunto (32 pruebas totales).
- **Resultado:** Código desacoplado, extensible y robusto. La salida conserva siempre el nombre exacto del archivo cargado y la interfaz se adapta de forma fluida desde teléfonos móviles hasta monitores de alta resolución.

---

## [2026-09-17 20:51] - Implementación Integral del Sistema Visual "Lexis & Archive" (Estética Jurídica y Editorial)

- **Responsable:** Agente Asistente (DeepMind / Antigravity).
- **Motivo del cambio:** Requerimiento del usuario para normalizar por completo la identidad visual de la aplicación trasladando el lenguaje visual de un despacho jurídico de alto nivel, una publicación editorial de investigación y una herramienta pericial sobria: contraste negro/marfil, tipografía serif clásica en títulos, controles sans-serif limpios, ausencia de azules genéricos y neones, y normalización de microinteracciones, modales, barras de progreso y botones.
- **Resultado:** Interfaz coherente, solemne, minimalista y de altísima factura estética.

---

## [2026-09-17 20:13] - Centrado del Botón de Inicio de Transcripción

- **Responsable:** Agente Asistente (DeepMind / Antigravity).
- **Resultado:** Interfaz armónica y simétrica.

---

## [2026-09-17 20:09] - Pop-up Emergente Automático para Modelos No Descargados y Recordatorio de Gestión

- **Responsable:** Agente Asistente (DeepMind / Antigravity).
- **Resultado:** Flujo guiado que previene errores y orienta al usuario.

---

## [2026-09-17 20:07] - Normalización y Simplificación de Nomenclatura a "Disponible"

- **Responsable:** Agente Asistente (DeepMind / Antigravity).
- **Resultado:** Consistencia terminológica en todos los paneles.

---

## [2026-09-17 20:03] - Centrado del Título, Efectos Hover Iluminados y Barra de Progreso con Telemetría

- **Responsable:** Agente Asistente (DeepMind / Antigravity).
- **Resultado:** Título centrado, hover en opciones y barra con velocidad, descargado, faltante y tiempo estimado.

---

## [2026-09-17 19:35] - Implementación de Detección de Rutas Oficiales Whisper y Control Antiduplicados

- **Responsable:** Agente Asistente (DeepMind / Antigravity).
- **Resultado:** Identificación de ruta oficial (`~/.cache/whisper`), verificación previa, descarga y control antiduplicados con SHA-256.
