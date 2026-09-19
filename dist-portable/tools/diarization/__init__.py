"""
Sephent Transcriptor — Subsistema Modular de Diarización Pericial (pyannote 4.x + Whisper)
"""

from .data_models import (
    DiarizationSegment,
    SpeakerEmbedding,
    OverlapSegment,
    DiarizationResult,
    DiarizedWord,
    DiarizedUtterance,
    DiarizedTranscript,
    PericialTraceability,
)
from .diagnostics import EnvironmentDiagnostics, EstadoDiagnostico
from .model_manager import DiarizationModelManager
from .audio_validator import AudioValidator
from .diarization_service import PyannoteDiarizationService
from .reconciler import DiarizationReconciler
from .self_test import run_diarization_self_test

__all__ = [
    "DiarizationSegment",
    "SpeakerEmbedding",
    "OverlapSegment",
    "DiarizationResult",
    "DiarizedWord",
    "DiarizedUtterance",
    "DiarizedTranscript",
    "PericialTraceability",
    "EnvironmentDiagnostics",
    "EstadoDiagnostico",
    "DiarizationModelManager",
    "AudioValidator",
    "PyannoteDiarizationService",
    "DiarizationReconciler",
    "run_diarization_self_test",
]
