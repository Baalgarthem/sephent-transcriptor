# Módulo de Revisión y Depuración Inteligente Pericial (reviewer-architecture.md)

Este documento describe la arquitectura técnica, estructuras de datos, algoritmos y criterios probatorios que rigen el **Módulo de Revisión y Depuración Inteligente Pericial** de **Sephent Transcriptor**.

---

## 1. Misión y Filosofía Pericial

El módulo no vuelve a transcribir el audio, sino que actúa como una capa de post-procesamiento pericial no destructiva. Su objetivo es elevar el texto generado por Whisper hacia estándares rigurosos de legibilidad, coherencia y pulcritud ortotipográfica requeridos en sedes judiciales, ministeriales, académicas y corporativas.

> [!IMPORTANT]
> **Fidelidad Absoluta e Inmutabilidad Probatoria:**
> El sistema no "embellece", no parafrasea, no infiere intenciones ni interpreta libremente lo manifestado por los declarantes. La transcripción generada por el motor Whisper se conserva de forma inmutable; la versión depurada es una versión derivada con trazabilidad total hacia los microfragmentos originales.

---

## 2. Arquitectura General del Sistema (SOLID & DRY)

El diseño está estrictamente desacoplado de la interfaz gráfica y se organiza en capas modulares bajo principios SOLID:

```
src/services/reviewer/
├── types.ts                        # Modelos e interfaces segregadas (ISP)
├── dictionary/
│   ├── defaultTerms.ts             # Catálogo maestro (>150 términos en derecho, medicina, siglas)
│   ├── customDictionaryService.ts  # CRUD de términos de usuario y persistencia local
│   └── dictionaryService.ts        # Fachada de consulta y búsqueda por categorías
├── correction/
│   ├── phoneticNormalizer.ts       # Normalizador fonético en español (seseo, yeísmo, b/v, c/k/qu)
│   ├── stringSimilarity.ts         # Distancias métricas Damerau-Levenshtein y Jaro-Winkler
│   ├── acronymResolver.ts          # Normalizador especializado de siglas y nomenclaturas ("CFE", "IMSS")
│   └── correctionEngine.ts         # Clasificador contextual de confianza (Auto-Seguro vs Sugerencia)
├── reconstruction/
│   ├── mergeRules.ts               # Reglas configurables de unión (pausa, puntuación, semántica, hablante)
│   └── segmentMergerEngine.ts      # Reconstructor lineal O(N) de oraciones y fusionador de microfragmentos
├── speakers/
│   ├── speakerPalette.ts           # Paleta cromática ejecutiva Lexis & Archive (contraste y legibilidad)
│   └── speakerRegistry.ts          # Registro de hablantes con identificador inmutable ('speaker_01')
├── storage/
│   └── reviewerDatabase.ts         # Repositorio de expedientes revisados y bitácoras
└── transcriptionReviewerService.ts # Fachada orquestadora principal (Facade Pattern)
```

---

## 3. Estructuras de Datos Principales

### 3.1. Segmento Original Inmutable (`RawTranscriptSegment`)
Representa cada fragmento atómico emitido por el reconocedor Whisper:
```typescript
export interface RawTranscriptSegment {
  readonly id: string;           // Identificador del segmento
  readonly speakerId: string;    // 'speaker_01', 'speaker_02'
  readonly startTime: number;    // Segundos flotantes
  readonly endTime: number;      // Segundos flotantes
  readonly text: string;         // Texto crudo generado
  readonly confidence?: number;  // Confianza acústica (0.0 - 1.0)
}
```

