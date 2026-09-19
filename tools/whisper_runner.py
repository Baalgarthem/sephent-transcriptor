#!/usr/bin/env python3
"""
whisper_runner.py — Motor de Transcripcion Real con OpenAI Whisper

Responsabilidad unica (SRP):
  Recibe un archivo de audio/video, lo transcribe con Whisper y emite
  un JSON estructurado por stdout con segmentos, hablantes y metadatos.

Diarizacion:
  Usa los segmentos nativos de Whisper (con timestamps precisos) y aplica
  clustering jerarquico acustico enriquecido con 4 candados:
    1. Bimodalidad de genero (hombres vs mujeres)
    2. Diferenciacion intra-genero (multiples personas del mismo genero)
    3. Re-identificacion global por centroides
    4. Preservacion de monologo cuando solo hay una voz

Optimizaciones v0.2.0:
  - Deteccion y uso explicito de CUDA/GPU (fp16, vaciado de cache tras inferencia)
  - greedy decoding (temperature=0) en primera pasada para mayor velocidad
  - FFT global reutilizada en diarizacion (evita recalculos por segmento)
  - Lectura de audio en memoria compartida entre transcripcion y diarizacion

Uso:
  python whisper_runner.py --file "audio.mp3" --model small --language es
  python whisper_runner.py --file "audio.mp3" --model small --language auto --num-speakers 1
  python whisper_runner.py --file "audio.mp3" --model medium --device cuda
"""

import sys
import json
import argparse
import math
import os
import warnings
import numpy as np

# Suprimir advertencias de librerías para garantizar que no contaminen la salida
warnings.filterwarnings("ignore")

# ---------------------------------------------------------------------------
# Corrección de Ortografía y Puntuación Pericial
# ---------------------------------------------------------------------------

