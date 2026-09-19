/**
 * Configuración oficial y canónica de modelos de OpenAI Whisper
 * 
 * Basada en la especificación oficial de openai-whisper:
 * - Ruta por defecto oficial: ~/.cache/whisper (Windows: %USERPROFILE%\.cache\whisper)
 * - Hashes oficiales SHA-256 calculados por OpenAI para verificar integridad y evitar duplicados
 */

export interface WhisperModelDefinition {
  id: string;
  nombreVisible: string;
  nombreArchivo: string;
  urlOficial: string;
  urlSecundaria: string;
  tamanoAproximadoMB: number;
  sha256Esperado: string;
  descripcion: string;
  idiomasSoportados: 'multilingue' | 'solo-ingles';
}

/**
 * Catálogo de modelos canónicos de OpenAI Whisper
 */
export const WHISPER_MODELS: Record<string, WhisperModelDefinition> = {
  tiny: {
    id: 'tiny',
    nombreVisible: 'Whisper Tiny (Ultraligero)',
    nombreArchivo: 'tiny.pt',
    urlOficial: 'https://openaipublic.azureedge.net/main/whisper/models/65147644a518d12f04e32d6f3b26facc3f8dd46e5390956a9424a650c0ce22b9/tiny.pt',
    urlSecundaria: 'https://huggingface.co/openai/whisper-tiny/resolve/main/tiny.bin',
    tamanoAproximadoMB: 75,
    sha256Esperado: '65147644a518d12f04e32d6f3b26facc3f8dd46e5390956a9424a650c0ce22b9',
    descripcion: 'Modelo más liviano y veloz, ideal para pruebas rápidas y equipos con recursos limitados.',
    idiomasSoportados: 'multilingue',
  },
  base: {
    id: 'base',
    nombreVisible: 'Whisper Base (Básico)',
    nombreArchivo: 'base.pt',
    urlOficial: 'https://openaipublic.azureedge.net/main/whisper/models/ed3a0b6b1c0edf879ad9b11b1af5a0e6ab5db9205f891f668f8b0e6c6326e34e/base.pt',
    urlSecundaria: 'https://huggingface.co/openai/whisper-base/resolve/main/base.bin',
    tamanoAproximadoMB: 142,
    sha256Esperado: 'ed3a0b6b1c0edf879ad9b11b1af5a0e6ab5db9205f891f668f8b0e6c6326e34e',
    descripcion: 'Excelente equilibrio entre velocidad y precisión para audios nítidos.',
    idiomasSoportados: 'multilingue',
  },
  small: {
    id: 'small',
    nombreVisible: 'Whisper Small (Recomendado)',
    nombreArchivo: 'small.pt',
    urlOficial: 'https://openaipublic.azureedge.net/main/whisper/models/9ecf779972d90ba49c06d968637d720dd632c55bbf19d441fb42bf17a411e794/small.pt',
    urlSecundaria: 'https://huggingface.co/openai/whisper-small/resolve/main/small.bin',
    tamanoAproximadoMB: 466,
    sha256Esperado: '9ecf779972d90ba49c06d968637d720dd632c55bbf19d441fb42bf17a411e794',
    descripcion: 'Modelo estándar con alta precisión para transcripciones de propósito general en español y múltiples idiomas.',
    idiomasSoportados: 'multilingue',
  },
  medium: {
    id: 'medium',
    nombreVisible: 'Whisper Medium (Avanzado)',
    nombreArchivo: 'medium.pt',
    urlOficial: 'https://openaipublic.azureedge.net/main/whisper/models/345ae4da62f9b3d59415adc60127b97c714f32e89e936602e85993674d08dcb1/medium.pt',
    urlSecundaria: 'https://huggingface.co/openai/whisper-medium/resolve/main/medium.bin',
    tamanoAproximadoMB: 1420,
    sha256Esperado: '345ae4da62f9b3d59415adc60127b97c714f32e89e936602e85993674d08dcb1',
    descripcion: 'Modelo de gran fidelidad para entornos con acentos marcados o ruido de fondo.',
    idiomasSoportados: 'multilingue',
  },
  large: {
    id: 'large',
    nombreVisible: 'Whisper Large-v3 (Máxima Precisión)',
    nombreArchivo: 'large-v3.pt',
    urlOficial: 'https://openaipublic.azureedge.net/main/whisper/models/e5b1a55b89c1367dacf97e3e19bfd829a01529dbfdeefa8caeb59b3f1b81dadb/large-v3.pt',
    urlSecundaria: 'https://huggingface.co/openai/whisper-large-v3/resolve/main/large-v3.bin',
    tamanoAproximadoMB: 2870,
    sha256Esperado: 'e5b1a55b89c1367dacf97e3e19bfd829a01529dbfdeefa8caeb59b3f1b81dadb',
    descripcion: 'La versión más potente de Whisper con el menor índice de error por palabra.',
    idiomasSoportados: 'multilingue',
  },
  turbo: {
    id: 'turbo',
    nombreVisible: 'Whisper Large-v3 Turbo (Alta Velocidad)',
    nombreArchivo: 'large-v3-turbo.pt',
    urlOficial: 'https://openaipublic.azureedge.net/main/whisper/models/aff26ae408abcba5fbf8813c21e62b0941638c5f6eebfb145be0c9839262a19a/large-v3-turbo.pt',
    urlSecundaria: 'https://huggingface.co/openai/whisper-large-v3-turbo/resolve/main/turbo.bin',
    tamanoAproximadoMB: 1540,
    sha256Esperado: 'aff26ae408abcba5fbf8813c21e62b0941638c5f6eebfb145be0c9839262a19a',
    descripcion: 'Versión optimizada de Large-v3 que ofrece velocidad de transcripción hasta 8x más rápida.',
    idiomasSoportados: 'multilingue',
  },
};

export const DEFAULT_MODEL = 'small';

/**
 * Rutas canónicas y oficiales donde OpenAI Whisper almacena comúnmente sus modelos
 */
export const RUTAS_OFICIALES_WHISPER = {
  // En Windows la ruta oficial de Whisper es %USERPROFILE%\.cache\whisper
  windows: {
    patronRuta: '%USERPROFILE%\\.cache\\whisper',
    rutaEjemplo: 'C:\\Users\\Usuario\\.cache\\whisper',
    descripcion: 'Directorio canónico de caché de OpenAI Whisper en Windows',
  },
  // En Linux y macOS es ~/.cache/whisper
  posix: {
    patronRuta: '~/.cache/whisper',
    rutaEjemplo: '/home/usuario/.cache/whisper',
    descripcion: 'Directorio estándar XDG Cache de OpenAI Whisper en Linux y macOS',
  },
  // Rutas alternativas del ecosistema (HuggingFace / PyTorch)
  alternativas: [
    {
      nombre: 'HuggingFace Hub Cache',
      patron: '~/.cache/huggingface/hub',
      descripcion: 'Modelos descargados mediante la librería transformers / huggingface_hub',
    },
    {
      nombre: 'PyTorch Hub Cache',
      patron: '~/.cache/torch/hub/checkpoints',
      descripcion: 'Checkpoints gestionados por torch.hub',
    },
  ],
};
