# Stack Tecnológico y Entorno (stack.md)

Detalle de librerías, dependencias y herramientas utilizadas en **Sephent Transcriptor**:

- **Motor de Transcripción:** OpenAI Whisper (modelos PyTorch canónicos `.pt`, `.bin`).
- **Pipeline de Diarización:** PyAnnote Audio 4.x (`pyannote/speaker-diarization-community-1`) integrado en Python runner.
- **Arquitectura de Software:** Inyección de Dependencias (DIContainer, Composition Root, Contratos explícitos, Estilo Arturo).
- **Framework Frontend:** React 18 con TypeScript 5.
- **Herramienta de Compilación y Bundler:** Vite 5 + `@vitejs/plugin-react`.
- **Entorno de Ejecución de Escritorio:** Tauri v1 (`@tauri-apps/api`, `@tauri-apps/cli`).
- **Criptografía e Integridad:** Web Crypto API (`crypto.subtle.digest` SHA-256).
- **Procesamiento Multimedia:** ffmpeg-static y decodificadores acústicos locales.
- **Validación y Estado:** Zod + Zustand.
- **Runner de Pruebas:** TSX (TypeScript Execute) con aserciones pedagógicas.
