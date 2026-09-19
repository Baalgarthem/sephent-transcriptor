# Especificación de Requerimientos de Software (requerimientos.md)

Proyecto: **Sephent Transcriptor**  
Referencia estándar: ISO/IEC/IEEE 29148 / IEEE 830

---

## 1. Requerimientos Funcionales (RF)

### RF-01: Identificación de Rutas Oficiales de Modelos
- El sistema debe identificar automáticamente la ruta canónica del sistema operativo donde OpenAI Whisper almacena sus modelos de voz:
  - En entornos Windows: `%USERPROFILE%\.cache\whisper` (ejemplo: `C:\Users\<usuario>\.cache\whisper`).
  - En entornos Linux y macOS: `~/.cache/whisper` (o `$XDG_CACHE_HOME/whisper`).
- Debe mostrar al usuario dicha ruta oficial de forma visible y clara en la interfaz.

### RF-02: Comprobación Previa de Existencia en Ruta Oficial
- Antes de realizar cualquier descarga o iniciar transcripción, el sistema debe inspeccionar si el modelo solicitado ya existe en la ruta oficial.
- Si el modelo ya existe en la ruta oficial, debe cargarlo directamente desde dicha ubicación sin realizar descargas de red redundantes.

### RF-03: Descarga hacia la Ruta Oficial por Defecto
- En caso de que el modelo seleccionado no exista localmente, el sistema debe ofrecer descargarlo directamente hacia la carpeta por defecto oficial de Whisper (`~/.cache/whisper`).
- La descarga debe provenir de las fuentes canónicas de OpenAI (Azure CDN oficial) y mostrar progreso porcentual con telemetría en tiempo real.

### RF-04: Carga de Copias de Seguridad (Backups) de Modelos
- El usuario podrá importar copias de seguridad de modelos previamente descargados (archivos `.pt` o `.bin`).
- Los modelos importados serán colocados automáticamente en la carpeta oficial por defecto de Whisper.

### RF-05: Prevención Estricta de Duplicados
- El sistema debe calcular el hash criptográfico SHA-256 de los archivos a importar antes de almacenarlos.
- Si el hash coincide con un archivo ya instalado, o si coincide con el tamaño y nombre oficial, el sistema descartará la duplicación y notificará al usuario de manera pedagógica que el modelo ya se encuentra disponible en la carpeta oficial, evitando consumo innecesario de disco duro.

### RF-06: Transcripción de Audio y Video
- Soporte para transcribir múltiples archivos multimedia simultáneamente.
- Soporte para selección de modelos: `tiny`, `base`, `small`, `medium`, `large-v3`, `turbo`.
- Selección de idioma manual o autodetectado.

### RF-07: Financiación y Soporte Comunitario
- Acceso directo a botón de donación voluntaria vinculado a `@helltrader`.

### RF-08: Nomenclatura Idéntica y Consistente de Archivos de Salida
- El archivo de salida debe conservar **exactamente el mismo nombre base que el archivo cargado** para la transcripción, modificando exclusivamente su extensión en función del formato seleccionado por el usuario:
  - Archivo fuente: `expediente_causa_01.mp3`
  - Salida TXT: `expediente_causa_01.txt`
  - Salida SRT: `expediente_causa_01.srt`
  - Salida Video: `expediente_causa_01.mp4`
- La descarga en el navegador debe forzar de manera inequívoca este nombre de archivo idéntico mediante el atributo `download`.

---

## 2. Requerimientos No Funcionales (RNF)

- **RNF-01 (Mantenibilidad y Modularidad):** Separación estricta entre capa gráfica (`src/components/`), configuraciones (`src/config/`), servicios del dominio (`src/services/`) y estilos centralizados (`src/styles/`).
- **RNF-02 (Rendimiento y Eficiencia de Almacenamiento):** Control antiduplicado para no desperdiciar espacio en disco.
- **RNF-03 (Seguridad e Integridad):** Validación criptográfica de firmas SHA-256 para prevenir modelos corruptos o adulterados.
- **RNF-04 (Diseño Responsive Mobile First):**
  - La interfaz debe estar estructurada bajo la filosofía **Mobile First**: estilos base adaptados a pantallas táctiles de 320px a 639px con objetivos táctiles accesibles (mínimo 44px de altura según WCAG 2.1), botones en ancho completo y formularios adaptables.
  - Mejoras progresivas para pantallas medianas (tablets `>= 640px`) y grandes (escritorio `>= 1024px`).
- **RNF-05 (Principios de Diseño de Software: SOLID, KISS y DRY):**
  - **Single Responsibility (SRP):** Servicios dedicados a nombres, formatos y orquestación.
  - **Open/Closed (OCP) & Liskov Substitution (LSP):** Patrón **Strategy** para formatos documentales (`OutputFormatStrategy`), permitiendo incorporar nuevos formatos sin modificar código previo.
  - **Interface Segregation (ISP):** Interfaces tipadas granulares en `src/services/transcription/types.ts`.
  - **Dependency Inversion (DIP):** Los componentes y fachadas dependen de factorías y abstracciones.
  - **KISS & DRY:** Extracción canónica de nombres de archivo y eliminación de código redundante.
