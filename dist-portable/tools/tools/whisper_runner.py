#!/usr/bin/env python3
"""
whisper_runner.py — Motor de Transcripcion Real con OpenAI Whisper

Responsabilidad unica (SRP):
  Recibe un archivo de audio/video, lo transcribe con Whisper y emite
  un JSON estructurado por stdout con segmentos, hablantes y metadatos.

Diarizacion:
  Usa los segmentos nativos de Whisper (con timestamps precisos) y aplica
  deteccion de cambio de hablante basada en:
    1. Pausa entre segmentos (silencio > SILENCE_THRESHOLD_S)
    2. Diferencia de energia RMS entre segmentos consecutivos
  Si no hay evidencia de cambio, todo el audio se asigna a speaker_01.

Uso:
  python whisper_runner.py --file "audio.mp3" --model small --language es
  python whisper_runner.py --file "audio.mp3" --model small --language auto --num-speakers 1
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
# Motor de Diarización Acústica y Diferenciación de Voces
# ---------------------------------------------------------------------------

def extraer_vector_acustico(audio_chunk: np.ndarray, sample_rate: int = 16000) -> np.ndarray:
    """Extrae características tímbricas y acústicas (MFCC, Pitch F0 y Centroide) de un segmento."""
    if len(audio_chunk) < 320:
        return np.zeros(42, dtype=np.float32)

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
        # Fallback FFT si torchaudio tiene alguna advertencia
        fft_vals = np.abs(np.fft.rfft(audio_chunk[:1600]))
        if len(fft_vals) >= 20:
            mfcc_mean = fft_vals[:20]
        else:
            mfcc_mean = np.pad(fft_vals, (0, 20 - len(fft_vals)))

    # 2. Estimación de tono fundamental (Pitch F0) por autocorrelación (rango humano: 70 - 450 Hz)
    pitch_val = 130.0
    min_lag = int(sample_rate / 450)
    max_lag = int(sample_rate / 70)
    try:
        corr = np.correlate(audio_chunk, audio_chunk, mode='full')
        corr = corr[len(corr)//2:]
        if len(corr) > max_lag:
            window_corr = corr[min_lag:max_lag]
            if len(window_corr) > 0 and np.max(window_corr) > 0:
                best_lag = min_lag + np.argmax(window_corr)
                pitch_val = float(sample_rate / best_lag)
    except Exception:
        pass

    # 3. Centroide Espectral (brillo tímbrico de la voz del interlocutor)
    spectral_centroid = 1500.0
    try:
        freqs = np.fft.rfftfreq(len(audio_chunk), 1.0 / sample_rate)
        magnitudes = np.abs(np.fft.rfft(audio_chunk))
        sum_mag = np.sum(magnitudes)
        if sum_mag > 1e-6:
            spectral_centroid = float(np.sum(freqs * magnitudes) / sum_mag)
    except Exception:
        pass

    # Normalización básica de escala
    vector = np.concatenate([
        mfcc_mean,
        mfcc_std,
        np.array([pitch_val / 500.0, spectral_centroid / 5000.0], dtype=np.float32)
    ])
    return vector


def diarizar_segmentos(segmentos_whisper: list, audio_np: np.ndarray = None,
                       sample_rate: int = 16000, num_speakers_forzado: int = 0) -> list:
    """
    Identifica y diferencia a los interlocutores mediante clustering espectral de huellas de voz.
    """
    if not segmentos_whisper:
        return []

    if num_speakers_forzado == 1 or audio_np is None or len(audio_np) == 0:
        return [{**seg, "speakerId": "speaker_01"} for seg in segmentos_whisper]

    if len(segmentos_whisper) == 1:
        return [{**segmentos_whisper[0], "speakerId": "speaker_01"}]

    # 1. Extraer vector de huella vocal para cada segmento
    vectores = []
    for seg in segmentos_whisper:
        start_idx = max(0, int(seg["start"] * sample_rate))
        end_idx = min(len(audio_np), int(seg["end"] * sample_rate))
        if end_idx - start_idx < 320:
            chunk = np.zeros(400, dtype=np.float32)
        else:
            chunk = audio_np[start_idx:end_idx]
        vec = extraer_vector_acustico(chunk, sample_rate)
        vectores.append(vec)

    X = np.array(vectores, dtype=np.float32)

    # 2. Estandarización de características
    stds = np.std(X, axis=0)
    stds[stds == 0] = 1.0
    X_norm = (X - np.mean(X, axis=0)) / stds

    raw_labels = np.ones(len(segmentos_whisper), dtype=int)

    try:
        import scipy.cluster.hierarchy as sch
        import scipy.spatial.distance as ssd

        p_dist = ssd.pdist(X_norm, metric='cosine')
        p_dist = np.nan_to_num(p_dist, nan=0.0)

        if len(p_dist) > 0 and np.max(p_dist) > 0.05:
            Z = sch.linkage(p_dist, method='average')

            if num_speakers_forzado >= 2:
                k = min(num_speakers_forzado, len(segmentos_whisper))
                raw_labels = sch.fcluster(Z, t=k, criterion='maxclust')
            else:
                # Detección bimodal automática de interlocutores
                max_d = float(np.max(p_dist))
                # Si existe separación acústica suficiente entre turnos, separamos en 2 interlocutores
                if max_d > 0.15:
                    raw_labels = sch.fcluster(Z, t=2, criterion='maxclust')
                else:
                    raw_labels = np.ones(len(segmentos_whisper), dtype=int)
    except Exception as err:
        print(f"[whisper_runner] Aviso clustering jerárquico: {err}", file=sys.stderr)
        raw_labels = np.ones(len(segmentos_whisper), dtype=int)

    # 3. Mapeo cronológico (el primer hablante en intervenir siempre es speaker_01, el segundo speaker_02, etc.)
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

        frame_len = int(sample_rate * 0.025) # 25ms
        hop_len = int(sample_rate * 0.010)   # 10ms

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


def transcribir(file_path: str, model_name: str, language: str, num_speakers: int) -> dict:
    """Carga Whisper, transcribe y aplica diarizacion. Retorna dict ResultadoWhisper."""
    import whisper

    model_alias = {"turbo": "large-v3-turbo"}
    resolved_model = model_alias.get(model_name, model_name)

    print(f"[whisper_runner] Cargando modelo: {resolved_model}", file=sys.stderr)
    model = whisper.load_model(resolved_model)

    kwargs = {"word_timestamps": True, "verbose": None}
    if language and language.lower() not in ("auto", ""):
        kwargs["language"] = language

    print(f"[whisper_runner] Transcribiendo: {os.path.basename(file_path)}", file=sys.stderr)
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

    print(f"[whisper_runner] Segmentos: {len(segments_raw)}, idioma: {detected_language}", file=sys.stderr)

    audio_np = None
    try:
        audio_np = whisper.load_audio(file_path)
    except Exception as e:
        print(f"[whisper_runner] Aviso carga audio: {e}", file=sys.stderr)

    diarized = diarizar_segmentos(segments_raw, audio_np=audio_np,
                                  sample_rate=16000, num_speakers_forzado=num_speakers)

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
        output_segments.append({
            "id": f"seg_{i + 1}",
            "speakerId": seg["speakerId"],
            "startTime": start_ajustado,
            "endTime": end_ajustado,
            "text": seg["text"].strip(),
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
    args = parser.parse_args()

    if not os.path.isfile(args.file):
        print(json.dumps({"error": f"Archivo no encontrado: {args.file}"}))
        sys.exit(1)

    try:
        resultado = transcribir(args.file, args.model, args.language, args.num_speakers)
        print(json.dumps(resultado, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
