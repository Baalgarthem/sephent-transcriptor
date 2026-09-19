/**
 * Normalizador Fonético Adaptado al Español Hispanoamericano (SOLID - SRP)
 * 
 * Modela los fenómenos fonéticos más comunes que originan errores en Whisper:
 * - Seseo: confusión c/s/z ('ce', 'ci', 'z' -> 's')
 * - Confusión bilabial b / v
 * - H muda
 * - Yeísmo: ll / y
 * - Sonidos oclusivos velares: k, qu, c fuerte ('ca', 'co', 'cu' -> 'k')
 * - Fricativas velares: j, ge, gi
 * - Deletreo fonético de siglas ('ce fe e', 'ese a te', 'erre efe ce')
 */

export class PhoneticNormalizer {
  /**
   * Elimina diacríticos (acentos) y pasa a minúsculas
   */
  public static desacentuar(texto: string): string {
    return texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  /**
   * Genera la huella fonética normalizada en español
   */
  public static normalizarFoneticamente(palabra: string): string {
    if (!palabra) return '';

    let res = this.desacentuar(palabra.trim());

    // 1. Resolver haches mudas (respetando ch -> ch o tsh)
    res = res.replace(/([^c])h/g, '$1');
    if (res.startsWith('h')) {
      res = res.substring(1);
    }

    // 2. Confusión b y v
    res = res.replace(/[bv]/g, 'b');

    // 3. Seseo y c suave (ce, ci, z -> s)
    res = res.replace(/c([ei])/g, 's$1');
    res = res.replace(/z/g, 's');

    // 4. C fuerte y qu (k)
    res = res.replace(/qu([ei])/g, 'k$1');
    res = res.replace(/c([aou])/g, 'k$1');
    res = res.replace(/c$/g, 'k');

    // 5. Yeísmo (ll -> y)
    res = res.replace(/ll/g, 'y');

    // 6. G suave / j (ge, gi, j -> j)
    res = res.replace(/g([ei])/g, 'j$1');

    // 7. Reducción de letras dobles repetidas (ej. 'nn' -> 'n', 'rr' -> 'r')
    res = res.replace(/(.)\1+/g, '$1');

    return res;
  }

  /**
   * Convierte un deletreo fonético de siglas a una representación canónica compacta
   * Ej: "se fe e" / "ce fe e" -> "cfe", "i m s s" -> "imss"
   */
  public static normalizarDeletreoSigla(cadena: string): string {
    const mapeos: Record<string, string> = {
      'a': 'a',
      'be': 'b',
      'ce': 'c',
      'se': 'c',
      'de': 'd',
      'e': 'e',
      'efe': 'f',
      'fe': 'f',
      'ge': 'g',
      'hache': 'h',
      'i': 'i',
      'jota': 'j',
      'ka': 'k',
      'ele': 'l',
      'eme': 'm',
      'ene': 'n',
      'enie': 'ñ',
      'o': 'o',
      'pe': 'p',
      'cu': 'q',
      'erre': 'r',
      'ese': 's',
      'te': 't',
      'u': 'u',
      'uve': 'v',
      've': 'v',
      'doble u': 'w',
      'equis': 'x',
      'ye': 'y',
      'i griega': 'y',
      'zeta': 'z',
      'seta': 'z',
    };

    const tokens = cadena.toLowerCase().trim().split(/\s+/);
    if (tokens.length >= 2 && tokens.length <= 6) {
      let compactada = '';
      for (const t of tokens) {
        if (t.length === 1 && /[a-z]/i.test(t)) {
          compactada += t;
        } else if (mapeos[t]) {
          compactada += mapeos[t];
        } else {
          return cadena; // No es deletreo estricto
        }
      }
      return compactada;
    }

    return cadena;
  }
}