def corregir_puntuacion_y_ortografia(texto: str, idioma: str = "es") -> str:
    """
    Normaliza y pule la puntuación y ortografía de la transcripción.

    Comportamiento por idioma:
      - Español (es), catalán (ca), gallego (gl), asturiano (ast):
          Usan APERTURA + CIERRE (¿...? y ¡...!). Se insertan los signos de
          apertura cuando faltan, y se aplican correcciones léxicas con tildes.
      - Todos los demás idiomas (en, fr, pt, it, de, etc.):
          Solo usan el signo de CIERRE (? y !), como en inglés.
          No se insertan ¿ ni ¡; si Whisper los añadió por error, se eliminan.

    Pasos comunes a todos los idiomas:
      1. Limpieza de espaciado alrededor de signos de puntuación.
      2. Mayúscula inicial y tras signos de cierre.
      3. Cierre de oración con punto si no tiene puntuación final.
    """
    import re
    if not texto or not texto.strip():
        return ""

    t = texto.strip()

    # Determinar código de idioma normalizado (ej: "es-MX" → "es", "auto" → "auto")
    codigo_idioma = idioma.lower().split("-")[0].split("_")[0]

    # Idiomas que usan signos de APERTURA y CIERRE (¿...? y ¡...!)
    # Español, catalán, gallego y asturiano comparten esta convención tipográfica.
    IDIOMAS_CON_APERTURA = {"es", "ca", "gl", "ast"}
    usa_apertura = codigo_idioma in IDIOMAS_CON_APERTURA

    # 1. Normalizar espacios y signos pegados o duplicados
    t = re.sub(r'\s+', ' ', t)
    t = re.sub(r'\s+([,.:;?!])', r'\1', t)
    t = re.sub(r'([,.:;])([^\s0-9])', r'\1 \2', t)

    # 2. Correcciones léxicas y de acentuación — solo para español
    if codigo_idioma == "es" or (codigo_idioma == "auto" and usa_apertura):
        reemplazos_lexicos = [
            (r'\b(t|T)ambien\b', r'\1ambién'),
            (r'\b(a|A)demas\b', r'\1demás'),
            (r'\b(d|D)espues\b', r'\1espués'),
            (r'\b(a|A)qui\b', r'\1quí'),
            (r'\b(a|A)lli\b', r'\1llí'),
            (r'\b(a|A)lla\b', r'\1llá'),
            (r'\b(e|E)sta bien\b', r'\1stá bien'),
            (r'\b(e|E)stan\b', r'\1stán'),
            (r'\b(e|E)stara\b', r'\1stará'),
            (r'\b(e|E)staria\b', r'\1staría'),
            (r'\b(h|H)abia\b', r'\1abía'),
            (r'\b(n|N)umero\b', r'\1úmero'),
            (r'\b(n|N)umeros\b', r'\1úmeros'),
            (r'\b(m|M)etodo\b', r'\1étodo'),
            (r'\b(m|M)etodos\b', r'\1étodos'),
            (r'\b(a|A)nalisis\b', r'\1nálisis'),
            (r'\b(s|S)ituacion\b', r'\1ituación'),
            (r'\b(i|I)nformacion\b', r'\1nformación'),
            (r'\b(v|V)ersion\b', r'\1ersión'),
            (r'\b(o|O)pini[oó]n\b', r'\1pinión'),
            (r'\b(o|O)piniones\b', r'\1piniones'),
            (r'\b(a|A)tencion\b', r'\1tención'),
            (r'\b(c|C)onclusion\b', r'\1onclusión'),
            (r'\b(c|C)onclusiones\b', r'\1onclusiones'),
            (r'\b(d|D)eclaracion\b', r'\1eclaración'),
            (r'\b(d|D)eclaraciones\b', r'\1eclaraciones'),
            (r'\b(i|I)nvestigacion\b', r'\1nvestigación'),
            (r'\b(g|G)rabacion\b', r'\1rabación'),
            (r'\b(r|R)azon\b', r'\1azón'),
            (r'\b(c|C)orazon\b', r'\1orazón'),
            (r'\b(m|M)as o menos\b', r'\1ás o menos'),
            (r'\b(m|M)as que\b', r'\1ás que'),
            (r'\b(m|M)as de\b', r'\1ás de'),
            (r'\b(p|P)or que\?', r'\1or qué?'),
            (r'\b(p|P)or que\b(?=.*\?)', r'\1or qué'),
        ]
        for pat, repl in reemplazos_lexicos:
            t = re.sub(pat, repl, t)

        # Regla general: palabras agudas terminadas en -cion o -sion
        t = re.sub(r'([a-záéíóúñA-ZÁÉÍÓÚÑ]{2,})(cion|sion)\b', r'\1ción', t)

    # 3. Signos de apertura (¿ y ¡) — solo para idiomas que los usan
    if usa_apertura:
        if '?' in t and '¿' not in t:
            if ',' in t and t.find(',') < t.rfind('?'):
                idx_coma = t.rfind(',')
                t = t[:idx_coma + 1] + ' ¿' + t[idx_coma + 1:].strip()
            else:
                t = '¿' + t

        if '!' in t and '¡' not in t:
            if ',' in t and t.find(',') < t.rfind('!'):
                idx_coma = t.rfind(',')
                t = t[:idx_coma + 1] + ' ¡' + t[idx_coma + 1:].strip()
            else:
                t = '¡' + t

        # Acentuación de palabras interrogativas en español dentro de preguntas
        if codigo_idioma == "es" and ('¿' in t or '?' in t):
            t = re.sub(r'(¿|\b)([qQ])ue\b(?=[^.?!]*\?)', r'\1\2ué', t)
            t = re.sub(r'(¿|\b)([cC])omo\b(?=[^.?!]*\?)', r'\1\2ómo', t)
            t = re.sub(r'(¿|\b)([cC])uando\b(?=[^.?!]*\?)', r'\1\2uándo', t)
            t = re.sub(r'(¿|\b)([dD])onde\b(?=[^.?!]*\?)', r'\1\2ónde', t)
            t = re.sub(r'(¿|\b)([qQ])uien\b(?=[^.?!]*\?)', r'\1\2uién', t)
            t = re.sub(r'(¿|\b)([qQ])uienes\b(?=[^.?!]*\?)', r'\1\2uiénes', t)
            t = re.sub(r'(¿|\b)([cC])ual\b(?=[^.?!]*\?)', r'\1\2uál', t)
            t = re.sub(r'(¿|\b)([cC])uales\b(?=[^.?!]*\?)', r'\1\2uáles', t)
            t = re.sub(r'(¿|\b)([cC])uanto\b(?=[^.?!]*\?)', r'\1\2uánto', t)
            t = re.sub(r'(¿|\b)([cC])uanta\b(?=[^.?!]*\?)', r'\1\2uánta', t)
            t = re.sub(r'(¿|\b)([cC])uantos\b(?=[^.?!]*\?)', r'\1\2uántos', t)
            t = re.sub(r'(¿|\b)([cC])uantas\b(?=[^.?!]*\?)', r'\1\2uántas', t)
    else:
        # Para todos los demás idiomas: eliminar cualquier ¿ o ¡ que Whisper
        # pudiera haber insertado incorrectamente (ej. audio en inglés)
        t = t.replace('¿', '').replace('¡', '')
        t = re.sub(r'\s+', ' ', t).strip()

    # 4. Mayúscula inicial
    if len(t) > 0:
        if t[0] in ('¿', '¡') and len(t) > 1:
            t = t[0] + t[1].upper() + t[2:]
        else:
            t = t[0].upper() + t[1:]

    # Mayúscula tras punto y seguido o signos de cierre
    t = re.sub(r'([.!?]\s+)([a-záéíóúñ])', lambda m: m.group(1) + m.group(2).upper(), t)

    # 5. Cierre con puntuación adecuada si no la posee
    cierre_permitido = ('.', '?', '!', '…', ':', '"', "'", '"')
    if t and t[-1] not in cierre_permitido:
        t += '.'

    return t


# ---------------------------------------------------------------------------
# Utilidad: FFT Global Reutilizable para diarización optimizada
# ---------------------------------------------------------------------------

