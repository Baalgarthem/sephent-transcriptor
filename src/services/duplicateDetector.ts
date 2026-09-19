/**
 * Servicio detector y validador de duplicados para modelos Whisper
 * 
 * Utiliza algoritmos criptográficos (SHA-256) e inspección de metadatos (tamaño y nombre)
 * para evitar almacenar modelos idénticos dos veces, conservando espacio en disco.
 */

import { WHISPER_MODELS, WhisperModelDefinition } from '../config/whisperConfig';

export interface ResultadoValidacionDuplicado {
  esDuplicado: boolean;
  motivo: 'hash-identico' | 'nombre-y-tamano-coincidente' | 'archivo-nuevo-valido' | 'modelo-oficial-coincidente';
  mensajePedagogico: string;
  modeloIdentificado?: WhisperModelDefinition;
  hashCalculado?: string;
  tamanoBytes: number;
}

export class DuplicateDetector {
  /**
   * Calcula el hash SHA-256 de un objeto File, Blob o ArrayBuffer utilizando la Web Crypto API nativa
   */
  public static async calcularSha256(archivoOBuffer: File | Blob | ArrayBuffer | { arrayBuffer: () => Promise<ArrayBuffer> }): Promise<string> {
    let buffer: ArrayBuffer;

    if (archivoOBuffer && typeof (archivoOBuffer as any).arrayBuffer === 'function') {
      buffer = await (archivoOBuffer as any).arrayBuffer();
    } else if (archivoOBuffer instanceof ArrayBuffer) {
      buffer = archivoOBuffer;
    } else {
      buffer = new Uint8Array(archivoOBuffer as any).buffer;
    }

    const cryptoApi = (typeof globalThis !== 'undefined' && globalThis.crypto) ? globalThis.crypto : (crypto as any);
    const hashBuffer = await cryptoApi.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  }

  /**
   * Comprueba si un archivo proporcionado (por ejemplo, desde una copia de seguridad)
   * es un duplicado de un modelo ya existente en la ruta oficial o coincide con la firma oficial de Whisper.
   */
  public static async verificarDuplicado(
    archivo: File | { name: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> },
    modelosExistentesEnRutaOficial: Array<{ nombreArchivo: string; hashSha256?: string; tamanoBytes: number }>
  ): Promise<ResultadoValidacionDuplicado> {
    const nombreNormalizado = archivo.name.toLowerCase();
    const tamanoBytes = archivo.size;

    // 1. Calcular hash SHA-256 para verificación exacta
    const hashCalculado = await this.calcularSha256(archivo as any);

    // 2. Comparar con los modelos que ya existen en la ruta oficial por hash
    const duplicadoPorHash = modelosExistentesEnRutaOficial.find(
      (m) => m.hashSha256 && m.hashSha256.toLowerCase() === hashCalculado.toLowerCase()
    );

    if (duplicadoPorHash) {
      return {
        esDuplicado: true,
        motivo: 'hash-identico',
        mensajePedagogico: `El archivo "${archivo.name}" tiene una firma digital SHA-256 idéntica al modelo ya instalado "${duplicadoPorHash.nombreArchivo}". No se duplicará para no desperdiciar espacio en disco.`,
        hashCalculado,
        tamanoBytes,
      };
    }

    // 3. Comprobar si ya existe un archivo con exactamente el mismo nombre y tamaño en la ruta oficial
    const coincidenciaNombreTamano = modelosExistentesEnRutaOficial.find(
      (m) => m.nombreArchivo.toLowerCase() === nombreNormalizado && Math.abs(m.tamanoBytes - tamanoBytes) < 1024
    );

    if (coincidenciaNombreTamano) {
      return {
        esDuplicado: true,
        motivo: 'nombre-y-tamano-coincidente',
        mensajePedagogico: `Ya existe el archivo "${coincidenciaNombreTamano.nombreArchivo}" en la carpeta oficial con el mismo tamaño (${(tamanoBytes / (1024 * 1024)).toFixed(1)} MB). Operación omitida para evitar duplicados.`,
        hashCalculado,
        tamanoBytes,
      };
    }

    // 4. Comprobar si coincide con alguno de los hashes oficiales de OpenAI Whisper
    const modeloOficialCoincidente = Object.values(WHISPER_MODELS).find(
      (def) => def.sha256Esperado.toLowerCase() === hashCalculado.toLowerCase()
    );

    if (modeloOficialCoincidente) {
      return {
        esDuplicado: false,
        motivo: 'modelo-oficial-coincidente',
        mensajePedagogico: `El archivo corresponde legítimamente al modelo oficial "${modeloOficialCoincidente.nombreVisible}". Se integrará en la carpeta por defecto de OpenAI Whisper.`,
        modeloIdentificado: modeloOficialCoincidente,
        hashCalculado,
        tamanoBytes,
      };
    }

    // 5. Es un archivo nuevo o modelo personalizado/fino
    return {
      esDuplicado: false,
      motivo: 'archivo-nuevo-valido',
      mensajePedagogico: `El archivo "${archivo.name}" no está duplicado y está listo para ser guardado en la ruta por defecto.`,
      hashCalculado,
      tamanoBytes,
    };
  }
}
