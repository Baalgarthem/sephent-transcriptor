/**
 * Registro y Gestor de Hablantes / Diarización Pericial (SOLID - SRP)
 * 
 * Garantiza:
 * 1. Identificadores técnicos inmutables ('speaker_01', 'speaker_02') nunca alterados.
 * 2. Nombres visuales editables (ej. 'Persona 1' -> 'Pedro González') propagados a todas las intervenciones.
 * 3. Asignación de esquemas de color sobrios y consistentes.
 */

import { SpeakerProfile } from '../types';
import { SpeakerPalette } from './speakerPalette';

export class SpeakerRegistry {
  private perfiles: Map<string, SpeakerProfile> = new Map();

  constructor(perfilesIniciales?: Record<string, SpeakerProfile>) {
    if (perfilesIniciales) {
      for (const [id, perfil] of Object.entries(perfilesIniciales)) {
        this.perfiles.set(id, { ...perfil });
      }
    }
  }

  /**
   * Registra un hablante detectado o recupera su perfil existente
   */
  public registrarODescubrirHablante(
    speakerId: string,
    nombrePorDefecto?: string,
    rol?: string
  ): SpeakerProfile {
    const idNormalizado = speakerId.trim();

    if (this.perfiles.has(idNormalizado)) {
      return this.perfiles.get(idNormalizado)!;
    }

    const indiceActual = this.perfiles.size;
    const esquemaColor = SpeakerPalette.obtenerColorParaHablante(idNormalizado, indiceActual);

    const numeroVisible = idNormalizado.replace(/\D/g, '') || String(indiceActual + 1);
    const displayName = nombrePorDefecto?.trim() || `Persona ${numeroVisible}`;

    const nuevoPerfil: SpeakerProfile = {
      speakerId: idNormalizado,
      displayName,
      color: esquemaColor.color,
      colorBg: esquemaColor.colorBg,
      colorBorder: esquemaColor.colorBorder,
      role: rol,
    };

    this.perfiles.set(idNormalizado, nuevoPerfil);
    return { ...nuevoPerfil };
  }

  /**
   * Renombra un hablante sin alterar su identificador técnico inmutable
   */
  public renombrarHablante(speakerId: string, nuevoNombre: string): SpeakerProfile {
    const perfil = this.perfiles.get(speakerId);
    if (!perfil) {
      throw new Error(`El hablante con identificador técnico "${speakerId}" no está registrado.`);
    }

    const nombreLimpio = nuevoNombre.trim();
    if (!nombreLimpio) {
      throw new Error('El nombre del hablante no puede estar vacío.');
    }

    perfil.displayName = nombreLimpio;
    this.perfiles.set(speakerId, perfil);

    return { ...perfil };
  }

  /**
   * Actualiza el rol o cargo del hablante (ej. 'Juez', 'Fiscal', 'Perito')
   */
  public asignarRol(speakerId: string, rol: string): SpeakerProfile {
    const perfil = this.perfiles.get(speakerId);
    if (!perfil) {
      throw new Error(`El hablante con identificador técnico "${speakerId}" no está registrado.`);
    }

    perfil.role = rol.trim();
    return { ...perfil };
  }

  /**
   * Obtiene todos los perfiles registrados como mapa ID -> SpeakerProfile
   */
  public obtenerMapa(): Record<string, SpeakerProfile> {
    const res: Record<string, SpeakerProfile> = {};
    for (const [id, p] of this.perfiles.entries()) {
      res[id] = { ...p };
    }
    return res;
  }

  /**
   * Obtiene la lista ordenada de perfiles
   */
  public obtenerLista(): SpeakerProfile[] {
    return Array.from(this.perfiles.values()).map((p) => ({ ...p }));
  }

  /**
   * Devuelve un diccionario simple speakerId -> displayName para mapeos rápidos
   */
  public obtenerMapaNombres(): Record<string, string> {
    const mapa: Record<string, string> = {};
    for (const [id, p] of this.perfiles.entries()) {
      mapa[id] = p.displayName;
    }
    return mapa;
  }
}