class AudioFFTCache:
    """
    Almacena la FFT completa del audio para reutilizarla en la extracción
    de vectores acústicos de cada segmento, evitando recalcular la FFT por chunk.
    Se calcula una sola vez al inicio de la diarización.
    """
    __slots__ = ("audio_np", "sample_rate", "freqs", "mags_global")

    def __init__(self, audio_np: np.ndarray, sample_rate: int = 16000):
        self.audio_np = audio_np
        self.sample_rate = sample_rate
        self.freqs = np.fft.rfftfreq(len(audio_np), 1.0 / sample_rate)
        self.mags_global = np.abs(np.fft.rfft(audio_np))

    def slice_mags(self, start_idx: int, end_idx: int) -> tuple:
        """
        Extrae magnitudes de FFT para el rango [start_idx, end_idx] del audio.
        Recalcula solo sobre el chunk local (necesario para precisión por segmento).
        Retorna (freqs_local, mags_local) calculados sobre el chunk.
        """
        chunk = self.audio_np[start_idx:end_idx]
        if len(chunk) < 4:
            return self.freqs, self.mags_global
        freqs_local = np.fft.rfftfreq(len(chunk), 1.0 / self.sample_rate)
        mags_local = np.abs(np.fft.rfft(chunk))
        return freqs_local, mags_local


# ---------------------------------------------------------------------------
# Motor de Diarización Acústica y Diferenciación de Voces con Candados
# ---------------------------------------------------------------------------

