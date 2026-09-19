# Sistema de Diseño y Lenguaje Visual: Lexis & Archive (design-list.md)

Este documento define de forma pedagógica, exhaustiva y obligatoria el sistema visual, paleta cromática, criterios tipográficos y reglas de interacción de **Sephent Transcriptor**, orientado a un entorno profesional de transcripción, investigación pericial, análisis documental y trabajo jurídico de alto nivel.

---

## 1. Identidad Visual y Filosofía de Diseño

- **Carácter:** Ejecutivo, sobrio, formal, minimalista y de precisión jurídica y editorial.
- **Atmósfera:** Cercana a un despacho internacional de abogados, una publicación editorial especializada de investigación o un gabinete pericial.
- **Dirección Artística:** Fuerte tensión armónica entre negro profundo/carbón satinado y blanco roto/marfil pergamino, complementada por acentos nobles en beige, arena y taupe.
- **Principio de Contención:** Ausencia total de azules tecnológicos genéricos, colores neón, esquinas desproporcionadas o gradientes de entretenimiento. El color se utiliza exclusivamente con intención semántica y rigor.

---

## 2. Paleta Cromática Completa (Tokens Oficiales)

### Superficies y Fondos
| Token CSS | Token TS | Código HEX | Función en el Sistema |
| :--- | :--- | :--- | :--- |
| `--color-bg-canvas` | `colors.bgCanvas` | `#FBFBF9` | Fondo general de la aplicación (marfil pergamino cálido). Evita la fatiga lumínica. |
| `--color-bg-secondary`| `colors.bgSecondary`| `#F3F3EF` | Fondo secundario (gris lino suave) para métricas y paneles de datos. |
| `--color-surface-base`| `colors.surfaceBase`| `#FFFFFF` | Superficie primaria de lectura de expedientes y campos de formulario. |
| `--color-surface-card`| `colors.surfaceCard`| `#FAF9F5` | Superficie de folios documentales y tarjetas informativas. |
| `--color-surface-dark`| `colors.surfaceDark`| `#121212` | Negro obsidiana para barras de estado superior y encabezados solemnes. |
| `--color-surface-dark-subtle`| `colors.surfaceDarkSubtle`| `#1C1C1A` | Carbón mate para barras de progreso activas y acentos oscuros. |

### Textos y Jerarquía Editorial
| Token CSS | Token TS | Código HEX | Función en el Sistema |
| :--- | :--- | :--- | :--- |
| `--color-text-primary` | `colors.textPrimary` | `#141412` | Tinta negra profunda: títulos, cuerpo de texto y transcripciones oficiales. |
| `--color-text-secondary`| `colors.textSecondary`| `#595852` | Grafito cálido: etiquetas secundarias, metadatos y descripciones. |
| `--color-text-muted` | `colors.textMuted` | `#8C8B82` | Ceniza suave: notas al pie, marcas de tiempo y placeholders. |
| `--color-text-on-dark`| `colors.textOnDark`| `#F5F5F0` | Blanco roto seda: tipografía sobre superficies oscuras o botones de acción. |
| `--color-text-on-dark-muted`| `colors.textOnDarkMuted`| `#A8A79E`| Gris mineral: subtítulos sobre fondo oscuro. |

### Bordes, Separadores y Acentos Nobles
| Token CSS | Token TS | Código HEX | Función en el Sistema |
| :--- | :--- | :--- | :--- |
| `--color-border-subtle` | `colors.borderSubtle` | `#E8E7E1` | Separadores de hilo capilares y líneas editoriales no invasivas. |
| `--color-border-strong` | `colors.borderStrong` | `#D1D0C7` | Contornos de controles, inputs, selectores y marcos de modal. |
| `--color-border-dark` | `colors.borderDark` | `#2D2D2A` | Divisores sobre superficies oscuras. |
| `--color-accent-primary`| `colors.accentPrimary`| `#242320` | Negro ejecutivo para botón principal de inicio de transcripción. |
| `--color-accent-hover` | `colors.accentHover` | `#383733` | Carbón profundo para estado hover del botón principal. |
| `--color-accent-taupe` | `colors.accentTaupe` | `#B5A795` | Taupe arena: acento noble para foco, enlaces de expedientes y selección. |
| `--color-accent-taupe-bg`| `colors.accentTaupeBg`| `#F7F5F0` | Velo arena suave para filas en hover y opciones enfocadas. |

