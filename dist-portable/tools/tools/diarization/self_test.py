"""
Self-Test Automatizado y CLI de Diagnóstico de Diarización para Sephent Transcriptor.
"""

import os
import sys
import argparse
import tempfile
import numpy as np
from typing import Dict, Any

# Permitir ejecución como script directo o como submódulo
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from diarization.diagnostics import EnvironmentDiagnostics
from diarization.data_models import DiarizationResult, DiarizationSegment, SpeakerEmbedding, OverlapSegment
from diarization.reconciler import DiarizationReconciler
from diarization.model_manager import DiarizationModelManager
from diarization.audio_validator import AudioValidator


def crear_audio_sintetico_prueba(duracion_s: float = 4.0, sample_rate: int = 16000) -> str:
    """Genera un archivo WAV temporal con dos tonos alternados para probar el flujo de audio."""
    import wave
    import struct

    t = np.linspace(0, duracion_s, int(sample_rate * duracion_s), endpoint=False)
    # Tono 1 (220 Hz) durante primeros 2 segundos, Tono 2 (440 Hz) durante últimos 2 segundos
    audio_data = np.zeros_like(t)
    mitad = len(t) // 2
    audio_data[:mitad] = 0.5 * np.sin(2 * np.pi * 220 * t[:mitad])
    audio_data[mitad:] = 0.5 * np.sin(2 * np.pi * 440 * t[mitad:])

    temp_wav = os.path.join(tempfile.gettempdir(), "sephent_selftest_audio.wav")
    with wave.open(temp_wav, "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        for sample in audio_data:
            wf.writeframes(struct.pack("<h", int(sample * 32767)))

    return temp_wav


def run_diarization_self_test(audio_personalizado: str = None) -> Dict[str, Any]:
    """
    Ejecuta una batería completa de pruebas unitarias y funcionales del subsistema de diarización.
    """
    resultados: Dict[str, Any] = {
        "status": "PASSED",
        "tests": {},
        "diagnostics": None,
        "reconciliation_test": "SKIPPED",
        "diarization_pipeline_test": "SKIPPED",
        "errors": [],
    }

    print("==================================================")
    print("SEPHENT TRANSCRIPTOR — SELF TEST DE DIARIZACIÓN")
    print("==================================================")

    # 1. Diagnóstico del Entorno
    diag = EnvironmentDiagnostics.diagnosticar()
    resultados["diagnostics"] = diag.to_dict()
    print(diag.resumen_texto)

    # 2. Prueba de Reconciliador con datos sintéticos
    try:
        mock_whisper = {
            "modelUsed": "medium",
            "language": "es",
            "durationSeconds": 6.0,
            "segments": [
                {
                    "start": 0.0,
                    "end": 3.0,
                    "text": "Hola, buenos días.",
                    "words": [
                        {"word": "Hola,", "start": 0.2, "end": 0.8, "probability": 0.95},
                        {"word": "buenos", "start": 0.9, "end": 1.4, "probability": 0.98},
                        {"word": "días.", "start": 1.5, "end": 2.2, "probability": 0.96},
                    ],
                },
                {
                    "start": 3.2,
                    "end": 6.0,
                    "text": "Buenos días, ¿en qué puedo ayudarle?",
                    "words": [
                        {"word": "Buenos", "start": 3.3, "end": 3.8, "probability": 0.97},
                        {"word": "días,", "start": 3.9, "end": 4.3, "probability": 0.99},
                        {"word": "¿en", "start": 4.4, "end": 4.7, "probability": 0.94},
                        {"word": "qué", "start": 4.8, "end": 5.1, "probability": 0.98},
                        {"word": "puedo", "start": 5.2, "end": 5.5, "probability": 0.96},
                        {"word": "ayudarle?", "start": 5.6, "end": 6.0, "probability": 0.97},
                    ],
                },
            ],
        }

        mock_diarization = DiarizationResult(
            segments=[
                DiarizationSegment(start_time=0.0, end_time=2.8, speaker_id="SPEAKER_00"),
                DiarizationSegment(start_time=3.0, end_time=6.0, speaker_id="SPEAKER_01"),
            ],
            exclusive_segments=[
                DiarizationSegment(start_time=0.0, end_time=2.8, speaker_id="SPEAKER_00"),
                DiarizationSegment(start_time=3.0, end_time=6.0, speaker_id="SPEAKER_01"),
            ],
            overlap_segments=[],
            speaker_embeddings={
                "SPEAKER_00": SpeakerEmbedding(speaker_id="SPEAKER_00", dimension=256, vector=[0.1] * 256),
                "SPEAKER_01": SpeakerEmbedding(speaker_id="SPEAKER_01", dimension=256, vector=[0.2] * 256),
            },
            speaker_ids=["SPEAKER_00", "SPEAKER_01"],
            num_speakers=2,
            duration_seconds=6.0,
        )

        reconciled = DiarizationReconciler.reconciliar(
            mock_whisper,
            mock_diarization,
            user_speaker_names={"SPEAKER_00": "Perito", "SPEAKER_01": "Declarante"},
        )

        assert len(reconciled.utterances) == 2, f"Esperadas 2 intervenciones, obtenidas {len(reconciled.utterances)}"
        assert reconciled.utterances[0].speaker_name == "Perito", "El nombre de SPEAKER_00 no coincide"
        assert reconciled.utterances[1].speaker_name == "Declarante", "El nombre de SPEAKER_01 no coincide"
        assert len(reconciled.utterances[0].words) == 3, "Palabras del segmento 1 incompletas"

        resultados["tests"]["reconciler_unit_test"] = "PASSED"
        resultados["reconciliation_test"] = "PASSED"
        print("\nPrueba de Reconciliador Whisper + Diarización: OK (2 intervenciones, mapeo y palabras validadas)")
    except Exception as e:
        resultados["tests"]["reconciler_unit_test"] = f"FAILED: {e}"
        resultados["status"] = "FAILED"
        resultados["errors"].append(str(e))
        print(f"\nPrueba de Reconciliador: FALLÓ ({e})")

    # 3. Prueba de Validador de Audio
    try:
        temp_wav = crear_audio_sintetico_prueba(duracion_s=2.0)
        val_res = AudioValidator.validar(temp_wav)
        assert val_res.is_valid, f"Validador falló en WAV sintetizado: {val_res.error_message}"
        assert val_res.duration_seconds >= 1.8, "Duración no coincide en validación"
        resultados["tests"]["audio_validator_test"] = "PASSED"
        print("Prueba de Validación e Inspección de Audio: OK")
        try:
            os.remove(temp_wav)
        except Exception:
            pass
    except Exception as e:
        resultados["tests"]["audio_validator_test"] = f"FAILED: {e}"
        resultados["status"] = "FAILED"
        resultados["errors"].append(str(e))
        print(f"Prueba de Validación de Audio: FALLÓ ({e})")

    # 4. Prueba del Pipeline Real de pyannote (si el modelo está disponible)
    if diag.listo_para_diarizar_pyannote or audio_personalizado:
        audio_a_probar = audio_personalizado or crear_audio_sintetico_prueba(duracion_s=3.0)
        try:
            print("\nEjecutando prueba del pipeline pyannote con modelo community-1...")
            from diarization.diarization_service import PyannoteDiarizationService

            service = PyannoteDiarizationService()
            res_diar = service.diarizar(audio_a_probar)

            print(f"Diarización completada:")
            print(f"  - Hablantes detectados: {res_diar.num_speakers}")
            print(f"  - Segmentos normales:   {len(res_diar.segments)}")
            print(f"  - Segmentos exclusivos: {len(res_diar.exclusive_segments)}")
            print(f"  - Embeddings obtenidos: {len(res_diar.speaker_embeddings)}")
            print(f"  - Intervalos solapados: {len(res_diar.overlap_segments)}")

            resultados["tests"]["pyannote_pipeline_test"] = "PASSED"
            resultados["diarization_pipeline_test"] = "PASSED"
            if not audio_personalizado:
                try:
                    os.remove(audio_a_probar)
                except Exception:
                    pass
        except Exception as e:
            resultados["tests"]["pyannote_pipeline_test"] = f"FAILED: {e}"
            print(f"Aviso en prueba de pipeline pyannote: {e}")
            if not audio_personalizado:
                try:
                    os.remove(audio_a_probar)
                except Exception:
                    pass
    else:
        print("\nPrueba de pipeline pyannote omitida (modelo community-1 no descargado aún).")
        resultados["diarization_pipeline_test"] = "SKIPPED_NO_MODEL"

    print("\n--------------------------------------------------")
    print(f"RESULTADO GLOBAL DEL SELF-TEST: {resultados['status']}")
    print("==================================================")
    return resultados


def main():
    parser = argparse.ArgumentParser(description="Self-test y diagnóstico del subsistema de diarización de Sephent Transcriptor.")
    parser.add_argument("--diagnostics-only", action="store_true", help="Solo muestra la tabla de diagnóstico de dependencias.")
    parser.add_argument("--audio", type=str, default=None, help="Ruta a un archivo de audio para prueba funcional de diarización.")
    parser.add_argument("--json", action="store_true", help="Emite los resultados en formato JSON.")
    args = parser.parse_args()

    if args.diagnostics_only:
        diag = EnvironmentDiagnostics.diagnosticar()
        if args.json:
            import json
            print(json.dumps(diag.to_dict(), indent=2))
        else:
            print(diag.resumen_texto)
        sys.exit(0)

    res = run_diarization_self_test(audio_personalizado=args.audio)
    if args.json:
        import json
        print(json.dumps(res, indent=2))
    sys.exit(0 if res["status"] == "PASSED" else 1)


if __name__ == "__main__":
    main()
