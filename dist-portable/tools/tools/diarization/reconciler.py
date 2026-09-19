"""
Reconciliador Desacoplado entre Transcripción de Whisper y Diarización de pyannote.audio.
"""

import numpy as np
from typing import List, Dict, Any, Optional
from .data_models import (
    DiarizationResult,
    DiarizationSegment,
    DiarizedWord,
    DiarizedUtterance,
    DiarizedTranscript,
    OverlapSegment,
    PericialTraceability,
)


class DiarizationReconciler:
    """
    Reconcilia la transcripción ASR (QUÉ se dijo) con la diarización acústica (QUIÉN y CUÁNDO).
    
    Características:
      1. Preferencia por timestamps por palabra cuando Whisper los produce.
      2. Si una frase contiene un cambio de interlocutor, la divide en intervenciones separadas
         en lugar de asignar erróneamente la frase completa al primer hablante.
      3. Utiliza la diarización exclusiva para resolver ambigüedades en bordes de palabras.
      4. Conserva la identificación de habla superpuesta (Overlaps).
      5. Separa estrictamente el ID técnico (SPEAKER_00) del alias ceremonial (Persona 1 / Nombre pericial).
    """

    @classmethod
    def reconciliar(
        cls,
        whisper_result: Dict[str, Any],
        diarization_result: DiarizationResult,
        user_speaker_names: Optional[Dict[str, str]] = None,
        user_speaker_roles: Optional[Dict[str, str]] = None,
        traceability: Optional[PericialTraceability] = None,
    ) -> DiarizedTranscript:
        """
        Ejecuta la reconciliación entre la salida de Whisper y pyannote.
        """
        raw_segments = whisper_result.get("segments", [])
        detected_language = whisper_result.get("language", "es")
        whisper_model = whisper_result.get("modelUsed", "medium")
        total_duration = float(whisper_result.get("durationSeconds") or diarization_result.duration_seconds or 0.0)

        # Usar segmentos exclusivos si están disponibles para resolución directa de palabra
        diar_segments = (
            diarization_result.exclusive_segments
            if diarization_result.exclusive_segments
            else diarization_result.segments
        )

        overlaps = diarization_result.overlap_segments

        utterances: List[DiarizedUtterance] = []
        mapa_nombres_auto: Dict[str, str] = {}
        contador_hablante = 1

        def obtener_nombre_hablante(spk_id: str) -> str:
            nonlocal contador_hablante
            if user_speaker_names and spk_id in user_speaker_names:
                return user_speaker_names[spk_id]
            if spk_id not in mapa_nombres_auto:
                mapa_nombres_auto[spk_id] = f"Persona {contador_hablante}"
                contador_hablante += 1
            return mapa_nombres_auto[spk_id]

        def es_solapamiento(start: float, end: float) -> bool:
            for ov in overlaps:
                if max(start, ov.start_time) < min(end, ov.end_time):
                    return True
            return False

        utterance_idx = 1

        for seg in raw_segments:
            seg_start = float(seg.get("start", 0.0))
            seg_end = float(seg.get("end", 0.0))
            seg_text = (seg.get("text") or "").strip()
            words_raw = seg.get("words", [])

            if not seg_text and not words_raw:
                continue

            # Caso 1: Whisper produjo timestamps a nivel de palabra
            if words_raw and len(words_raw) > 0:
                words_alineadas: List[DiarizedWord] = []
                for w in words_raw:
                    w_text = (w.get("word") or "").strip()
                    if not w_text:
                        continue
                    w_start = float(w.get("start", seg_start))
                    w_end = float(w.get("end", seg_end))
                    w_prob = float(w.get("probability", 1.0))

                    spk_elegido = cls._buscar_hablante_para_intervalo(w_start, w_end, diar_segments)
                    words_alineadas.append(
                        DiarizedWord(
                            word=w_text,
                            start_time=w_start,
                            end_time=w_end,
                            speaker_id=spk_elegido,
                            confidence=w_prob,
                        )
                    )

                if words_alineadas:
                    # Agrupar palabras consecutivas del mismo hablante en utterances separadas
                    grupos = cls._agrupar_palabras_por_hablante(words_alineadas)
                    for grp in grupos:
                        grp_spk = grp[0].speaker_id
                        grp_start = grp[0].start_time
                        grp_end = grp[-1].end_time
                        grp_text = " ".join(w.word for w in grp)
                        grp_conf = float(np.mean([w.confidence for w in grp]))
                        grp_overlap = es_solapamiento(grp_start, grp_end)

                        utterances.append(
                            DiarizedUtterance(
                                id=f"seg_{utterance_idx}",
                                speaker_id=grp_spk,
                                speaker_name=obtener_nombre_hablante(grp_spk),
                                speaker_role=(user_speaker_roles or {}).get(grp_spk),
                                start_time=grp_start,
                                end_time=grp_end,
                                text=grp_text,
                                confidence=grp_conf,
                                words=grp,
                                is_overlap=grp_overlap,
                            )
                        )
                        utterance_idx += 1
                    continue

            # Caso 2: Segmento sin palabras individuales (asignación por intersección dominante)
            spk_dominante = cls._buscar_hablante_para_intervalo(seg_start, seg_end, diar_segments)
            avg_logprob = float(seg.get("avg_logprob", -0.1))
            conf = min(1.0, max(0.0, 1.0 + avg_logprob / 5.0))
            seg_overlap = es_solapamiento(seg_start, seg_end)

            utterances.append(
                DiarizedUtterance(
                    id=f"seg_{utterance_idx}",
                    speaker_id=spk_dominante,
                    speaker_name=obtener_nombre_hablante(spk_dominante),
                    speaker_role=(user_speaker_roles or {}).get(spk_dominante),
                    start_time=seg_start,
                    end_time=seg_end,
                    text=seg_text,
                    confidence=conf,
                    is_overlap=seg_overlap,
                )
            )
            utterance_idx += 1

        # Construir nombres finales
        speaker_names_final: Dict[str, str] = {}
        for u in utterances:
            speaker_names_final[u.speaker_id] = u.speaker_name

        return DiarizedTranscript(
            utterances=utterances,
            speaker_names=speaker_names_final,
            speaker_roles=user_speaker_roles or {},
            duration_seconds=total_duration,
            model_whisper=whisper_model,
            model_diarization=diarization_result.model,
            language=detected_language,
            num_speakers=len(speaker_names_final),
            overlaps=overlaps,
            traceability=traceability or diarization_result.traceability,
        )

    @staticmethod
    def _buscar_hablante_para_intervalo(
        start: float, end: float, diar_segments: List[DiarizationSegment]
    ) -> str:
        """
        Encuentra el hablante con mayor duración de intersección temporal en el intervalo [start, end].
        Si no hay coincidencia directa, busca el segmento más cercano o retorna SPEAKER_00.
        """
        if not diar_segments:
            return "SPEAKER_00"

        mejor_spk = None
        max_interseccion = 0.0

        for d in diar_segments:
            inter_inicio = max(start, d.start_time)
            inter_fin = min(end, d.end_time)
            inter_dur = max(0.0, inter_fin - inter_inicio)

            if inter_dur > max_interseccion:
                max_interseccion = inter_dur
                mejor_spk = d.speaker_id

        if mejor_spk and max_interseccion > 0.0:
            return mejor_spk

        # Si el intervalo cayó en una pausa o silencio entre segmentos, asignar al más próximo
        distancia_minima = 1e9
        spk_cercano = diar_segments[0].speaker_id
        mid_point = (start + end) / 2.0

        for d in diar_segments:
            d_mid = (d.start_time + d.end_time) / 2.0
            dist = abs(mid_point - d_mid)
            if dist < distancia_minima:
                distancia_minima = dist
                spk_cercano = d.speaker_id

        return spk_cercano

    @staticmethod
    def _agrupar_palabras_por_hablante(words: List[DiarizedWord]) -> List[List[DiarizedWord]]:
        """Agrupa secuencias contiguas de palabras que pertenecen al mismo interlocutor."""
        if not words:
            return []
        grupos: List[List[DiarizedWord]] = []
        actual: List[DiarizedWord] = [words[0]]

        for w in words[1:]:
            if w.speaker_id == actual[-1].speaker_id:
                actual.append(w)
            else:
                grupos.append(actual)
                actual = [w]
        if actual:
            grupos.append(actual)
        return grupos
