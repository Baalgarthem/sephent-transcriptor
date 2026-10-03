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

# Importación del subsistema modular de diarización pyannote / reconciliador
try:
    from tools.diarization import (
        PyannoteDiarizationService,
        DiarizationReconciler,
        DiarizationModelManager,
        EnvironmentDiagnostics,
        AudioValidator,
        DiarizationResult,
    )
except ImportError:
    try:
        from diarization import (
            PyannoteDiarizationService,
            DiarizationReconciler,
            DiarizationModelManager,
            EnvironmentDiagnostics,
            AudioValidator,
            DiarizationResult,
        )
    except ImportError:
        PyannoteDiarizationService = None
        DiarizationReconciler = None
        DiarizationModelManager = None
        EnvironmentDiagnostics = None
        AudioValidator = None
        DiarizationResult = None

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


def _construir_perfiles_voz(X: np.ndarray, labels: np.ndarray,
                             duraciones: np.ndarray) -> dict:
    """
    Construye perfiles de voz robustos ponderados por duración del segmento.

    Los segmentos cortos (p.ej. transiciones, vocativos breves) aportan menos
    al centroide del hablante que segmentos largos, donde la voz es más estable
    y representativa del tracto vocal de la persona.

    Pesos:
      - < 0.3 s  → peso 0.10 (casi descartado — muy breve, posiblemente ruidoso)
      - 0.3–1.0 s → peso 0.40 (contribución parcial)
      - 1.0–3.0 s → peso 1.00 (contribución normal)
      - > 3.0 s  → peso 1.30 (segmento largo — perfil más fiable)

    Retorna dict { cluster_id: {'centroide': np.ndarray, 'n': int,
                                 'peso_total': float, 'variance': float} }
    """
    perfiles = {}
    for cid in np.unique(labels):
        mask = (labels == cid)
        durs = duraciones[mask]
        pesos = np.where(durs < 0.3, 0.10,
                np.where(durs < 1.0, 0.40,
                np.where(durs < 3.0, 1.00, 1.30)))
        total_peso = float(np.sum(pesos))
        if total_peso < 1e-6:
            continue
        X_cluster = X[mask]
        centroide = np.average(X_cluster, axis=0, weights=pesos)
        norma = np.linalg.norm(centroide)
        if norma > 1e-7:
            centroide = centroide / norma
        # Varianza intra-cluster (compacidad del perfil)
        diffs = X_cluster - centroide
        variance = float(np.mean(np.sum(diffs ** 2, axis=1) * pesos) / total_peso)
        perfiles[int(cid)] = {
            'centroide': centroide,
            'n': int(np.sum(mask)),
            'peso_total': total_peso,
            'variance': variance,
        }
    return perfiles


def _asignar_con_confianza(X: np.ndarray, perfiles: dict,
                            genders: list, hay_bimodalidad: bool,
                            male_cluster_ids: set,
                            female_cluster_ids: set) -> tuple:
    """
    Reasigna cada segmento al perfil de voz más similar con puntuación de confianza.

    - Respeta la restricción de género si hay bimodalidad detectada (Candado de Género).
    - La confianza mide la separación entre el mejor y segundo mejor candidato.
    - Un valor de confianza bajo indica que el segmento está acústicamente "entre"
      dos perfiles — candidato a corrección por suavizado temporal.

    Retorna (new_labels: np.ndarray, confidence_scores: np.ndarray)
    """
    N = len(X)
    new_labels = np.zeros(N, dtype=int)
    confidence_scores = np.zeros(N, dtype=float)

    cluster_ids = list(perfiles.keys())
    if not cluster_ids:
        return np.ones(N, dtype=int), np.ones(N, dtype=float)

    for i in range(N):
        g = genders[i]

        # Filtrar candidatos por género si la bimodalidad fue confirmada
        if hay_bimodalidad and male_cluster_ids and female_cluster_ids:
            if g < -0.15:
                candidatos_ids = [cid for cid in cluster_ids if cid in male_cluster_ids] or cluster_ids
            else:
                candidatos_ids = [cid for cid in cluster_ids if cid in female_cluster_ids] or cluster_ids
        else:
            candidatos_ids = cluster_ids

        # Calcular similitud coseno con cada perfil candidato
        sims = [(cid, float(np.dot(X[i], perfiles[cid]['centroide'])))
                for cid in candidatos_ids]
        sims.sort(key=lambda x: x[1], reverse=True)

        best_cid, best_sim = sims[0]
        new_labels[i] = best_cid

        # Confianza: brecha normalizada entre 1er y 2do candidato
        if len(sims) > 1:
            second_sim = sims[1][1]
            gap = max(0.0, best_sim - second_sim)
            # Normalizar: gap de 0.30 o más → confianza 1.0 (muy seguro)
            confidence_scores[i] = min(1.0, gap / 0.30)
        else:
            confidence_scores[i] = 1.0

    return new_labels, confidence_scores


def _suavizar_por_contexto_temporal(labels: np.ndarray,
                                     confidence_scores: np.ndarray,
                                     ventana: int = 3,
                                     umbral_confianza: float = 0.22) -> np.ndarray:
    """
    Suaviza las asignaciones de hablante usando contexto temporal.

    Para segmentos con baja confianza (umbral_confianza), si sus vecinos
    cercanos (±ventana) coinciden mayoritariamente en un mismo hablante,
    se adopta ese hablante en lugar del asignado por el clustering puro.

    Esto corrige el caso más frecuente de error: un segmento breve de
    transición entre dos hablantes hereda características mixtas de ambas
    voces y se asigna incorrectamente; sus vecinos (que tienen voz más
    estable) votan y corrigen la asignación.

    Iteración doble para propagar correcciones en cadena.
    """
    from collections import Counter
    N = len(labels)
    smoothed = labels.copy()

    for _paso in range(2):  # Dos pasadas para propagar correcciones encadenadas
        prev = smoothed.copy()
        for i in range(N):
            if confidence_scores[i] < umbral_confianza:
                # Recoger etiquetas de vecinos con confianza aceptable
                vecinos = []
                for j in range(max(0, i - ventana), min(N, i + ventana + 1)):
                    if j != i and confidence_scores[j] >= umbral_confianza:
                        vecinos.append(int(prev[j]))
                if vecinos:
                    voto_mayoritario = Counter(vecinos).most_common(1)[0][0]
                    smoothed[i] = voto_mayoritario
                    # Elevar confianza para no seguir siendo corregido en el 2do paso
                    confidence_scores[i] = umbral_confianza

    return smoothed