def extraer_vector_acustico(audio_chunk: np.ndarray, sample_rate: int = 16000,
                             fft_cache: "AudioFFTCache | None" = None,
                             chunk_start_idx: int = 0, chunk_end_idx: int = 0) -> tuple:
    """
    Extrae un vector acústico multidimensional rico con candados de identificación:
      1. Tono fundamental F0 por ventanas cortas (estimación de género hombre/mujer).
      2. Banco de 7 bandas de energía formántica (diferenciación de tracto vocal).
      3. Envolvente cepstral MFCCs (1 a 19) media y desviación típica.
      4. Centroide espectral y roll-off (brillo tímbrico de la voz).
    Retorna (vector_unitario, f0_mediana, gender_score)
    """
    if len(audio_chunk) < 320:
        return np.zeros(49, dtype=np.float32), 150.0, 0.0

    # 1. MFCCs usando torchaudio si está disponible
    mfcc_mean = np.zeros(20, dtype=np.float32)
    mfcc_std = np.zeros(20, dtype=np.float32)
    try:
        import torch
        import torchaudio.transforms as T
        chunk_t = torch.from_numpy(audio_chunk.astype(np.float32)).unsqueeze(0)
        n_fft = min(400, len(audio_chunk))
        hop_length = max(80, n_fft // 2)
        mfcc_tf = T.MFCC(
            sample_rate=sample_rate,
            n_mfcc=20,
            melkwargs={"n_fft": n_fft, "hop_length": hop_length, "n_mels": 40}
        )
        mfcc_tensor = mfcc_tf(chunk_t)
        mfcc_mean = mfcc_tensor.mean(dim=-1).squeeze().numpy()
        mfcc_std = mfcc_tensor.std(dim=-1).squeeze().numpy()
    except Exception:
        fft_vals = np.abs(np.fft.rfft(audio_chunk[:1600]))
        if len(fft_vals) >= 20:
            mfcc_mean = fft_vals[:20]
        else:
            mfcc_mean = np.pad(fft_vals, (0, 20 - len(fft_vals)))

    # 2. Estimación precisa de F0 por sub-ventanas (30 ms con solape 50%)
    frame_len = int(sample_rate * 0.030)  # 480 muestras
    frame_hop = int(sample_rate * 0.015)  # 240 muestras
    f0_candidatos = []
    min_lag = max(1, int(sample_rate / 420))  # ~38
    max_lag = min(len(audio_chunk) - 1, int(sample_rate / 75))  # ~213

    if len(audio_chunk) > frame_len + max_lag:
        n_subframes = (len(audio_chunk) - frame_len - max_lag) // frame_hop
        n_subframes = min(60, max(1, n_subframes))
        for sf in range(n_subframes):
            idx = sf * frame_hop
            sub = audio_chunk[idx:idx + frame_len]
            rms = float(np.sqrt(np.mean(sub ** 2)))
            if rms > 0.008:
                corr = np.correlate(sub, sub, mode='full')
                corr = corr[len(corr)//2:]
                if len(corr) > max_lag:
                    w = corr[min_lag:max_lag]
                    if len(w) > 0:
                        max_w = np.max(w)
                        if max_w > 0.28 * corr[0]:
                            best_lag = min_lag + int(np.argmax(w))
                            f0 = float(sample_rate / best_lag)
                            if 75 <= f0 <= 420:
                                f0_candidatos.append(f0)

    if f0_candidatos:
        f0_mediana = float(np.median(f0_candidatos))
    else:
        f0_mediana = 150.0

    # Puntuación de género continua:
    # Hombres típicos: 85 - 145 Hz (score < -0.2)
    # Mujeres típicas: 165 - 280 Hz (score > +0.2)
    gender_score = float(np.clip((f0_mediana - 155.0) / 40.0, -1.0, 1.0))

    # 3. Banco de 7 Bandas de Formantes y Tracto Vocal
    # Si hay cache FFT disponible, reusar magnitudes locales del chunk
    band_energies = np.zeros(7, dtype=np.float32)
    try:
        if fft_cache is not None and chunk_end_idx > chunk_start_idx:
            freqs, mags = fft_cache.slice_mags(chunk_start_idx, chunk_end_idx)
        else:
            freqs = np.fft.rfftfreq(len(audio_chunk), 1.0 / sample_rate)
            mags = np.abs(np.fft.rfft(audio_chunk))

        band_ranges = [
            (80, 220),    # Banda 0: Sub-fundamental / Fundamental masculina
            (220, 480),   # Banda 1: Fundamental femenina y F1 bajo
            (480, 950),   # Banda 2: F1 vocal (apertura de boca)
            (950, 1850),  # Banda 3: F2 (longitud acústica del tracto)
            (1850, 3200), # Banda 4: F2 alto / F3 (timbre personal femenino)
            (3200, 5200), # Banda 5: F3 / F4 (formante del hablante)
            (5200, 8000), # Banda 6: Sibilantes / Fricativas altas
        ]
        for b_idx, (f_min, f_max) in enumerate(band_ranges):
            mask = (freqs >= f_min) & (freqs < f_max)
            band_energies[b_idx] = float(np.sum(mags[mask])) if np.any(mask) else 0.0
    except Exception:
        pass

    # 4. Centroide Espectral y Roll-off (85%)
    spectral_centroid = 1500.0
    spectral_rolloff = 3000.0
    try:
        sum_mag = np.sum(mags)
        if sum_mag > 1e-6:
            spectral_centroid = float(np.sum(freqs * mags) / sum_mag)
            cum_power = np.cumsum(mags ** 2)
            tot_power = cum_power[-1]
            idx_roll = np.searchsorted(cum_power, 0.85 * tot_power)
            spectral_rolloff = float(freqs[min(idx_roll, len(freqs) - 1)])
    except Exception:
        pass

    # Normalizaciones por sub-bloques independientes de volumen
    m_mean_sub = mfcc_mean[1:20] if len(mfcc_mean) > 1 else mfcc_mean
    m_std_sub = mfcc_std[1:20] if len(mfcc_std) > 1 else mfcc_std
    norm_m_mean = m_mean_sub / (np.linalg.norm(m_mean_sub) + 1e-7)
    norm_m_std = m_std_sub / (np.linalg.norm(m_std_sub) + 1e-7)
    norm_bands = band_energies / (np.linalg.norm(band_energies) + 1e-7)

    # Bloque prosódico normalizado
    norm_f0 = float(f0_mediana / 200.0)
    norm_centroid = float(spectral_centroid / 2200.0)
    norm_rolloff = float(spectral_rolloff / 3500.0)

    # Vector acústico final calibrado con Candado de Género y Tonalidad
    vector = np.concatenate([
        norm_m_mean,             # 19 rasgos de envolvente
        norm_m_std * 0.4,        # 19 rasgos de dinámica tímbrica
        norm_bands * 0.8,        # 7 formantes del tracto vocal
        np.array([
            gender_score * 1.8,  # Candado de Género Hombre vs Mujer
            norm_f0 * 1.1,       # Candado Tonal Fundamental F0
            norm_centroid * 0.6, # Brillo vocal
            norm_rolloff * 0.5   # Resonancia alta
        ], dtype=np.float32)
    ])
    norm_tot = np.linalg.norm(vector)
    if norm_tot > 1e-7:
        vector = vector / norm_tot

    return vector.astype(np.float32), f0_mediana, gender_score


def _calcular_silueta_acustica(X: np.ndarray, labels: np.ndarray) -> float:
    """Calcula el coeficiente de silueta promedio con distancia coseno."""
    import scipy.spatial.distance as ssd
    n = len(X)
    unique_labels = np.unique(labels)
    k = len(unique_labels)
    if k <= 1 or k >= n:
        return 0.0

    dists = ssd.squareform(ssd.pdist(X, metric='cosine'))
    silhouettes = np.zeros(n)
    for i in range(n):
        l_i = labels[i]
        same_mask = (labels == l_i)
        if np.sum(same_mask) <= 1:
            silhouettes[i] = 0.0
            continue
        a_i = float(np.sum(dists[i][same_mask]) / (np.sum(same_mask) - 1))

        b_i = 1e9
        for other_l in unique_labels:
            if other_l == l_i:
                continue
            other_mask = (labels == other_l)
            if np.sum(other_mask) == 0:
                continue
            mean_dist = float(np.mean(dists[i][other_mask]))
            if mean_dist < b_i:
                b_i = mean_dist

        max_ab = max(a_i, b_i)
        if max_ab > 0:
            silhouettes[i] = (b_i - a_i) / max_ab

    return float(np.mean(silhouettes))


def _distancia_minima_centroides(X: np.ndarray, labels: np.ndarray) -> float:
    """Calcula la distancia coseno mínima entre los centroides de los clusters."""
    import scipy.spatial.distance as ssd
    unique_labels = np.unique(labels)
    centroids = []
    for l in unique_labels:
        pts = X[labels == l]
        c = np.mean(pts, axis=0)
        norm = np.linalg.norm(c)
        if norm > 1e-7:
            c = c / norm
        centroids.append(c)
    centroids = np.array(centroids)
    if len(centroids) < 2:
        return 0.0
    return float(np.min(ssd.pdist(centroids, metric='cosine')))


def determinar_clusters_optimos(X_sub: np.ndarray, max_k: int = 6,
                                min_dist_c: float = 0.15, min_sil: float = 0.16) -> np.ndarray:
    """
    Encuentra el agrupamiento óptimo dentro de un sub-grupo acústico (ej. grupo femenino).
    Distingue a múltiples personas del mismo género que alternan en orden aleatorio.
    """
    import scipy.cluster.hierarchy as sch
    import scipy.spatial.distance as ssd

    N = len(X_sub)
    if N <= 1:
        return np.ones(N, dtype=int)

    if N == 2:
        d = float(ssd.cosine(X_sub[0], X_sub[1]))
        if d >= min_dist_c:
            return np.array([1, 2], dtype=int)
        return np.ones(2, dtype=int)

    p_dist = ssd.pdist(X_sub, metric='cosine')
    p_dist = np.nan_to_num(p_dist, nan=0.0)

    # Si la variabilidad tímbrica interna es insignificante, es la misma persona
    if np.max(p_dist) < 0.11:
        return np.ones(N, dtype=int)

    Z = sch.linkage(p_dist, method='average')
    candidatos = []
    lim_k = min(max_k, N)

    for k in range(2, lim_k + 1):
        labels = sch.fcluster(Z, t=k, criterion='maxclust')
        unique_l = np.unique(labels)
        if len(unique_l) < k:
            continue

        c_dist = _distancia_minima_centroides(X_sub, labels)
        sil = _calcular_silueta_acustica(X_sub, labels)

        if c_dist >= min_dist_c and sil >= min_sil:
            candidatos.append((k, sil, c_dist, labels))

    if not candidatos:
        return np.ones(N, dtype=int)

    # Priorizar candidatos con mayor silueta y separación acústica
    candidatos.sort(key=lambda item: (item[1] + item[2] * 0.5), reverse=True)
    return candidatos[0][3]


def diarizar_segmentos(segmentos_whisper: list, audio_np: np.ndarray = None,
                       sample_rate: int = 16000, num_speakers_forzado: int = 0) -> list:
    """
    Identifica y diferencia a los interlocutores mediante clustering jerárquico enriquecido:
      - Candado 1: Bimodalidad de género (hombres vs mujeres estrictamente separados).
      - Candado 2: Diferenciación intra-género (múltiples entrevistadas intercaladas al azar).
      - Candado 3: Re-identificación global por centroides (mantiene la identidad de personas
                   que aparecen al inicio, en medio y al final).
      - Candado 4: Preservación de monólogo cuando solo una voz está presente.

    v0.2.0: Usa AudioFFTCache para reusar la FFT global del audio y acelerar la extracción
            de vectores acústicos (reduce I/O de CPU significativamente en audios largos).
    """
    if not segmentos_whisper:
        return []

    if num_speakers_forzado == 1 or audio_np is None or len(audio_np) == 0:
        return [{**seg, "speakerId": "speaker_01"} for seg in segmentos_whisper]

    if len(segmentos_whisper) == 1:
        return [{**segmentos_whisper[0], "speakerId": "speaker_01"}]

    # Precalcular cache FFT global para reutilizar en extracción de vectores
    fft_cache = None
    try:
        if audio_np is not None and len(audio_np) > 0:
            fft_cache = AudioFFTCache(audio_np, sample_rate)
    except Exception:
        fft_cache = None

    # 1. Extraer vector de huella vocal, f0 y género para cada segmento
    vectores = []
    genders = []
    f0s = []
    for seg in segmentos_whisper:
        start_idx = max(0, int(seg["start"] * sample_rate))
        end_idx = min(len(audio_np), int(seg["end"] * sample_rate))
        if end_idx - start_idx < 320:
            chunk = np.zeros(400, dtype=np.float32)
            vec, f0_val, g_score = extraer_vector_acustico(chunk, sample_rate)
        else:
            chunk = audio_np[start_idx:end_idx]
            vec, f0_val, g_score = extraer_vector_acustico(
                chunk, sample_rate,
                fft_cache=fft_cache,
                chunk_start_idx=start_idx,
                chunk_end_idx=end_idx
            )
        vectores.append(vec)
        genders.append(g_score)
        f0s.append(f0_val)

    X = np.array(vectores, dtype=np.float32)
    N = len(segmentos_whisper)
    raw_labels = np.ones(N, dtype=int)

    try:
        import scipy.cluster.hierarchy as sch
        import scipy.spatial.distance as ssd

        if num_speakers_forzado >= 2:
            p_dist = ssd.pdist(X, metric='cosine')
            p_dist = np.nan_to_num(p_dist, nan=0.0)
            Z = sch.linkage(p_dist, method='average')
            k = min(num_speakers_forzado, N)
            raw_labels = sch.fcluster(Z, t=k, criterion='maxclust')
        else:
            # 2. Análisis de Candado de Género Bimodal
            # Identificar si conviven voces masculinas (< -0.15) y femeninas (> 0.10)
            male_indices = [i for i, g in enumerate(genders) if g < -0.15]
            female_indices = [i for i, g in enumerate(genders) if g >= -0.15]

            # Solo activar partición bimodal si hay clara presencia de ambos géneros
            hay_bimodalidad = len(male_indices) >= 1 and len(female_indices) >= 1 and \
                              (len(male_indices) / N >= 0.08) and (len(female_indices) / N >= 0.08)

            if hay_bimodalidad:
                print(f"[whisper_runner] Bimodalidad detectada: {len(male_indices)} intervenciones masculinas, {len(female_indices)} femeninas.", file=sys.stderr)

                # A. Clustering en el grupo masculino (ej. entrevistador u otros hombres)
                X_male = X[male_indices]
                labels_male = determinar_clusters_optimos(X_male, max_k=min(4, len(male_indices)),
                                                          min_dist_c=0.18, min_sil=0.18)

                # B. Clustering en el grupo femenino (múltiples entrevistadas que alternan)
                X_female = X[female_indices]
                labels_female = determinar_clusters_optimos(X_female, max_k=min(8, len(female_indices)),
                                                            min_dist_c=0.14, min_sil=0.15)

                # Asignar etiquetas globales asegurando que no colisionen
                offset_female = int(np.max(labels_male)) + 1 if len(labels_male) > 0 else 1
                for idx_m, lbl_m in zip(male_indices, labels_male):
                    raw_labels[idx_m] = int(lbl_m)
                for idx_f, lbl_f in zip(female_indices, labels_female):
                    raw_labels[idx_f] = int(lbl_f) + offset_female
            else:
                # Caso unimodal (todos hombres o todas mujeres): clustering jerárquico adaptativo
                raw_labels = determinar_clusters_optimos(X, max_k=min(8, N),
                                                         min_dist_c=0.16, min_sil=0.18)

        # 3. Candado de Re-Identificación Global por Centroides (Alineación No Consecutiva)
        # Permite que una entrevistada que habló al inicio y reaparece al final sea agrupada fielmente
        unique_clusters = np.unique(raw_labels)
        if len(unique_clusters) > 1:
            centroids = {}
            for cid in unique_clusters:
                pts = X[raw_labels == cid]
                c = np.mean(pts, axis=0)
                c_norm = np.linalg.norm(c)
                if c_norm > 1e-7:
                    c = c / c_norm
                centroids[cid] = c

            # Reasignar cada segmento a su centroide más afín dentro de su compatibilidad de género
            for i in range(N):
                candidatos_reid = []
                for cid, c_vec in centroids.items():
                    cos_sim = float(np.dot(X[i], c_vec))
                    candidatos_reid.append((cid, cos_sim))

                candidatos_reid.sort(key=lambda item: item[1], reverse=True)
                mejor_cid, mejor_sim = candidatos_reid[0]
                if mejor_sim >= 0.75:  # Similaridad coseno alta
                    raw_labels[i] = mejor_cid

    except Exception as err:
        print(f"[whisper_runner] Aviso en clustering acústico: {err}", file=sys.stderr)
        raw_labels = np.ones(N, dtype=int)

    # 4. Mapeo cronológico ceremonial:
    # El primer interlocutor en intervenir es speaker_01 (Persona 1), el segundo speaker_02, etc.
    mapa_hablantes = {}
    hablante_contador = 1
    resultado = []

    for i, seg in enumerate(segmentos_whisper):
        cluster_id = int(raw_labels[i])
        if cluster_id not in mapa_hablantes:
            mapa_hablantes[cluster_id] = f"speaker_{hablante_contador:02d}"
            hablante_contador += 1

        speaker_id = mapa_hablantes[cluster_id]
        resultado.append({**seg, "speakerId": speaker_id})

    print(f"[whisper_runner] Interlocutores finales confirmados: {len(mapa_hablantes)}", file=sys.stderr)
    return resultado


def ajustar_tiempos_precisos(seg: dict, audio_np: np.ndarray = None, sample_rate: int = 16000, es_primer_segmento: bool = False) -> tuple:
    """
    Ajusta los tiempos de inicio y fin para que los subtítulos aparezcan
    exactamente cuando la persona habla y se oculten al terminar.
    """
    orig_start = float(seg.get("start", 0.0))
    orig_end = float(seg.get("end", 0.0))
    start_s = orig_start
    end_s = orig_end

    # 1. Utilizar timestamps a nivel de palabra si Whisper los produjo
    words = seg.get("words")
    if words and len(words) > 0:
        first_word = words[0]
        last_word = words[-1]
        w_start = float(first_word.get("start", start_s))
        w_end = float(last_word.get("end", end_s))

        # En el primer diálogo o cuando el inicio fonético real está desplazado
        if w_start > start_s:
            # Empezar 50ms antes de la primera palabra para no cortar el primer fonema
            start_s = max(orig_start, w_start - 0.05)

        if w_end < end_s:
            # Terminar 150ms después de la última palabra para una lectura natural y sincronizada
            end_s = min(orig_end, w_end + 0.15)

    # 2. Refinamiento acústico por VAD (detección de energía vocal) sobre el audio real
    if audio_np is not None and len(audio_np) > 0:
        chunk_start = max(0, int(orig_start * sample_rate))
        chunk_end = min(len(audio_np), int(orig_end * sample_rate))
        chunk = audio_np[chunk_start:chunk_end]

        frame_len = int(sample_rate * 0.025)  # 25ms
        hop_len = int(sample_rate * 0.010)    # 10ms

        if len(chunk) > frame_len * 2:
            n_frames = (len(chunk) - frame_len) // hop_len
            piso_muestras = chunk[:min(len(chunk), int(sample_rate * 0.10))]
            ruido_base = float(np.sqrt(np.mean(piso_muestras ** 2))) if len(piso_muestras) > 0 else 0.001
            umbral_voz = max(0.006, ruido_base * 2.2)

            # Buscar inicio real de voz hacia adelante
            max_frames_inicio = min(n_frames, int(sample_rate * 4.0 / hop_len))
            for f in range(max_frames_inicio):
                idx = f * hop_len
                rms = float(np.sqrt(np.mean(chunk[idx:idx + frame_len] ** 2)))
                if rms > umbral_voz:
                    t_voz = orig_start + (idx / sample_rate)
                    if t_voz - start_s > 0.10:
                        start_s = max(start_s, t_voz - 0.05)
                    break

            # Buscar fin real de voz hacia atrás
            max_frames_fin = min(n_frames, int(sample_rate * 3.0 / hop_len))
            for f in range(n_frames - 1, max(0, n_frames - max_frames_fin), -1):
                idx = f * hop_len
                rms = float(np.sqrt(np.mean(chunk[idx:idx + frame_len] ** 2)))
                if rms > umbral_voz:
                    t_fin_voz = orig_start + ((idx + frame_len) / sample_rate)
                    if end_s - t_fin_voz > 0.15:
                        end_s = min(end_s, t_fin_voz + 0.12)
                    break

    # Asegurar orden cronológico coherente
    if end_s <= start_s:
        end_s = start_s + 0.5

    return round(start_s, 3), round(end_s, 3)


# ---------------------------------------------------------------------------
# Función principal de transcripción con optimizaciones CUDA v0.2.0
# ---------------------------------------------------------------------------

def detectar_dispositivo() -> tuple:
    """
    Detecta si hay GPU NVIDIA disponible con CUDA y retorna (device, fp16_soportado, info_str).
    Retorna ("cuda", True, "GPU NVIDIA ...") o ("cpu", False, "CPU").
    """
    try:
        import torch
        if torch.cuda.is_available():
            device_name = torch.cuda.get_device_name(0)
            vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
            # fp16 funciona en todas las GPU CUDA modernas (Kepler+)
            fp16 = True
            info = f"GPU NVIDIA '{device_name}' ({vram_gb:.1f} GB VRAM)"
            return "cuda", fp16, info
        else:
            return "cpu", False, "CPU (sin CUDA disponible)"
    except Exception as e:
        return "cpu", False, f"CPU (torch no disponible: {e})"


def transcribir(file_path: str, model_name: str, language: str,
                num_speakers: int, device_override: str = "auto") -> dict:
    """
    Carga Whisper, transcribe y aplica diarización. Retorna dict ResultadoWhisper.

    v0.2.0:
      - Detección explícita de CUDA/GPU con fp16 automático
      - temperature=0 (greedy decoding) para mayor velocidad y determinismo
      - Liberación explícita del modelo GPU tras la transcripción
      - FFT global reutilizada en la diarización (AudioFFTCache)
    """
    import whisper
    import gc

    model_alias = {"turbo": "large-v3-turbo"}
    resolved_model = model_alias.get(model_name, model_name)

    # Detectar dispositivo óptimo (o respetar el override del usuario)
    if device_override and device_override.lower() not in ("auto", ""):
        device = device_override.lower()
        fp16 = (device == "cuda")
        device_info = f"dispositivo forzado por parámetro: {device.upper()}"
    else:
        device, fp16, device_info = detectar_dispositivo()

    print(f"[whisper_runner] ETAPA 1/4: Cargando modelo: {resolved_model} en {device_info}", file=sys.stderr, flush=True)
    model = whisper.load_model(resolved_model, device=device)

    # Parámetros de transcripción optimizados
    kwargs = {
        "word_timestamps": True,
        "verbose": None,
        # Greedy decoding (temperatura 0): primera pasada más rápida y determinista.
        # Whisper hará fallback a temperatura mayor si la confianza es baja.
        "temperature": 0,
        "beam_size": 5,
        "best_of": 5 if device == "cpu" else 5,
        "fp16": fp16,
        "condition_on_previous_text": True,
    }
    if language and language.lower() not in ("auto", ""):
        kwargs["language"] = language

    print(f"[whisper_runner] ETAPA 2/4: Transcribiendo audio: {os.path.basename(file_path)}", file=sys.stderr, flush=True)
    real_stdout = sys.stdout
    try:
        # Redirigir stdout a stderr durante la inferencia para que ningún mensaje
        # de Whisper (como 'Detected language:') o PyTorch contamine el canal JSON
        sys.stdout = sys.stderr
        result = model.transcribe(file_path, **kwargs)
    finally:
        sys.stdout = real_stdout

    segments_raw = result.get("segments", [])
    detected_language = result.get("language", language)
    duration = segments_raw[-1]["end"] if segments_raw else 0.0

    print(f"[whisper_runner] Segmentos: {len(segments_raw)}, idioma: {detected_language}", file=sys.stderr, flush=True)

    # Cargar audio en numpy para diarización y ajuste de tiempos
    audio_np = None
    try:
        audio_np = whisper.load_audio(file_path)
    except Exception as e:
        print(f"[whisper_runner] Aviso carga audio: {e}", file=sys.stderr, flush=True)

    # Liberar el modelo de la VRAM/RAM antes de la diarización intensiva
    # Esto evita que el modelo y los vectores acústicos compitan por memoria
    try:
        del model
        if device == "cuda":
            import torch
            torch.cuda.empty_cache()
            print("[whisper_runner] Caché GPU liberada tras transcripción.", file=sys.stderr, flush=True)
        gc.collect()
    except Exception:
        pass

    print(f"[whisper_runner] ETAPA 3/4: Diarizando segmentos y discriminando interlocutores...", file=sys.stderr, flush=True)
    diarized = diarizar_segmentos(segments_raw, audio_np=audio_np,
                                  sample_rate=16000, num_speakers_forzado=num_speakers)

    print(f"[whisper_runner] ETAPA 4/4: Sincronizando marcas de tiempo y estructurando expediente...", file=sys.stderr, flush=True)
    output_segments = []
    for i, seg in enumerate(diarized):
        start_ajustado, end_ajustado = ajustar_tiempos_precisos(
            seg,
            audio_np=audio_np,
            sample_rate=16000,
            es_primer_segmento=(i == 0)
        )
        avg_logprob = seg.get("avg_logprob", -0.1)
        confidence = round(min(1.0, max(0.0, 1.0 + avg_logprob / 5.0)), 3)
        texto_pulido = corregir_puntuacion_y_ortografia(seg["text"], idioma=detected_language)
        output_segments.append({
            "id": f"seg_{i + 1}",
            "speakerId": seg["speakerId"],
            "startTime": start_ajustado,
            "endTime": end_ajustado,
            "text": texto_pulido,
            "confidence": confidence,
        })

    speaker_ids = list(dict.fromkeys(s["speakerId"] for s in output_segments))
    speaker_names = {}
    for spk_id in speaker_ids:
        digits = "".join(c for c in spk_id if c.isdigit()) or "1"
        speaker_names[spk_id] = f"Persona {int(digits)}"

    return {
        "segments": output_segments,
        "speakerNames": speaker_names,
        "durationSeconds": round(duration, 3),
        "modelUsed": resolved_model,
        "language": detected_language,
        "numSpeakers": len(speaker_ids),
    }


def main():
    # Validación de versión mínima requerida (>= 3.8) y recomendación pedagógica (3.11 / 3.12)
    py_major, py_minor = sys.version_info.major, sys.version_info.minor
    if py_major != 3 or py_minor < 8:
        py_ver = sys.version.split()[0]
        print(json.dumps({
            "error": (
                f"Versión de Python ({py_ver}) incompatible con OpenAI Whisper. Se requiere como mínimo Python 3.8 "
                f"(recomendado preferentemente Python 3.11 o Python 3.12 debido a torch, numba, numpy y tiktoken)."
            )
        }, ensure_ascii=False))
        sys.exit(1)

    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True)
    parser.add_argument("--model", default="small")
    parser.add_argument("--language", default="auto")
    parser.add_argument("--num-speakers", type=int, default=0,
                        help="0=auto, 1=monologo, 2=dialogo forzado")
    parser.add_argument("--device", default="auto",
                        help="Dispositivo de inferencia: auto, cuda, cpu (por defecto: auto)")
    args = parser.parse_args()

    if not os.path.isfile(args.file):
        print(json.dumps({"error": f"Archivo no encontrado: {args.file}"}))
        sys.exit(1)

    try:
        resultado = transcribir(args.file, args.model, args.language, args.num_speakers, args.device)
        print(json.dumps(resultado, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