### Estados Funcionales Semánticos
| Estado | Código HEX Principal | Fondo Suave HEX | Borde Sutil HEX | Aplicación |
| :--- | :--- | :--- | :--- | :--- |
| **Disponible (Éxito)** | `#2D5A3D` (*Oliva Bosque*) | `#F1F6F2` | `#C8DDCF` | Modelo presente en caché local, verificación aprobada. |
| **No descargado (Aviso)**| `#8C5A2B` (*Siena Tostado*) | `#FAF4ED` | `#E8D3BF` | Modelo pendiente de descarga, advertencias de duplicados. |
| **Error / Crítico** | `#8B2C2C` (*Granate*) | `#FBF1F1` | `#E5C3C3` | Fallo de proceso, formato corrupto, cancelación forzada. |
| **Informativo / Telemetría**| `#3A4B59` (*Pizarra Azulado*)| `#F2F5F8` | `#C9D5E0` | Diagnóstico de rutas, tamaño de archivo y velocidad. |

---

## 3. Tipografía y Jerarquía Documental

1. **Editorial Serif (`--font-serif`):**
   - Pila: `"Newsreader", Georgia, "Times New Roman", "Baskerville", serif`.
   - Uso: Título principal de la aplicación (*Sephent Transcriptor*), encabezados de secciones mayores, títulos de ventanas modales y encabezados de expedientes.
2. **Operativa Sans-Serif (`--font-sans`):**
   - Pila: `system-ui, -apple-system, "Segoe UI", Roboto, "Inter", sans-serif`.
   - Uso: Botones, campos de formulario, selectores desplegables, tablas de datos, etiquetas operativas y cuerpo de transcripción literal.
3. **Monospaciada (`--font-mono`):**
   - Pila: `"Cascadia Code", "Consolas", "Courier New", monospace`.
   - Uso: Rutas del sistema de archivos (`%USERPROFILE%\.cache\whisper`), hashes criptográficos SHA-256, telemetría de descarga y códigos de tiempo.

---

## 4. Escala de Espacios, Radios y Sombras

- **Radios de Borde:**
  - `radius-xs` (2px): Badges pequeños y marcas de estado.
  - `radius-sm` (4px): Botones, campos de entrada y selectores. Rigor formal.
  - `radius-md` (6px): Tarjetas de métricas y banners informativos.
  - `radius-lg` (8–10px): Contenedor principal de expediente y ventanas modales.
  - *Regla:* No utilizar radios redondeados infantiles (`16px+` o bordes de pastilla excesivos) en elementos funcionales.
- **Sombras:**
  - `shadow-sm`: `0 1px 2px rgba(20, 20, 18, 0.04)` (profundidad rasante sobre papel).
  - `shadow-md`: `0 4px 12px rgba(20, 20, 18, 0.06)` (elevación de botón en hover y tarjetas enfocadas).
  - `shadow-modal`: `0 25px 50px -12px rgba(0, 0, 0, 0.35)` (elevación máxima para diálogos solemnes).

---

## 5. Reglas de Componentes e Interacción

1. **Botón Principal de Transcripción:**
   - Debe estar siempre centrado para denotar la culminación del expediente.
   - Acabado en Negro Ejecutivo (`#242320`), texto marfil seda. En hover transiciona a `#383733` con elevación de 1px.
2. **Gestor de Modelos (Hover Normalizado):**
   - Al pasar el cursor sobre cualquier opción de modelo, el fondo cambia suavemente a marfil/arena tenue (`#F7F5F0`) y el borde a taupe (`#B5A795`). Prohibido el uso de sombras neón azules.
3. **Telemetría de Descarga:**
   - La barra de progreso utiliza carbón satinado (`#1C1C1A`) sobre riel arena hueso (`#E8E7E1`).
   - Las cuatro métricas (velocidad, progreso, restante, tiempo estimado) se presentan en tipografía monospaciada limpia y fondo lino claro.
4. **Folios Documentales (Resultados):**
   - Las transcripciones generadas se presentan con ribete lateral izquierdo carbón mate (`3px solid #121212`) simulando un expediente archivado, con enlaces de exportación formal.

---

## 6. Buenas Prácticas y Usos Prohibidos

### ✅ Buenas Prácticas
- Centralizar todos los estilos mediante `THEME_TOKENS` (`src/config/themeTokens.ts`) o variables CSS (`src/styles/tokens.css`).
- Dar prioridad a los espacios en blanco, la tipografía y las líneas capilares (`#E8E7E1`) antes que a cajas con bordes gruesos.
- Utilizar una redacción pedagógica, sobria y ceremonial en todos los diálogos y mensajes de estado.

### ❌ Usos Prohibidos
- **Prohibido:** Azules saturados tipo SaaS genérico (`#0070f3`, `#0284c7`, `#2563eb`).
- **Prohibido:** Gradientes brillantes o sombras neón de colores luminosos.
- **Prohibido:** Botones de colores disonantes o informales (como amarillo chillón).
- **Prohibido:** Esquinas ultra-redondeadas (`radius > 12px`) en elementos de datos.
