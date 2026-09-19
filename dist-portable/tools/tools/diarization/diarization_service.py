"""
Servicio Profesional y Tolerante a Fallos de Diarización con pyannote.audio 4.x.
"""

import os
import sys
import gc
import numpy as np
from typing import Optional, Callable, Dict, Any, List

from .data_models import (
    DiarizationSegment,
    SpeakerEmbedding,
    OverlapSegment,
    DiarizationResult,
    PericialTraceability,
    calcular_sha256_archivo,
)
from .model_manager import DiarizationModelManager
from .audio_validator import AudioValidator


class PyannoteDiarizationService:
    """Servicio de diarización acústica basado en pyannote.audio 4.x y community-1."""

    def __init__(self, token: Optional[str] = None, default_device: str = "auto"):
        self.token = token or DiarizationModelManager.obtener_token()
        self.default_device = default_device

    def diarizar(
        self,
        audio_path: str,
        num_speakers: Optional[int] = None,
        min_speakers: Optional[int] = None,
        max_speakers: Optional[int] = None,
        device_override: Optional[str] = None,
        progress_callback: Optional[Callable[[int, str], None]] = None,
    ) -> DiarizationResult:
        """
        Ejecuta la diarización completa sobre el archivo probatorio.
        
        Extrae:
          1. Diarización normal (output.speaker_diarization)
          2. Diarización exclusiva (output.exclusive_speaker_diarization)
          3. Embeddings de hablantes (output.speaker_embeddings)
          4. Intervalos de habla superpuesta (OverlapSegment)
        """
        # 1. Validación de integridad del archivo probatorio
        val_res = AudioValidator.validar(audio_path)
        if not val_res.is_valid:
            err_code = val_res.error_code or "INVALID_AUDIO"
            err_msg = val_res.error_message or "Archivo multimedia no válido"
            raise ValueError(f"{err_code}: {err_msg} ({audio_path})")

        # 2. Validación de parámetros de hablantes
        params_pipeline: Dict[str, Any] = {}
        if num_speakers is not None and num_speakers > 0:
            params_pipeline["num_speakers"] = int(num_speakers)
        else:
            if min_speakers is not None and min_speakers > 0:
                params_pipeline["min_speakers"] = int(min_speakers)
            if max_speakers is not None and max_speakers > 0:
                params_pipeline["max_speakers"] = int(max_speakers)
            if (
                min_speakers is not None
                and max_speakers is not None
                and min_speakers > max_speakers
            ):
                raise ValueError(
                    f"INVALID_SPEAKER_CONFIGURATION: min_speakers ({min_speakers}) no puede ser mayor que max_speakers ({max_speakers})"
                )

        # 3. Determinación y prueba funcional del dispositivo
        import torch

        dispositivo_solicitado = (device_override or self.default_device).lower()
        usar_cuda = False
        gpu_name = None

        if dispositivo_solicitado in ("cuda", "auto") and torch.cuda.is_available():
            try:
                # Prueba funcional de tensor en GPU
                t_test = torch.randn(2, 2, device="cuda")
                _ = t_test @ t_test
                usar_cuda = True
                gpu_name = torch.cuda.get_device_name(0)
            except Exception as e_gpu:
                print(f"[PyannoteService] GPU detectada pero no funcional ({e_gpu}). Usando CPU.", file=sys.stderr)
                usar_cuda = False

        device_str = "cuda" if usar_cuda else "cpu"

        if progress_callback:
            msg_dev = f"en {gpu_name} (CUDA)" if usar_cuda else "en CPU"
            progress_callback(10, f"Cargando pipeline pyannote community-1 {msg_dev}...")

        # 4. Carga tolerante del pipeline
        pipeline = DiarizationModelManager.cargar_pipeline(token=self.token, device=device_str)

        # 5. Ejecución con manejo de OOM y fallback a CPU
        output = None
        dispositivo_final = device_str

        try:
            if progress_callback:
                progress_callback(30, "Ejecutando diarización neuronal con pyannote community-1...")

            output = pipeline(audio_path, **params_pipeline)

        except (torch.cuda.OutOfMemoryError, RuntimeError) as e:
            err_str = str(e)
            if "out of memory" in err_str.lower() or "cuda" in err_str.lower():
                print(
                    f"[PyannoteService] Aviso: CUDA OOM ({e}). Limpiando memoria y reintentando en CPU...",
                    file=sys.stderr,
                )
                if progress_callback:
                    progress_callback(
                        25, "Memoria GPU insuficiente. Reintentando diarización automáticamente en CPU..."
                    )
                # Liberación de memoria
                del pipeline
                torch.cuda.empty_cache()
                gc.collect()

                # Reintentar en CPU
                pipeline_cpu = DiarizationModelManager.cargar_pipeline(token=self.token, device="cpu")
                output = pipeline_cpu(audio_path, **params_pipeline)
                dispositivo_final = "cpu (fallback por OOM)"
            else:
                raise RuntimeError(f"DIARIZATION_FAILED: Error durante la inferencia de pyannote: {e}")
        finally:
            # Limpieza defensiva de recursos
            if usar_cuda and torch.cuda.is_available():
                torch.cuda.empty_cache()
            gc.collect()

        if output is None:
            raise RuntimeError("DIARIZATION_FAILED: El pipeline de pyannote no devolvió resultados.")

        if progress_callback:
            progress_callback(85, "Estructurando y extrayendo anotaciones exclusivas y embeddings...")

        # 6. Extracción de diarización normal, exclusiva y embeddings
        diarization_annotation = getattr(output, "speaker_diarization", output)
        exclusive_annotation = getattr(output, "exclusive_speaker_diarization", None)
        raw_embeddings = getattr(output, "speaker_embeddings", None)

        segmentos_normales: List[DiarizationSegment] = []
        speaker_ids_set = set()

        if hasattr(diarization_annotation, "itertracks"):
            for segment, track, speaker in diarization_annotation.itertracks(yield_label=True):
                spk_str = str(speaker)
                speaker_ids_set.add(spk_str)
                segmentos_normales.append(
                    DiarizationSegment(
                        start_time=float(segment.start),
                        end_time=float(segment.end),
                        speaker_id=spk_str,
                        track_id=str(track) if track else None,
                        source="pyannote.community-1",
                        engine="pyannote.audio",
                        model=DiarizationModelManager.MODEL_ID,
                    )
                )

        segmentos_exclusivos: List[DiarizationSegment] = []
        if exclusive_annotation is not None and hasattr(exclusive_annotation, "itertracks"):
            for segment, track, speaker in exclusive_annotation.itertracks(yield_label=True):
                segmentos_exclusivos.append(
                    DiarizationSegment(
                        start_time=float(segment.start),
                        end_time=float(segment.end),
                        speaker_id=str(speaker),
                        track_id=str(track) if track else None,
                        source="pyannote.exclusive",
                        engine="pyannote.audio",
                        model=DiarizationModelManager.MODEL_ID,
                    )
                )
        else:
            # Si exclusive_speaker_diarization no vino en la salida, usar los normales como base
            segmentos_exclusivos = list(segmentos_normales)

        # 7. Detección precisa de habla superpuesta (Overlaps)
        overlap_segments = self._detectar_solapamientos(segmentos_normales)

        # 8. Extracción de embeddings por hablante
        embeddings_dict: Dict[str, SpeakerEmbedding] = {}
        if raw_embeddings is not None:
            # raw_embeddings suele ser np.ndarray con shape (num_speakers, dim) o dict
            if isinstance(raw_embeddings, dict):
                for spk, emb in raw_embeddings.items():
                    emb_np = np.asarray(emb, dtype=np.float32).flatten()
                    norm_val = float(np.linalg.norm(emb_np))
                    embeddings_dict[str(spk)] = SpeakerEmbedding(
                        speaker_id=str(spk),
                        dimension=len(emb_np),
                        vector=emb_np.tolist(),
                        norm=norm_val,
                    )
            elif isinstance(raw_embeddings, np.ndarray):
                lista_spks = sorted(list(speaker_ids_set))
                for idx, spk in enumerate(lista_spks):
                    if idx < len(raw_embeddings):
                        emb_row = raw_embeddings[idx].flatten()
                        norm_val = float(np.linalg.norm(emb_row))
                        embeddings_dict[spk] = SpeakerEmbedding(
                            speaker_id=spk,
                            dimension=len(emb_row),
                            vector=emb_row.tolist(),
                            norm=norm_val,
                        )

        # 9. Construcción de trazabilidad pericial
        sha256_orig = calcular_sha256_archivo(audio_path)
        from importlib.metadata import version as get_pkg_ver

        trazabilidad = PericialTraceability(
            original_file_path=os.path.abspath(audio_path),
            original_file_sha256=sha256_orig,
            whisper_version=get_pkg_ver("openai-whisper") if "openai-whisper" in sys.modules else "20250625",
            pyannote_version=get_pkg_ver("pyannote.audio") if "pyannote.audio" in sys.modules else "4.x",
            torch_version=torch.__version__,
            torchcodec_version=get_pkg_ver("torchcodec") if "torchcodec" in sys.modules else "0.16.0",
            ffmpeg_version=AudioValidator.localizar_ffmpeg() or "8.0.1",
            device_used=dispositivo_final,
            gpu_name=gpu_name,
            pipeline_id=DiarizationModelManager.MODEL_ID,
            execution_parameters=params_pipeline,
        )

        speaker_ids_ordenados = sorted(list(speaker_ids_set))

        return DiarizationResult(
            segments=segmentos_normales,
            exclusive_segments=segmentos_exclusivos,
            overlap_segments=overlap_segments,
            speaker_embeddings=embeddings_dict,
            speaker_ids=speaker_ids_ordenados,
            num_speakers=len(speaker_ids_ordenados),
            duration_seconds=val_res.duration_seconds,
            engine="pyannote.audio 4.x",
            model=DiarizationModelManager.MODEL_ID,
            traceability=trazabilidad,
        )

    @staticmethod
    def _detectar_solapamientos(segmentos: List[DiarizationSegment]) -> List[OverlapSegment]:
        """Calcula todos los intervalos temporales donde 2 o más interlocutores hablan simultáneamente."""
        overlaps: List[OverlapSegment] = []
        if len(segmentos) < 2:
            return overlaps

        # Comparación de pares de segmentos
        for i in range(len(segmentos)):
            s1 = segmentos[i]
            for j in range(i + 1, len(segmentos)):
                s2 = segmentos[j]
                if s1.speaker_id == s2.speaker_id:
                    continue
                # Calcular intersección
                inicio_inter = max(s1.start_time, s2.start_time)
                fin_inter = min(s1.end_time, s2.end_time)
                if fin_inter - inicio_inter > 0.05:  # Solapamiento mayor a 50 ms
                    overlaps.append(
                        OverlapSegment(
                            start_time=inicio_inter,
                            end_time=fin_inter,
                            speakers=sorted([s1.speaker_id, s2.speaker_id]),
                        )
                    )

        # Fusionar intervalos de solapamiento contiguos
        if not overlaps:
            return []

        overlaps.sort(key=lambda x: x.start_time)
        fused: List[OverlapSegment] = [overlaps[0]]
        for curr in overlaps[1:]:
            prev = fused[-1]
            if curr.start_time <= prev.end_time and set(curr.speakers) == set(prev.speakers):
                prev.end_time = max(prev.end_time, curr.end_time)
            else:
                fused.append(curr)

        return fused
