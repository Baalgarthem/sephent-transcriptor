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

# ---------------------------------------------------------------------------
# Umbrales de diarizacion por energia (ajustables sin tocar logica)
# ---------------------------------------------------------------------------
SILENCE_THRESHOLD_S = 1.2    # Pausa minima (s) para considerar cambio de hablante
ENERGY_CHANGE_RATIO = 2.0    # Ratio RMS para detectar otro hablante
MIN_SPEAKER_SEGMENTS = 3     # Minimo de segmentos para confirmar un segundo hablante


def calcular_rms_segmento(audio_data: list, sample_rate: int, start_s: float, end_s: float) -> float:
    """Calcula la energia RMS media de un intervalo de audio."""
    start_idx = max(0, int(start_s * sample_rate))
    end_idx = min(len(audio_data), int(end_s * sample_rate))
    if end_idx <= start_idx:
        return 0.0
    ventana = audio_data[start_idx:end_idx]
    rms = math.sqrt(sum(x * x for x in ventana) / len(ventana))
    return rms


def diarizar_segmentos(segmentos_whisper: list, audio_data=None,
                       sample_rate: int = 16000, num_speakers_forzado: int = 0) -> list:
    """
    Asigna speakerId a cada segmento de Whisper.

    - num_speakers_forzado == 1 -> todos speaker_01 (monologo)
    - num_speakers_forzado == 0 -> deteccion automatica por pausa + RMS
    """
    if not segmentos_whisper:
        return []

    if num_speakers_forzado == 1:
        return [{**seg, "speakerId": "speaker_01"} for seg in segmentos_whisper]

    energias = []
    if audio_data and len(audio_data) > 0:
        for seg in segmentos_whisper:
            e = calcular_rms_segmento(audio_data, sample_rate, seg["start"], seg["end"])
            energias.append(e)
    else:
        energias = [1.0] * len(segmentos_whisper)

    resultado = []
    hablante_actual = 1
    seg_anterior = None

    for i, seg in enumerate(segmentos_whisper):
        cambio = False

        if seg_anterior is not None:
            pausa = seg["start"] - seg_anterior["end"]
            if pausa >= SILENCE_THRESHOLD_S:
                e_prev = energias[i - 1]
                e_curr = energias[i]
                if e_prev > 1e-6 and e_curr > 1e-6:
                    ratio = max(e_prev, e_curr) / min(e_prev, e_curr)
                    if ratio >= ENERGY_CHANGE_RATIO:
                        cambio = True
                elif pausa >= SILENCE_THRESHOLD_S * 2.0:
                    cambio = True

        if cambio:
            hablante_actual = 2 if hablante_actual == 1 else 1

        resultado.append({**seg, "speakerId": f"speaker_0{hablante_actual}"})
        seg_anterior = seg

    # Colapsar hablante minoritario si tiene menos de MIN_SPEAKER_SEGMENTS
    conteo = {}
    for s in resultado:
        conteo[s["speakerId"]] = conteo.get(s["speakerId"], 0) + 1
    for spk_id, count in conteo.items():
        if count < MIN_SPEAKER_SEGMENTS and spk_id != "speaker_01":
            resultado = [
                {**s, "speakerId": "speaker_01"} if s["speakerId"] == spk_id else s
                for s in resultado
            ]

    return resultado


def transcribir(file_path: str, model_name: str, language: str, num_speakers: int) -> dict:
    """Carga Whisper, transcribe y aplica diarizacion. Retorna dict ResultadoWhisper."""
    import whisper

    model_alias = {"turbo": "large-v3-turbo"}
    resolved_model = model_alias.get(model_name, model_name)

    print(f"[whisper_runner] Cargando modelo: {resolved_model}", file=sys.stderr)
    model = whisper.load_model(resolved_model)

    kwargs = {"word_timestamps": False, "verbose": False}
    if language and language.lower() not in ("auto", ""):
        kwargs["language"] = language

    print(f"[whisper_runner] Transcribiendo: {os.path.basename(file_path)}", file=sys.stderr)
    result = model.transcribe(file_path, **kwargs)

    segments_raw = result.get("segments", [])
    detected_language = result.get("language", language)
    duration = segments_raw[-1]["end"] if segments_raw else 0.0

    print(f"[whisper_runner] Segmentos: {len(segments_raw)}, idioma: {detected_language}", file=sys.stderr)

    audio_data = None
    try:
        audio_np = whisper.load_audio(file_path)
        audio_data = audio_np.tolist()
    except Exception as e:
        print(f"[whisper_runner] Aviso RMS: {e}", file=sys.stderr)

    diarized = diarizar_segmentos(segments_raw, audio_data=audio_data,
                                  sample_rate=16000, num_speakers_forzado=num_speakers)

    output_segments = []
    for i, seg in enumerate(diarized):
        avg_logprob = seg.get("avg_logprob", -0.1)
        confidence = round(min(1.0, max(0.0, 1.0 + avg_logprob / 5.0)), 3)
        output_segments.append({
            "id": f"seg_{i + 1}",
            "speakerId": seg["speakerId"],
            "startTime": round(seg["start"], 3),
            "endTime": round(seg["end"], 3),
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
    # Validación de compatibilidad de Python para Whisper y dependencias (torch, numba, numpy, tiktoken)
    py_major, py_minor = sys.version_info.major, sys.version_info.minor
    if py_major != 3 or py_minor < 8 or py_minor > 13:
        py_ver = sys.version.split()[0]
        print(json.dumps({
            "error": (
                f"Versión de Python ({py_ver}) incompatible con OpenAI Whisper. Las dependencias críticas "
                f"(PyTorch, Numba, NumPy, TikToken) requieren Python entre 3.8 y 3.13. "
                f"Se recomienda preferentemente Python 3.11 o Python 3.12."
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