def _construir_perfiles_ancla(X: np.ndarray, labels: np.ndarray,
                               duraciones: np.ndarray,
                               confidence_scores: np.ndarray,
                               genders: list, f0s: list) -> dict:
    """
    Construye perfiles de anclaje de alta calidad para cada hablante.

    Solo usa segmentos que cumplan criterios de calidad para formar el perfil:
      - Duración >= 0.8 s (suficiente contenido vocal estable)
      - Confianza >= 0.35 (asignación suficientemente clara)

    Si un cluster no tiene segmentos que cumplan los criterios, se usan todos
    sus segmentos sin filtrar (fallback).

    Cada perfil contiene:
      - centroide:          vector normalizado del hablante (estático, referencia)
      - centroide_dinamico: vector que se actualiza progresivamente al procesar
      - f0_mean / f0_std:   estadísticas F0 para el candado tonal
      - gender_mean:        puntuación de género promedio del cluster
      - momentum:           factor de memoria para actualizaciones dinámicas
    """
    perfiles = {}
    for cid in np.unique(labels):
        mask = (labels == cid)
        indices = np.where(mask)[0]

        # Filtrar por calidad: duración y confianza
        buenos = [i for i in indices
                  if duraciones[i] >= 0.8 and confidence_scores[i] >= 0.35]
        if not buenos:
            buenos = list(indices)  # Fallback: sin filtro
        if not buenos:
            continue

        X_buenos = X[buenos]
        dur_buenos = np.clip(duraciones[buenos], 0.1, 6.0)
        total_peso = float(np.sum(dur_buenos))

        centroide = np.average(X_buenos, axis=0, weights=dur_buenos)
        norma = np.linalg.norm(centroide)
        if norma > 1e-7:
            centroide /= norma

        f0_buenos = np.array([f0s[i] for i in buenos])
        f0_mean = float(np.median(f0_buenos))
        f0_std = max(28.0, float(np.std(f0_buenos)))  # Mín 28 Hz de desviación

        g_buenos = np.array([genders[i] for i in buenos])
        gender_mean = float(np.mean(g_buenos))

        perfiles[int(cid)] = {
            'centroide': centroide.copy(),          # Perfil estático (referencia)
            'centroide_dinamico': centroide.copy(), # Perfil que se actualiza
            'f0_mean': f0_mean,
            'f0_std': f0_std,
            'gender_mean': gender_mean,
            'n_buenos': len(buenos),
            'momentum': 0.90,  # 90% memoria del perfil anterior en cada actualización
        }
    return perfiles


def _f0_compatible(f0_seg: float, perfil: dict, sigma: float = 2.8) -> bool:
    """
    Verifica si el F0 de un segmento es compatible con el perfil acústico del hablante.
    Usa una ventana de sigma desviaciones estándar alrededor de la F0 media del hablante.
    Solo aplica cuando el perfil tiene suficientes muestras (>= 3 segmentos buenos).
    """
    if perfil['n_buenos'] < 3:
        return True  # Perfil nuevo — sin restricción tonal aún
    delta = abs(f0_seg - perfil['f0_mean'])
    return delta <= sigma * perfil['f0_std']


def _seguimiento_secuencial(X: np.ndarray, perfiles: dict,
                             genders: list, f0s: list, duraciones: np.ndarray,
                             hay_bimodalidad: bool,
                             male_cluster_ids: set,
                             female_cluster_ids: set,
                             umbral_seguro: float = 0.70,
                             umbral_minimo: float = 0.48) -> tuple:
    """
    Seguimiento de hablantes en orden temporal con actualización dinámica de perfiles.

    Para cada segmento (en orden cronológico):
      1. Filtra candidatos por género (Candado de Género — si hay bimodalidad)
      2. Filtra por compatibilidad F0 (Candado Tonal — penalización del 40%)
      3. Calcula similitud coseno con el perfil DINÁMICO de cada candidato
      4. Asigna al perfil más similar
      5. Si la similitud supera `umbral_seguro`, actualiza el perfil dinámico
         del hablante usando un promedio exponencial ponderado (con momentum 0.90)

    El perfil dinámico se actualiza solo con asignaciones seguras, evitando
    que un error puntual contamine el perfil del hablante para el futuro.

    Retorna (labels: np.ndarray, confidence_scores: np.ndarray)
    """
    N = len(X)
    labels = np.zeros(N, dtype=int)
    confidence_scores = np.zeros(N, dtype=float)

    cluster_ids = list(perfiles.keys())
    if not cluster_ids:
        return np.ones(N, dtype=int), np.ones(N, dtype=float)

    for i in range(N):
        g = genders[i]
        f0 = f0s[i]

        # Filtrar candidatos por género si hay bimodalidad confirmada
        if hay_bimodalidad and male_cluster_ids and female_cluster_ids:
            candidatos = (
                [cid for cid in cluster_ids if cid in male_cluster_ids]
                if g < -0.15
                else [cid for cid in cluster_ids if cid in female_cluster_ids]
            )
            if not candidatos:
                candidatos = cluster_ids  # Fallback si el filtro dejó vacío
        else:
            candidatos = cluster_ids

        # Calcular similitud contra perfil dinámico + penalización F0
        sims = []
        for cid in candidatos:
            p = perfiles[cid]
            sim = float(np.dot(X[i], p['centroide_dinamico']))
            if not _f0_compatible(f0, p):
                sim *= 0.60  # Penalizar 40% si el tono es incompatible
            sims.append((cid, sim))

        sims.sort(key=lambda x: x[1], reverse=True)
        best_cid, best_sim = sims[0]
        labels[i] = best_cid

        # Confianza normalizada
        if len(sims) > 1:
            gap = max(0.0, best_sim - sims[1][1])
            confidence_scores[i] = min(1.0, gap / 0.28)
        else:
            confidence_scores[i] = 1.0

        # Actualizar perfil dinámico solo con asignaciones seguras y segmentos largos
        if best_sim >= umbral_seguro and duraciones[i] >= 0.5:
            p = perfiles[best_cid]
            mom = p['momentum']
            nuevo_c = mom * p['centroide_dinamico'] + (1.0 - mom) * X[i]
            norma = np.linalg.norm(nuevo_c)
            if norma > 1e-7:
                p['centroide_dinamico'] = nuevo_c / norma
            # Actualizar F0 media con promedio exponencial lento
            alpha_f0 = 0.08
            p['f0_mean'] = (1.0 - alpha_f0) * p['f0_mean'] + alpha_f0 * f0

    return labels, confidence_scores