### 3.2. Bloque de Oración Reconstruido (`ReviewedSegmentBlock`)
Representa la unidad oracional depurada:
```typescript
export interface ReviewedSegmentBlock {
  readonly id: string;
  readonly speakerId: string;                     // ID técnico inmutable ('speaker_01')
  speakerName: string;                            // Nombre visible editable ('Pedro González')
  startTime: number;                              // Timestamp de inicio del PRIMER fragmento
  endTime: number;                                // Timestamp de fin del ÚLTIMO fragmento
  readonly originalSegments: readonly RawTranscriptSegment[]; // Providencia probatoria completa
  readonly originalText: string;                  // Concatenación cruda original
  reviewedText: string;                           // Texto depurado con correcciones
  confidence: number;                             // Confianza promedio
  corrections: CorrectionTrace[];                 // Bitácora de correcciones aplicadas o sugeridas
  wasMerged: boolean;                             // Bandera de fusión
  mergeReason?: string;                           // Criterio de unión aplicado
}
```

### 3.3. Traza de Corrección (`CorrectionTrace`)
Registra cada intervención léxica con fines de cotejo pericial:
```typescript
export interface CorrectionTrace {
  readonly id: string;
  readonly originalWord: string;                  // Palabra cruda detectada
  suggestedWord: string;                          // Término canónico o sugerido
  type: 'auto_safe' | 'suggestion' | 'manual';    // Clasificación de certeza
  readonly confidence: number;                    // Puntaje compuesto (0.0 - 1.0)
  readonly reason: string;                        // Fundamento de la regla
  status: 'applied' | 'pending_review' | 'rejected' | 'user_edited';
  readonly suggestedOptions?: readonly string[];
  userNote?: string;
}
```

---

## 4. Funcionamiento del Diccionario Especializado

### 4.1. Catálogo Base Canónico
Contiene más de 150 entradas especializadas agrupadas en categorías:
- **Siglas e Instituciones:** CFE, IMSS, ISSSTE, SAT, SCJN, FGR, CJF, INE, PEMEX, CURP, RFC, PROFECO, IFT, etc.
- **Términos Jurídicos:** litisconsorcio, ad cautelam, fojas, auto de vinculación a proceso, sobreseimiento, jurisprudencia, cosa juzgada, dolo, culpa, querella, etc.
- **Términos Médicos y Forenses:** electroencefalograma, traumatismo craneoencefálico, necropsia, hemorragia subaracnoidea, cianosis, histopatología, etc.
- **Términos Técnicos e Inglés Frecuente:** software, hardware, backup, feedback, bitrate, timestamp, firmware, etc.

### 4.2. Extensibilidad Manual por el Usuario
El usuario puede añadir términos personalizados desde la interfaz gráfica mediante `CustomDictionaryService`. Cada entrada permite especificar:
- Término canónico (ej: `COFECE`)
- Categoría y significado expandido
- Variantes o errores de audio frecuentes (ej: `cofese, co fe ce`)
- Palabras clave de contexto (ej: `competencia, monopolio, mercado`)

---

## 5. Algoritmo de Corrección y Similitud Contextual

Para evitar reemplazos ciegos o arbitrarios, `CorrectionEngine` implementa una evaluación multifactorial:

1. **Normalización Fonética en Español (`PhoneticNormalizer`):**
   - Resuelve el seseo (c/s/z), confusión b/v, h muda, yeísmo (ll/y), c fuerte y k/qu.
   - Normaliza deletreos acústicos de siglas (ej. "se fe e" $\to$ "cfe").
2. **Distancia Ortográfica (`StringSimilarity`):**
   - Distancia de Damerau-Levenshtein normalizada sobre la longitud máxima de palabra.
3. **Respaldo de Contexto Temático:**
   - Si en una ventana de contexto de la oración se detectan `contextKeywords` asociadas al término, el puntaje de confianza recibe una bonificación adicional (+0.12).
4. **Matriz de Confianza y Clasificación:**
   - **Confianza $\ge 0.88$ (Corrección Automática Segura - `auto_safe`):**
     Se aplica automáticamente en el texto revisado y se registra en la bitácora con etiqueta verde. Ejemplo: *"C F E"* $\to$ *"CFE"*, o *"CF"* con contexto eléctrico $\to$ *"CFE"*.
   - **Confianza entre $0.60$ y $0.87$ (Sugerencia Manual - `suggestion`):**
     **No se aplica silenciosamente.** Se resalta visualmente en ámbar para que el usuario pueda:
     - `✓ Aceptar` la sugerencia.
     - `✕ Rechazar` y conservar la palabra original.
     - `✏️ Editar manualmente` si se trata de un término específico distinto.
   - **Confianza $< 0.60$:**
     No se propone intervención alguna.

