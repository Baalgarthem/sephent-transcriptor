# Alcances y Límites del Sistema (alcances.md)

- **Alcance Actual:**
  - Detección automática de la ruta canónica oficial donde Whisper almacena comúnmente sus modelos (`~/.cache/whisper` y `%USERPROFILE%\.cache\whisper`).
  - Verificación previa de existencia de modelos antes de iniciar transcripción o descarga.
  - Descarga bajo demanda directamente a la ruta por defecto.
  - Importación y carga de copias de seguridad de modelos existentes por parte del usuario.
  - Verificación estricta de no duplicación mediante firma SHA-256 para preservar el espacio en disco.
  - Selección de idiomas y formatos de salida múltiple (`.txt`, `.srt`, video subtitulado).
- **Límites:**
  - La velocidad de inferencia de Whisper depende del hardware local (GPU/CPU) del equipo del usuario.