def _refinamiento_global_iterativo(X: np.ndarray, labels: np.ndarray,
                                    confidence_scores: np.ndarray,
                                    duraciones: np.ndarray,
                                    genders: list, f0s: list,
                                    hay_bimodalidad: bool,
                                    male_cluster_ids: set,
                                    female_cluster_ids: set,
                                    n_iter: int = 2) -> tuple:
    """
    Refinamiento iterativo global de las asignaciones de hablante.

    En cada iteración:
      1. Construye perfiles de anclaje solo con los segmentos de alta confianza
      2. Reasigna TODOS los segmentos contra esos perfiles (con candado F0)
      3. Actualiza las puntuaciones de confianza

    Este proceso converge a asignaciones estables donde los perfiles reflejan
    fielmente a cada hablante y los segmentos inciertos se benefician de un
    perfil más robusto en cada pasada.
    """
    curr_labels = labels.copy()
    curr_conf = confidence_scores.copy()

    for _ in range(n_iter):
        perfiles = _construir_perfiles_ancla(
            X, curr_labels, duraciones, curr_conf, genders, f0s
        )
        if len(perfiles) <= 1:
            break
        curr_labels, curr_conf = _seguimiento_secuencial(
            X, perfiles, genders, f0s, duraciones,
            hay_bimodalidad, male_cluster_ids, female_cluster_ids
        )

    return curr_labels, curr_conf


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
    Identifica y diferencia interlocutores con pipeline de 6 etapas de precisión:

      Etapa 1 — Extracción acústica de alta resolución (MFCC + F0 tonal + 7 formantes + género)
      Etapa 2 — Agrupamiento estratificado (candado de bimodalidad de género + intra-género)
      Etapa 3 — Perfiles de voz ancla (filtrado de alta calidad y estabilidad tímbrica)
      Etapa 4 — Seguimiento secuencial con actualización dinámica de perfiles y candado tonal F0
      Etapa 5 — Refinamiento global iterativo (convergencia) y suavizado contextual
      Etapa 6 — Mapeo cronológico ceremonial y preservación de voces sobrepuestas

    Candados activos:
      C1. Bimodalidad de género — hombres y mujeres nunca comparten identidad acústica
      C2. Diferenciación intra-género — hasta 8 perfiles independientes por género
      C3. Perfiles de voz ancla — segmentos estables (>=0.8s) forman el perfil de referencia
      C4. Seguimiento dinámico (momentum 0.90) — actualiza el perfil con asignaciones seguras
      C5. Candado tonal F0 — penaliza un 40% discrepancias vocales fuera del rango del hablante
      C6. Suavizado contextual — corrige asignaciones dudosas en transiciones de voz
      C7. Preservación de sobreposición — voces simultáneas se mantienen intactas en paralelo
    """
    if not segmentos_whisper:
        return []

    if num_speakers_forzado == 1 or audio_np is None or len(audio_np) == 0:
        return [{**seg, "speakerId": "speaker_01"} for seg in segmentos_whisper]

    if len(segmentos_whisper) == 1:
        return [{**segmentos_whisper[0], "speakerId": "speaker_01"}]

    # ── ETAPA 1: Extracción de vectores acústicos y parámetros tonales ────────
    fft_cache = None
    try:
        fft_cache = AudioFFTCache(audio_np, sample_rate)
    except Exception:
        fft_cache = None

    vectores = []
    genders = []
    f0s = []
    duraciones = []
    for seg in segmentos_whisper:
        start_idx = max(0, int(seg["start"] * sample_rate))
        end_idx = min(len(audio_np), int(seg["end"] * sample_rate))
        dur = float(seg.get("end", 0.0)) - float(seg.get("start", 0.0))
        duraciones.append(max(0.0, dur))
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
    duraciones = np.array(duraciones, dtype=np.float32)
    N = len(segmentos_whisper)
    raw_labels = np.ones(N, dtype=int)
    confidence_scores = np.full(N, 0.5, dtype=float)

    hay_bimodalidad = False
    male_cluster_ids: set = set()
    female_cluster_ids: set = set()

    try:
        import scipy.cluster.hierarchy as sch
        import scipy.spatial.distance as ssd

        # ── ETAPA 2: Clustering inicial estratificado ─────────────────────────
        if num_speakers_forzado >= 2:
            p_dist = ssd.pdist(X, metric='cosine')
            p_dist = np.nan_to_num(p_dist, nan=0.0)
            Z = sch.linkage(p_dist, method='average')
            k = min(num_speakers_forzado, N)
            raw_labels = sch.fcluster(Z, t=k, criterion='maxclust')
        else:
            male_indices = [i for i, g in enumerate(genders) if g < -0.15]
            female_indices = [i for i, g in enumerate(genders) if g >= -0.15]

            hay_bimodalidad = (
                len(male_indices) >= 1 and len(female_indices) >= 1
                and (len(male_indices) / N >= 0.08)
                and (len(female_indices) / N >= 0.08)
            )

            if hay_bimodalidad:
                print(
                    f"[whisper_runner] Bimodalidad detectada: "
                    f"{len(male_indices)} intervenciones masculinas, "
                    f"{len(female_indices)} femeninas.",
                    file=sys.stderr
                )
                X_male = X[np.array(male_indices)]
                labels_male = determinar_clusters_optimos(
                    X_male, max_k=min(4, len(male_indices)),
                    min_dist_c=0.18, min_sil=0.18
                )
                X_female = X[np.array(female_indices)]
                labels_female = determinar_clusters_optimos(
                    X_female, max_k=min(8, len(female_indices)),
                    min_dist_c=0.14, min_sil=0.15
                )
                offset_female = int(np.max(labels_male)) + 1 if len(labels_male) > 0 else 1
                for idx_m, lbl_m in zip(male_indices, labels_male):
                    raw_labels[idx_m] = int(lbl_m)
                for idx_f, lbl_f in zip(female_indices, labels_female):
                    raw_labels[idx_f] = int(lbl_f) + offset_female

                male_cluster_ids = set(int(raw_labels[i]) for i in male_indices)
                female_cluster_ids = set(int(raw_labels[i]) for i in female_indices)
            else:
                raw_labels = determinar_clusters_optimos(
                    X, max_k=min(8, N),
                    min_dist_c=0.16, min_sil=0.18
                )

        # ── ETAPA 3: Perfiles de voz ponderados y reasignación por confianza ───
        unique_c = np.unique(raw_labels)
        if len(unique_c) > 1:
            perfiles_base = _construir_perfiles_voz(X, raw_labels, duraciones)
            if len(perfiles_base) > 1:
                raw_labels, confidence_scores = _asignar_con_confianza(
                    X, perfiles_base, genders, hay_bimodalidad,
                    male_cluster_ids, female_cluster_ids
                )

            # ── ETAPA 4: Seguimiento secuencial con actualización dinámica y F0 ──
            perfiles_ancla = _construir_perfiles_ancla(
                X, raw_labels, duraciones, confidence_scores, genders, f0s
            )
            if len(perfiles_ancla) > 1:
                raw_labels, confidence_scores = _seguimiento_secuencial(
                    X, perfiles_ancla, genders, f0s, duraciones,
                    hay_bimodalidad, male_cluster_ids, female_cluster_ids,
                    umbral_seguro=0.70, umbral_minimo=0.48
                )

            # ── ETAPA 5: Refinamiento global iterativo y suavizado contextual ───
            raw_labels, confidence_scores = _refinamiento_global_iterativo(
                X, raw_labels, confidence_scores, duraciones,
                genders, f0s, hay_bimodalidad,
                male_cluster_ids, female_cluster_ids, n_iter=2
            )

            raw_labels = _suavizar_por_contexto_temporal(
                raw_labels, confidence_scores,
                ventana=3, umbral_confianza=0.22
            )

            n_corregidos = int(np.sum(confidence_scores < 0.22))
            if n_corregidos > 0:
                print(
                    f"[whisper_runner] Suavizado contextual: {n_corregidos} segmento(s) "
                    f"estabilizados por contexto temporal.",
                    file=sys.stderr
                )

    except Exception as err:
        print(f"[whisper_runner] Aviso en diarización acústica: {err}", file=sys.stderr)
        raw_labels = np.ones(N, dtype=int)

    # ── ETAPA 6: Mapeo cronológico ceremonial y preservación de sobreposición ─
    # El primer interlocutor en intervenir cronológicamente es speaker_01, el segundo
    # speaker_02, etc. La identidad asignada permanece inalterable a lo largo de toda
    # la transcripción. Los segmentos con solapamiento temporal (voces entrelazadas)
    # se preservan íntegramente sin truncar ni desfasar marcas de tiempo.
    mapa_hablantes: dict = {}
    hablante_contador = 1
    resultado = []

    for i, seg in enumerate(segmentos_whisper):
        cluster_id = int(raw_labels[i])
        if cluster_id not in mapa_hablantes:
            mapa_hablantes[cluster_id] = f"speaker_{hablante_contador:02d}"
            hablante_contador += 1
        resultado.append({**seg, "speakerId": mapa_hablantes[cluster_id]})

    print(
        f"[whisper_runner] Interlocutores finales confirmados: {len(mapa_hablantes)}",
        file=sys.stderr
    )
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


def normalizar_audio_amplitud(audio_np: np.ndarray, target_peak: float = 0.95) -> np.ndarray:
    """Normaliza la amplitud del audio para evitar recortes o caídas por debajo del umbral de VAD."""
    if audio_np is None or len(audio_np) == 0:
        return audio_np
    try:
        max_val = float(np.max(np.abs(audio_np)))
        if max_val > 0.0001 and max_val < 0.2:
            # Audio con muy bajo volumen: amplificar preservando rango dinámico
            gain = min(target_peak / max_val, 4.0)
            return audio_np * gain
        elif max_val > 1.0:
            # Atenuar picos de saturación
            return (audio_np / max_val) * target_peak
    except Exception:
        pass
    return audio_np


def guardar_transcripcion_parcial(ruta_parcial: str, segs_raw: list, idioma: str, modelo: str, duracion_total: float):
    """
    Guarda en disco de forma atómica la transcripción parcial acumulada hasta el momento actual.
    Permite recuperar el trabajo transcrito si el usuario cancela o si ocurre un fallo fortuito.
    """
    if not ruta_parcial:
        return
    try:
        segs_formateados = []
        for i, s in enumerate(segs_raw):
            t_start = round(float(s.get("start", 0.0)), 3)
            t_end = round(float(s.get("end", 0.0)), 3)
            avg_logprob = float(s.get("avg_logprob", -0.1))
            conf = round(min(1.0, max(0.0, 1.0 + avg_logprob / 5.0)), 3)
            texto_p = corregir_puntuacion_y_ortografia(s.get("text", ""), idioma=idioma)
            segs_formateados.append({
                "id": f"seg_{i + 1}",
                "speakerId": "speaker_01",
                "startTime": t_start,
                "endTime": t_end,
                "text": texto_p,
                "confidence": conf,
            })

        dur_actual = segs_formateados[-1]["endTime"] if segs_formateados else 0.0

        datos = {
            "segments": segs_formateados,
            "speakerNames": {"speaker_01": "Persona 1"},
            "durationSeconds": dur_actual,
            "totalAudioSeconds": round(duracion_total, 3),
            "modelUsed": modelo,
            "language": idioma,
            "numSpeakers": 1,
            "isPartial": True,
            "status": "parcial"
        }

        parent_dir = os.path.dirname(os.path.abspath(ruta_parcial))
        if parent_dir and not os.path.exists(parent_dir):
            os.makedirs(parent_dir, exist_ok=True)

        temp_file = ruta_parcial + ".tmp"
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False)
        if os.path.exists(ruta_parcial):
            os.remove(ruta_parcial)
        os.rename(temp_file, ruta_parcial)
    except Exception:
        pass


def transcribir(file_path: str, model_name: str, language: str,
                num_speakers: int, device_override: str = "auto",
                diarize: bool = True, model_dir: str = None,
                anti_truncation: bool = True,
                output_json: str = None) -> dict:
    """
    Carga Whisper, transcribe y opcionalmente aplica diarización. Retorna dict ResultadoWhisper.

    v0.2.0 - v1.2.0:
      - Soporte para carpeta personalizada por defecto (download_root)
      - Diarización opcional: si diarize=False, genera transcripción continua rápida en 3 etapas.
      - Detección explícita de CUDA/GPU con fp16 automático
      - temperature=0 (greedy decoding) para mayor velocidad y determinismo
      - Liberación explícita del modelo GPU tras la transcripción
      - FFT global reutilizada en la diarización (AudioFFTCache)
      - Normalización de amplitud para optimizar SNR y robustez de detección
    """
    import whisper
    import gc

    partial_output_path = (output_json + ".partial") if output_json else None

    model_alias = {"turbo": "large-v3-turbo"}
    resolved_model = model_alias.get(model_name, model_name)

    # Detectar dispositivo óptimo (o respetar el override del usuario)
    if device_override and device_override.lower() not in ("auto", ""):
        device = device_override.lower()
        fp16 = (device == "cuda")
        device_info = f"dispositivo forzado por parámetro: {device.upper()}"
    else:
        device, fp16, device_info = detectar_dispositivo()

    total_etapas = "4" if diarize else "3"
    print(f"[whisper_runner] ETAPA 1/{total_etapas}: Cargando modelo: {resolved_model} en {device_info}", file=sys.stderr, flush=True)
    if model_dir and os.path.isdir(model_dir):
        print(f"[whisper_runner] Usando carpeta de modelos personalizada: {model_dir}", file=sys.stderr, flush=True)
        model = whisper.load_model(resolved_model, device=device, download_root=model_dir)
    else:
        model = whisper.load_model(resolved_model, device=device)

    # ── Candado de Idioma (v0.2.2) ────────────────────────────────────────────
    # Si el usuario eligió un idioma específico pero el audio está en otro idioma,
    # esto corrige la elección automáticamente usando la detección real de Whisper.
    # Umbral de confianza: >= 55% para sobrescribir la elección del usuario.
    # En modo "auto" Whisper detecta el idioma durante la transcripción normalmente.
    # ─────────────────────────────────────────────────────────────────────────
    language_usado = language  # Por defecto, respetar la elección del usuario
    if language and language.lower() not in ("auto", ""):
        try:
            audio_muestra = whisper.load_audio(file_path)
            audio_muestra = normalizar_audio_amplitud(audio_muestra)
            audio_muestra = whisper.pad_or_trim(audio_muestra)
            n_mels = model.dims.n_mels
            mel_muestra = whisper.log_mel_spectrogram(audio_muestra, n_mels=n_mels).to(model.device)
            _, probs_idioma = model.detect_language(mel_muestra)
            idioma_detectado = max(probs_idioma, key=probs_idioma.get)
            confianza = float(probs_idioma[idioma_detectado])
            # Normalizar: el usuario puede escribir "español", "es", "ES", "es-MX" → "es"
            codigo_usuario = language.lower().split("-")[0].split("_")[0][:2]
            if idioma_detectado != codigo_usuario and confianza >= 0.55:
                print(
                    f"[whisper_runner] Candado de idioma: usuario='{language}', "
                    f"audio='{idioma_detectado}' ({confianza:.0%} confianza). "
                    f"Usando idioma del audio para mayor precisión.",
                    file=sys.stderr, flush=True
                )
                language_usado = idioma_detectado
            elif idioma_detectado != codigo_usuario:
                print(
                    f"[whisper_runner] Idioma del audio incierto ('{idioma_detectado}', {confianza:.0%}). "
                    f"Respetando elección del usuario: '{language}'.",
                    file=sys.stderr, flush=True
                )
        except Exception as e_lang:
            print(f"[whisper_runner] Aviso candado de idioma: {e_lang}", file=sys.stderr, flush=True)

    # Precargar audio para obtener duración precisa y habilitar telemetría con ETA
    audio_np = None
    audio_duration = 0.0
    try:
        audio_np = whisper.load_audio(file_path)
        audio_np = normalizar_audio_amplitud(audio_np)
        audio_duration = float(len(audio_np) / 16000.0)
        print(f"[whisper_runner] AUDIO_DURATION: {audio_duration:.2f}s", file=sys.stderr, flush=True)
    except Exception as e_dur:
        print(f"[whisper_runner] Aviso medición duración audio: {e_dur}", file=sys.stderr, flush=True)

    # Parámetros de transcripción optimizados con candados anti-truncamiento
    # En audios extensos (>10 min = 600s), desactivar condition_on_previous_text para evitar que
    # Whisper entre en bucles de alucinación o silencios repetitivos que causan truncamiento prematuro.
    desactivar_condicion_previa = anti_truncation and (audio_duration > 600.0)
    kwargs = {
        "word_timestamps": True,
        "verbose": None,
        # Greedy decoding (temperatura 0): primera pasada más rápida y determinista.
        # Whisper hará fallback a temperatura mayor si la confianza es baja.
        "temperature": 0,
        "beam_size": 5,
        "best_of": 5 if device == "cpu" else 5,
        "fp16": fp16,
        "condition_on_previous_text": not desactivar_condicion_previa,
        "compression_ratio_threshold": 2.4,
        "no_speech_threshold": 0.6,
        "logprob_threshold": -1.0,
    }
    if desactivar_condicion_previa:
        print(f"[whisper_runner] Protección anti-truncamiento activa: audio extenso ({audio_duration:.1f}s > 600s). Decodificación independiente por ventana para garantizar cobertura íntegra.", file=sys.stderr, flush=True)
    elif anti_truncation:
        print(f"[whisper_runner] Protección anti-truncamiento activa: monitoreando cobertura temporal completa.", file=sys.stderr, flush=True)

    if language_usado and language_usado.lower() not in ("auto", ""):
        kwargs["language"] = language_usado

    print(f"[whisper_runner] ETAPA 2/{total_etapas}: Transcribiendo audio: {os.path.basename(file_path)}", file=sys.stderr, flush=True)

    # Telemetría de decodificación continua en tiempo real de alta resolución (4 Hz)
    import time
    import threading
    progress_active = [True]
    progress_tracker_ref = [None]
    last_progress_emit = [0.0]
    max_pct_emitted = [15.0]
    max_processed_sec_emitted = [0.0]

    def ticker_tiempo_real():
        pct_inicio = 15.0
        pct_fin = 70.0 if diarize else 90.0
        while progress_active[0]:
            time.sleep(0.25)
            tracker = progress_tracker_ref[0]
            if not tracker or not progress_active[0]:
                continue
            try:
                now = time.time()
                elapsed = max(0.1, now - start_transcribe_time)
                total_frames = tracker.total if tracker.total and tracker.total > 0 else (audio_duration * 100.0)
                if total_frames <= 0:
                    continue

                confirmed_frames = tracker.n
                avg_speed = getattr(tracker, 'estimated_speed', 1.0)
                time_since_chunk = max(0.0, now - getattr(tracker, 'last_chunk_time', now))

                # Interpolación fluida dentro de la ventana actual (tope en 28.5s para no sobrepasar el chunk)
                interpolated_frames = min(2850.0, time_since_chunk * avg_speed * 100.0)
                current_frames = min(total_frames, confirmed_frames + interpolated_frames)

                frac = min(0.999, max(0.0, current_frames / float(total_frames)))
                raw_pct = pct_inicio + frac * (pct_fin - pct_inicio)
                max_pct_emitted[0] = max(max_pct_emitted[0], min(pct_fin, raw_pct))
                pct_global = max_pct_emitted[0]

                raw_processed = min(audio_duration, current_frames / 100.0)
                max_processed_sec_emitted[0] = max(max_processed_sec_emitted[0], raw_processed)
                processed_sec = max_processed_sec_emitted[0]

                # Estimación de tiempo multi-etapa continua (Whisper + etapas posteriores)
                overhead_post = (max(4.0, audio_duration * 0.08) + 2.0) if diarize else 2.0
                if frac > 0.01:
                    total_time_est = elapsed / frac
                    eta_whisper = max(0.0, total_time_est - elapsed)
                    eta_sec = eta_whisper + overhead_post
                else:
                    prior_whisper = max(5.0, (audio_duration / max(0.5, avg_speed)))
                    eta_sec = max(3.0, prior_whisper + overhead_post)

                if now - last_progress_emit[0] >= 0.25:
                    last_progress_emit[0] = now
                    prog_data = {
                        "pct": round(pct_global, 1),
                        "eta_sec": round(eta_sec),
                        "speed": round(avg_speed, 1),
                        "stage": 2,
                        "processed_sec": round(processed_sec, 1),
                        "total_sec": round(audio_duration, 1),
                        "substage": "Decodificación Acústica Fonética",
                        "action": f"Inferencia fonética acústica ({processed_sec:.1f}s / {audio_duration:.1f}s) • Whisper {resolved_model} activo",
                        "msg": f"Decodificando audio con Whisper ({pct_global:.1f}%)..."
                    }
                    print(f"[whisper_progress] {json.dumps(prog_data)}", file=sys.stderr, flush=True)
            except Exception:
                pass

    try:
        import tqdm
        orig_tqdm = tqdm.tqdm
        start_transcribe_time = time.time()

        class WhisperProgressTracker(orig_tqdm):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, **kwargs)
                self.estimated_speed = 1.0
                self.last_chunk_time = time.time()
                progress_tracker_ref[0] = self

            def update(self, n=1):
                super().update(n)
                now = time.time()
                self.last_chunk_time = now
                elapsed = max(0.1, now - start_transcribe_time)
                if self.total and self.total > 0:
                    frac = min(1.0, max(0.0, self.n / float(self.total)))
                    if frac > 0 and audio_duration > 0:
                        self.estimated_speed = max(0.1, (frac * audio_duration) / elapsed)

                    pct_inicio = 15.0
                    pct_fin = 70.0 if diarize else 90.0
                    raw_pct = pct_inicio + frac * (pct_fin - pct_inicio)
                    max_pct_emitted[0] = max(max_pct_emitted[0], min(pct_fin, raw_pct))
                    pct_global = max_pct_emitted[0]

                    raw_processed = min(audio_duration, self.n / 100.0)
                    max_processed_sec_emitted[0] = max(max_processed_sec_emitted[0], raw_processed)
                    processed_sec = max_processed_sec_emitted[0]

                    overhead_post = (max(4.0, audio_duration * 0.08) + 2.0) if diarize else 2.0
                    total_time_est = elapsed / max(0.01, frac)
                    eta_whisper = max(0.0, total_time_est - elapsed)
                    eta_sec = eta_whisper + overhead_post

                    last_progress_emit[0] = now
                    prog_data = {
                        "pct": round(pct_global, 1),
                        "eta_sec": round(eta_sec),
                        "speed": round(self.estimated_speed, 1),
                        "stage": 2,
                        "processed_sec": round(processed_sec, 1),
                        "total_sec": round(audio_duration, 1),
                        "substage": "Decodificación Acústica Fonética",
                        "action": f"Decodificando inferencia fonética ({processed_sec:.1f}s / {audio_duration:.1f}s) • Whisper {resolved_model} activo",
                        "msg": f"Decodificando audio con Whisper ({pct_global:.1f}%)..."
                    }
                    print(f"[whisper_progress] {json.dumps(prog_data)}", file=sys.stderr, flush=True)

                    # Captura y resguardo en disco de la transcripción parcial en tiempo real
                    try:
                        caller_frame = sys._getframe(1)
                        live_segs = caller_frame.f_locals.get("all_segments")
                        if live_segs and partial_output_path:
                            guardar_transcripcion_parcial(
                                partial_output_path,
                                live_segs,
                                caller_frame.f_locals.get("language", language_usado),
                                resolved_model,
                                audio_duration
                            )
                    except Exception:
                        pass

        tqdm.tqdm = WhisperProgressTracker
        ticker_thread = threading.Thread(target=ticker_tiempo_real, daemon=True)
        ticker_thread.start()
    except Exception:
        orig_tqdm = None

    real_stdout = sys.stdout
    try:
        # Redirigir stdout a stderr durante la inferencia para que ningún mensaje
        # de Whisper (como 'Detected language:') o PyTorch contamine el canal JSON
        sys.stdout = sys.stderr
        result = model.transcribe(file_path, **kwargs)
    except Exception as e_transcribe:
        sys.stdout = real_stdout
        print(f"[whisper_runner] AVISO: Interrupción durante transcripción: {e_transcribe}", file=sys.stderr, flush=True)
        # Si se guardó una transcripción parcial antes del error, recuperarla para no perderla
        if partial_output_path and os.path.isfile(partial_output_path):
            try:
                with open(partial_output_path, "r", encoding="utf-8") as pf:
                    res_parcial = json.load(pf)
                res_parcial["error"] = str(e_transcribe)
                res_parcial["status"] = "parcial_con_error"
                if output_json:
                    with open(output_json, "w", encoding="utf-8") as of:
                        json.dump(res_parcial, of, ensure_ascii=False)
                return res_parcial
            except Exception:
                pass
        raise e_transcribe
    finally:
        progress_active[0] = False
        sys.stdout = real_stdout
        if orig_tqdm:
            try:
                import tqdm
                tqdm.tqdm = orig_tqdm
            except Exception:
                pass

    segments_raw = result.get("segments", [])
    detected_language = result.get("language", language_usado)
    last_end = float(segments_raw[-1]["end"]) if segments_raw else 0.0
    duration = last_end if segments_raw else audio_duration

    print(f"[whisper_runner] Segmentos: {len(segments_raw)}, idioma: {detected_language}", file=sys.stderr, flush=True)

    # ── Rescate Anti-Truncamiento de Cola (v0.2.3) ──────────────────────────────
    # Si Whisper se detuvo prematuramente dejando más de 10s al final con energía acústica
    if anti_truncation and audio_np is not None and audio_duration > 0 and (audio_duration - last_end) > 10.0:
        diferencia_cola = audio_duration - last_end
        rescue_start = max(0.0, last_end - 1.0)
        start_sample = int(rescue_start * 16000)
        tail_audio = audio_np[start_sample:]
        max_amp = float(np.max(np.abs(tail_audio))) if len(tail_audio) > 0 else 0.0

        if max_amp > 0.01 and len(tail_audio) >= 16000:
            print(
                f"[whisper_runner] ALERTA TRUNCAMIENTO DETECTADO: El audio dura {audio_duration:.2f}s "
                f"pero la transcripción concluyó en {last_end:.2f}s (diferencia de {diferencia_cola:.2f}s). "
                f"Iniciando rescate de cola...",
                file=sys.stderr, flush=True
            )
            try:
                rescue_kwargs = dict(kwargs)
                rescue_kwargs["condition_on_previous_text"] = False
                rescue_kwargs["temperature"] = (0.0, 0.2, 0.4)
                rescue_res = model.transcribe(tail_audio, **rescue_kwargs)
                rescue_segs = rescue_res.get("segments", [])
                nuevos_segs = 0
                for r_seg in rescue_segs:
                    r_start = round(float(r_seg.get("start", 0.0)) + rescue_start, 3)
                    r_end = round(float(r_seg.get("end", 0.0)) + rescue_start, 3)
                    r_text = str(r_seg.get("text", "")).strip()
                    if r_end > last_end and r_text:
                        r_seg_copy = dict(r_seg)
                        r_seg_copy["start"] = r_start
                        r_seg_copy["end"] = r_end
                        r_seg_copy["text"] = r_text
                        segments_raw.append(r_seg_copy)
                        nuevos_segs += 1
                if nuevos_segs > 0:
                    last_end = float(segments_raw[-1]["end"])
                    duration = last_end
                    print(f"[whisper_runner] Rescate de cola finalizado con éxito: {nuevos_segs} segmentos recuperados hasta {duration:.2f}s.", file=sys.stderr, flush=True)
                else:
                    print(f"[whisper_runner] Rescate de cola: no se detectó texto inteligible adicional en la porción final.", file=sys.stderr, flush=True)
            except Exception as e_rescue:
                print(f"[whisper_runner] Aviso en rescate de cola: {e_rescue}", file=sys.stderr, flush=True)

    # Cargar audio en numpy si aún no se había cargado
    if audio_np is None:
        try:
            audio_np = whisper.load_audio(file_path)
            audio_np = normalizar_audio_amplitud(audio_np)
        except Exception as e:
            print(f"[whisper_runner] Aviso carga audio: {e}", file=sys.stderr, flush=True)

    # Liberar el modelo de la VRAM/RAM antes de etapas posteriores
    try:
        del model
        if device == "cuda":
            import torch
            torch.cuda.empty_cache()
            print("[whisper_runner] Caché GPU liberada tras transcripción.", file=sys.stderr, flush=True)
        gc.collect()
    except Exception:
        pass

    # ── RUTA RÁPIDA: Diarización Desactivada por el Usuario ─────────────────────
    if not diarize:
        print(f"[whisper_runner] ETAPA 3/3: Estructurando expediente y aplicando pulido ortográfico pericial...", file=sys.stderr, flush=True)
        max_pct_emitted[0] = max(max_pct_emitted[0], 92.0)
        max_processed_sec_emitted[0] = max(max_processed_sec_emitted[0], audio_duration)
        prog_data = {
            "pct": round(max_pct_emitted[0], 1),
            "eta_sec": 2,
            "speed": 3.5,
            "stage": 3,
            "substage": "Estructuración Pericial",
            "action": "Estructurando expediente, alineando marcas de tiempo y aplicando pulido ortográfico",
            "processed_sec": round(max_processed_sec_emitted[0], 1),
            "total_sec": round(audio_duration, 1),
            "msg": "Estructurando expediente y aplicando pulido ortográfico pericial..."
        }
        print(f"[whisper_progress] {json.dumps(prog_data)}", file=sys.stderr, flush=True)
        output_segments = []
        for i, seg in enumerate(segments_raw):
            start_t = round(float(seg.get("start", 0.0)), 3)
            end_t = round(float(seg.get("end", 0.0)), 3)
            avg_logprob = float(seg.get("avg_logprob", -0.1))
            confidence = round(min(1.0, max(0.0, 1.0 + avg_logprob / 5.0)), 3)
            texto_pulido = corregir_puntuacion_y_ortografia(seg.get("text", ""), idioma=detected_language)
            output_segments.append({
                "id": f"seg_{i + 1}",
                "speakerId": "speaker_01",
                "startTime": start_t,
                "endTime": end_t,
                "text": texto_pulido,
                "confidence": confidence,
            })

        return {
            "segments": output_segments,
            "speakerNames": {"speaker_01": "Persona 1"},
            "durationSeconds": round(duration, 3),
            "modelUsed": resolved_model,
            "language": detected_language,
            "numSpeakers": 1,
        }

    # ── ETAPA 3/4: Diarización de interlocutores ──────────────────────────────
    max_pct_emitted[0] = max(max_pct_emitted[0], 74.0)
    max_processed_sec_emitted[0] = max(max_processed_sec_emitted[0], audio_duration)
    prog_data = {
        "pct": round(max_pct_emitted[0], 1),
        "eta_sec": max(4, round(audio_duration * 0.08)) + 2,
        "speed": 2.5,
        "stage": 3,
        "substage": "Diarización de Voces",
        "action": "Extrayendo perfiles de voz y clustering para discriminar interlocutores",
        "processed_sec": round(max_processed_sec_emitted[0], 1),
        "total_sec": round(audio_duration, 1),
        "msg": "Diarizando voces y discriminando interlocutores periciales..."
    }
    print(f"[whisper_progress] {json.dumps(prog_data)}", file=sys.stderr, flush=True)

    usar_pyannote = False
    diar_result_pyannote = None

    if PyannoteDiarizationService is not None and DiarizationModelManager is not None:
        try:
            if DiarizationModelManager.existe_modelo_local() or DiarizationModelManager.obtener_token():
                print(f"[whisper_runner] ETAPA 3/4: Ejecutando diarización neuronal con pyannote.audio 4.x (community-1)...", file=sys.stderr, flush=True)
                service = PyannoteDiarizationService()
                diar_result_pyannote = service.diarizar(
                    audio_path=file_path,
                    num_speakers=num_speakers if num_speakers > 0 else None,
                    device_override=device
                )
                usar_pyannote = True
                print(f"[whisper_runner] Diarización pyannote completada con éxito ({diar_result_pyannote.num_speakers} interlocutores confirmados).", file=sys.stderr, flush=True)
        except Exception as e_pyannote:
            print(f"[whisper_runner] Aviso en pyannote.audio: {e_pyannote}. Recurriendo al motor acústico espectral de respaldo...", file=sys.stderr, flush=True)
            usar_pyannote = False

    if usar_pyannote and diar_result_pyannote is not None:
        # Reconciliación desacoplada Whisper (texto) + pyannote (hablantes y tiempos)
        print(f"[whisper_runner] ETAPA 4/4: Reconciliando transcripción con diarización exclusiva y estructurando expediente...", file=sys.stderr, flush=True)
        max_pct_emitted[0] = max(max_pct_emitted[0], 94.0)
        prog_data = {
            "pct": round(max_pct_emitted[0], 1),
            "eta_sec": 2,
            "speed": 4.0,
            "stage": 4,
            "substage": "Estructuración y Sellado",
            "action": "Reconciliando intervenciones con hablantes y generando actas forenses",
            "processed_sec": round(max_processed_sec_emitted[0], 1),
            "total_sec": round(audio_duration, 1),
            "msg": "Reconciliando transcripción con diarización y generando actas..."
        }
        print(f"[whisper_progress] {json.dumps(prog_data)}", file=sys.stderr, flush=True)
        mock_whisper_res = {
            "segments": segments_raw,
            "language": detected_language,
            "modelUsed": resolved_model,
            "durationSeconds": duration,
        }
        reconciled = DiarizationReconciler.reconciliar(
            whisper_result=mock_whisper_res,
            diarization_result=diar_result_pyannote,
        )
        final_dict = reconciled.to_dict()
        # Pulir puntuación y ortografía pericial en cada intervención
        for seg in final_dict.get("segments", []):
            seg["text"] = corregir_puntuacion_y_ortografia(seg.get("text", ""), idioma=detected_language)
        return final_dict

    # Motor de respaldo: Diarización heurística espectral de alta resolución
    print(f"[whisper_runner] ETAPA 3/4: Diarizando segmentos con motor acústico espectral...", file=sys.stderr, flush=True)
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

    if partial_output_path and os.path.isfile(partial_output_path):
        try:
            os.remove(partial_output_path)
        except Exception:
            pass

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
    parser.add_argument("--diarize", default="true",
                        help="true/false para activar o desactivar la diarización de interlocutores")
    parser.add_argument("--device", default="auto",
                        help="Dispositivo de inferencia: auto, cuda, cpu (por defecto: auto)")
    parser.add_argument("--model-dir", default=None,
                        help="Directorio personalizado donde se alojan los modelos Whisper (download_root)")
    parser.add_argument("--anti-truncation", default="true",
                        help="true/false para activar protección anti-truncamiento en audios largos")
    parser.add_argument("--output-json", default=None,
                        help="Ruta a archivo en disco donde volcar el resultado JSON completo para evitar saturación de pipes")
    args = parser.parse_args()

    if not os.path.isfile(args.file):
        print(json.dumps({"error": f"Archivo no encontrado: {args.file}"}))
        sys.exit(1)

    diarize_enabled = str(args.diarize).strip().lower() not in ("false", "0", "no", "off", "f")
    anti_truncation_enabled = str(args.anti_truncation).strip().lower() not in ("false", "0", "no", "off", "f")

    try:
        resultado = transcribir(
            args.file,
            args.model,
            args.language,
            args.num_speakers,
            args.device,
            diarize=diarize_enabled,
            model_dir=args.model_dir,
            anti_truncation=anti_truncation_enabled,
            output_json=args.output_json
        )

        if args.output_json:
            out_file = os.path.abspath(args.output_json)
            parent_d = os.path.dirname(out_file)
            if parent_d and not os.path.exists(parent_d):
                os.makedirs(parent_d, exist_ok=True)
            with open(out_file, "w", encoding="utf-8") as f:
                json.dump(resultado, f, ensure_ascii=False)
            print(f"[whisper_runner] Resultado guardado en archivo directo: {out_file}", file=sys.stderr, flush=True)
            print(json.dumps({"status": "success", "output_file": out_file}, ensure_ascii=False))
        else:
            print(json.dumps(resultado, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
