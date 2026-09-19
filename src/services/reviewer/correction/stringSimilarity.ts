/**
 * Utilidades de Similitud Ortográfica y Distancia de Edición (SOLID - SRP)
 * Implementa Damerau-Levenshtein (soporta inserción, borrado, sustitución y transposición)
 */

export class StringSimilarity {
  /**
   * Calcula la distancia Damerau-Levenshtein entre dos cadenas
   */
  public static distanciaDamerauLevenshtein(a: string, b: string): number {
    const s1 = a || '';
    const s2 = b || '';
    const l1 = s1.length;
    const l2 = s2.length;

    if (l1 === 0) return l2;
    if (l2 === 0) return l1;

    const d: number[][] = [];
    for (let i = 0; i <= l1; i++) {
      d[i] = [];
      d[i][0] = i;
    }
    for (let j = 0; j <= l2; j++) {
      d[0][j] = j;
    }

    for (let i = 1; i <= l1; i++) {
      for (let j = 1; j <= l2; j++) {
        const costo = s1[i - 1] === s2[j - 1] ? 0 : 1;
        d[i][j] = Math.min(
          d[i - 1][j] + 1,       // Borrado
          d[i][j - 1] + 1,       // Inserción
          d[i - 1][j - 1] + costo // Sustitución
        );

        // Transposición adyacente
        if (i > 1 && j > 1 && s1[i - 1] === s2[j - 2] && s1[i - 2] === s2[j - 1]) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
      }
    }

    return d[l1][l2];
  }

  /**
   * Devuelve un índice de similitud normalizado entre 0.0 y 1.0
   * 1.0 representa coincidencia exacta
   */
  public static similitudNormalizada(a: string, b: string): number {
    const s1 = a.toLowerCase().trim();
    const s2 = b.toLowerCase().trim();

    if (s1 === s2) return 1.0;
    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 1.0;

    const dist = this.distanciaDamerauLevenshtein(s1, s2);
    return Math.max(0, 1 - dist / maxLen);
  }
}
