# Manual de Usuario (manual-usuario.md)

Bienvenido a **Sephent Transcriptor**, la aplicación de escritorio y web para transcripción de audio y video impulsada por OpenAI Whisper.

---

## 1. Inicio Rápido

1. Abre la aplicación en tu navegador o mediante la versión de escritorio de Tauri.
2. En la parte superior verás la **Ruta Oficial de Modelos OpenAI Whisper** detectada automáticamente en tu equipo (por ejemplo: `C:\Users\<tu-usuario>\.cache\whisper`).

---

## 2. Gestión de Modelos de Voz y Copias de Seguridad

Haz clic en el botón **"⚙️ Gestionar / Cargar Backup"**:
- **Verificar Disponibilidad:** Verás el catálogo de modelos (`tiny`, `base`, `small`, `medium`, `large-v3`, `turbo`) con su estado en tiempo real (`Disponible` o `No descargado`).
- **Cargar Copia de Seguridad (Backup):**
  - Si ya cuentas con archivos `.pt` o `.bin` respaldados en tu disco o pendrive, presiona **"Examinar Backup..."**.
  - El sistema colocará los modelos directamente sobre la carpeta oficial de Whisper.
  - **Protección Antiduplicados:** Si el archivo que intentas cargar ya existe o tiene la misma firma SHA-256 que un modelo existente, el sistema te avisará con una alerta y **no lo duplicará**, ahorrando valioso espacio en disco.
- **Descarga Directa:** Si no tienes un modelo, presiona **"Descargar a Ruta Oficial"** y el programa lo descargará desde los servidores oficiales de OpenAI.

---

## 3. Cómo Transcribir un Archivo

1. **Seleccionar Archivos:** Haz clic en *Elegir archivos* y selecciona uno o varios audios o videos (`.mp3`, `.wav`, `.mp4`, `.mkv`, etc.).
2. **Seleccionar Modelo:** Elige el modelo deseado (`small` es el recomendado por defecto).
3. **Elegir Idioma:** Deja en *Auto-detectar idioma* o elige manualmente español, inglés, francés, etc.
4. **Formatos de salida:** Marca las casillas según requieras:
   - Texto sin formato (`.txt`)
   - Subtítulos temporizados (`.srt`)
   - Video con meta-imagen
5. **Iniciar:** Pulsa **"▶️ Iniciar Transcripción"**. Si el modelo no está en la ruta oficial, se te solicitará permiso para descargarlo automáticamente.

---

## 4. Donaciones y Apoyo
Si esta herramienta te es de utilidad, puedes apoyar el mantenimiento continuo mediante el botón de PayPal (@helltrader) situado al pie de la página.
