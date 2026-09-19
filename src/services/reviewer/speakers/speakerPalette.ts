/**
 * Paleta Cromática Ejecutiva y Pericial de Hablantes (Lexis & Archive)
 * 
 * Cumple con los requisitos del usuario:
 * - Colores distintos entre sí, sobrios, legibles y compatibles con la estética editorial de la aplicación.
 * - El color actúa como guía visual complementaria; la identificación nunca depende únicamente del color.
 */

export interface ColorSchemeHablante {
  color: string;
  colorBg: string;
  colorBorder: string;
  colorTextBadge: string;
}

export const PALETA_HABLANTES_EJECUTIVA: readonly ColorSchemeHablante[] = [
  {
    // Hablante 1: Terracota Ejecutiva
    color: '#8A4331',
    colorBg: '#FAF1EF',
    colorBorder: '#E0BCB3',
    colorTextBadge: '#6B2F20',
  },
  {
    // Hablante 2: Azul Pizarra Pericial
    color: '#244F75',
    colorBg: '#EDF4F9',
    colorBorder: '#A9C6DE',
    colorTextBadge: '#183A58',
  },
  {
    // Hablante 3: Verde Oliva Forense
    color: '#3B5B43',
    colorBg: '#F0F6F1',
    colorBorder: '#ABC9B2',
    colorTextBadge: '#294330',
  },
  {
    // Hablante 4: Púrpura Pizarra
    color: '#5E4268',
    colorBg: '#F6EFF8',
    colorBorder: '#CBBCD6',
    colorTextBadge: '#462E4F',
  },
  {
    // Hablante 5: Ámbar Tabaco
    color: '#7C571F',
    colorBg: '#FCF6ED',
    colorBorder: '#DFC79F',
    colorTextBadge: '#5D3E12',
  },
  {
    // Hablante 6: Grafito y Carbón
    color: '#3B414B',
    colorBg: '#F0F2F4',
    colorBorder: '#B9BFC7',
    colorTextBadge: '#262B33',
  },
  {
    // Hablante 7: Cobalto Oscuro
    color: '#1E5868',
    colorBg: '#ECF5F7',
    colorBorder: '#A3C8D1',
    colorTextBadge: '#143F4C',
  },
  {
    // Hablante 8: Óxido Cálido
    color: '#824830',
    colorBg: '#FAF1EC',
    colorBorder: '#DAC1B5',
    colorTextBadge: '#633420',
  },
];

export class SpeakerPalette {
  /**
   * Asigna un esquema de color determinista a un hablante basado en su índice numérico o ID
   */
  public static obtenerColorParaHablante(speakerId: string, indice?: number): ColorSchemeHablante {
    let indexCalculado = 0;

    if (typeof indice === 'number') {
      indexCalculado = indice;
    } else {
      const match = speakerId.match(/\d+/);
      if (match) {
        indexCalculado = Math.max(0, parseInt(match[0], 10) - 1);
      } else {
        // Hash elemental para asignar color constante
        let hash = 0;
        for (let i = 0; i < speakerId.length; i++) {
          hash = (hash << 5) - hash + speakerId.charCodeAt(i);
          hash |= 0;
        }
        indexCalculado = Math.abs(hash);
      }
    }

    const pos = indexCalculado % PALETA_HABLANTES_EJECUTIVA.length;
    return PALETA_HABLANTES_EJECUTIVA[pos];
  }
}