---

## 6. Algoritmo de Fusión y Reconstrucción de Oraciones

`SegmentMergerEngine` analiza fragmentos contiguos en tiempo lineal $O(N)$, garantizando que grabaciones de varias horas con miles de fragmentos se procesen instantáneamente.

### 6.1. Criterios de Fusión (`MergeRules`):
Dos fragmentos contiguos $S_i$ y $S_{i+1}$ se fusionan si y solo si cumplen las siguientes condiciones conjuntas:

1. **Mismo Hablante:** $S_i.speakerId === S_{i+1}.speakerId$. Si hay cambio de hablante, **nunca se unen**.
2. **Distancia Temporal de Silencio:** $S_{i+1}.startTime - S_i.endTime \le 1.4\text{ s}$. Si existe una pausa prolongada, no se unen.
3. **Puntuación Terminal:** Si $S_i$ concluye en punto final (`.`), signo de interrogación (`?`) o exclamación (`!`), no se une, salvo que $S_{i+1}$ inicie en minúscula o mediante nexo continuativo ("y", "que", "pero", "donde").
4. **Continuidad Semántica:** Fragmentos que terminan en coma, preposición o conjunción inconclusa se unen obligatoriamente.
5. **Límite de Longitud:** El bloque consolidado no excede 55 palabras para preservar la legibilidad oracional.

### 6.2. Conservación Matemática de Timestamps:
Al unificar $N$ fragmentos en un bloque consolidado:
$$\text{startTime}_{\text{bloque}} = S_1.\text{startTime}$$
$$\text{endTime}_{\text{bloque}} = S_N.\text{endTime}$$
Los microfragmentos individuales se conservan intactos en el arreglo `originalSegments` para cualquier cotejo posterior.

---

## 7. Tratamiento de Hablantes y Diarización

1. **Identificador Técnico Inmutable:**
   Cada hablante recibe un identificador estable que nunca cambia: `speaker_01`, `speaker_02`, etc.
2. **Nombre Visible Dinámico:**
   El usuario puede renombrar libremente:
   - `speaker_01` $\to$ **"Pedro González"**
   - `speaker_02` $\to$ **"María González"**
   - `speaker_03` $\to$ **"Persona no identificada"**
   Al renombrar, todas las intervenciones del expediente se actualizan instantáneamente sin alterar el enlace interno.
3. **Paleta Cromática Ejecutiva:**
   Cada hablante recibe un esquema cromático sobrio (terracota, azul pizarra, verde oliva, púrpura grafito) compatible con la estética "Lexis & Archive". La identificación nunca depende únicamente del color, ya que cada intervención presenta su nombre explícito y código técnico.

---

## 8. Reproducción de Audio por Fragmento

Cada bloque dispone de su propio reproductor (`AudioSegmentPlayer`):
- Permite reproducir con precisión el intervalo sonoro `[startTime, endTime]`.
- Selector de velocidad pericial: `0.75x`, `1.0x`, `1.25x`.
- Permite al perito o abogado cotejar de oído pasajes dudosos antes de convalidar una corrección.

---

## 9. Formatos de Salida Pericial

El módulo permite exportar:
1. **Texto Depurado (`.txt`):** Formato formal con nombre del hablante, timestamps y párrafos unificados:
   ```
   Pedro González
   [00:14:22 - 00:14:29]
   El documento fue entregado ayer por la tarde ante las oficinas de CFE.
   ```
2. **Subtítulos Periciales (`.srt`):** Bloques temporizados con inicio y fin exactos.
3. **Dictamen de Trazabilidad (`.md`):** Reporte forense detallando segmentos originales, intervenciones aplicadas, justificación de cada regla y estado de aprobación del operador.
