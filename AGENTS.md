# AGENTS.md

## Contexto del proyecto
Sephent Transcriptor es una aplicación de escritorio basada en Tauri + React que permite transcribir audio y video utilizando el motor OpenAI Whisper. Ofrece distintas versiones de modelos (ligeros y grandes), detección automática de idioma, generación de archivos de salida en formatos `.txt`, `.srt` y creación de videos con una meta‑imagen que resume metadatos y palabras clave.

## Objetivo general
Desarrollar una herramienta robusta, modular y pedagógica que facilite la transcripción y generación de contenidos multimedia, cumpliendo con las normas de arquitectura y documentación especificadas en este documento.

## Objetivos específicos
- Implementar gestión de modelos Whisper (descarga, verificación y activación).
- Proveer una UI sobria que permita cargar uno o varios archivos, elegir modelo, idioma y formatos de salida.
- Mostrar una barra de progreso de la transcripción.
- Guardar transcripciones localmente y ofrecer exportación múltiple.
- Generar videos que incluyan una meta‑imagen con metadatos, top‑10 palabras y fechas detectadas.
- Añadir botón de donación vía PayPal a @helltrader.
- Cumplir con la estructura de carpetas y procesos definidos en la plantilla de agentes.

---
### Reglas generales
* Mantener arquitectura modular, separación de responsabilidades y código limpio.
* Seguir principios de Clean Code en español y documentar cada decisión.
* Utilizar carpetas `dist`, `src`, `tools`, `docs`, `tests` y `assets` según lo estipulado.
* Implementar sub‑agentes QA‑Agent y Architect‑Agent cuando sea posible.
* Todas las operaciones destructivas requieren confirmación explícita.
* Cada cambio se registra en `docs/general‑log.md`.
* Los bugs se rastrean en `docs/bug‑trace.md`.
* Mantener archivo `docs/resume.md` para reanudación tras límite de tokens.

---
### Estructura de carpetas obligatoria
```
sephent-transcriptor/
├─ assets/               # recursos estáticos, íconos, imágenes
├─ dist/                 # artefactos generados
├─ src/                  # código fuente (React, TS)
├─ tools/                # scripts de desarrollo y despliegue
│   └─ deployment-manager.ts
├─ docs/                 # documentación del proyecto
│   ├─ manual-desarrollo.md
│   ├─ manual-usuario.md
│   ├─ requerimientos.md
│   ├─ diseño-proyecto.md
│   ├─ bug-trace.md
│   ├─ legal.md
│   ├─ insumos-pendientes.md
│   ├─ stack.md
│   ├─ general-log.md
│   ├─ factibilidad.md
│   ├─ alcances.md
│   └─ resume.md
├─ tests/                # pruebas automatizadas
├─ .gitignore
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
├─ index.html
└─ AGENTS.md
```

---
### Sub‑agentes programados
* **QA‑Agent** – valida bugs, mantiene `bug‑trace.md` y ejecuta pruebas.
* **Architect‑Agent** – revisa requerimientos, diseña módulos y asegura coherencia.

---
### Herramienta de despliegue (`deployment-manager`)
El script `tools/deployment-manager.ts` debe ofrecer un menú interactivo que permita:
1. Verificar dependencias.
2. Compilar la aplicación (`vite build`).
3. Empaquetar con Tauri (`tauri build`).
4. Incrementar versión y actualizar `package.json`.
5. Publicar artefactos en `dist`.
6. Mostrar logs detallados y confirmar antes de acciones destructivas.

---
### Documentación obligatoria
Consultar la carpeta `docs/` para los archivos listados, que deben mantenerse actualizados a lo largo del desarrollo.

---
### Licencia y legal
Se debe incluir la información legal correspondiente en `docs/legal.md`, incluyendo la integración del botón PayPal.
