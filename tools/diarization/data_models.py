"""
Modelos de Datos Tipados y Trazabilidad Pericial para Diarización y Reconciliación.
"""

from dataclasses import dataclass, field, asdict
from typing import List, Dict, Any, Optional
import hashlib
import os
import datetime
import sys


def calcular_sha256_archivo(ruta: str) -> str:
    """Calcula el hash SHA-256 de un archivo en bloques de 64 KB sin modificarlo."""
    if not ruta or not os.path.isfile(ruta):
        return ""
    sha256 = hashlib.sha256()
    with open(ruta, "rb") as f:
        while chunk := f.read(65536):
            sha256.update(chunk)
    return sha256.hexdigest()


@dataclass
class SpeakerEmbedding:
    """Representación vectorial (embedding) de la huella vocal de un hablante."""
    speaker_id: str
    dimension: int
    vector: List[float] = field(default_factory=list)
    norm: float = 1.0


@dataclass
class DiarizationSegment:
    """Segmento individual de actividad de voz asignado a un interlocutor."""
    start_time: float
    end_time: float
    speaker_id: str
    confidence: float = 1.0
    track_id: Optional[str] = None
    is_overlap: bool = False
    source: str = "pyannote"
    engine: str = "pyannote.audio"
    model: str = "pyannote/speaker-diarization-community-1"
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def duration(self) -> float:
        return max(0.0, self.end_time - self.start_time)


@dataclass
class OverlapSegment:
    """Intervalo temporal donde coexisten simultáneamente dos o más interlocutores."""
    start_time: float
    end_time: float
    speakers: List[str] = field(default_factory=list)

    @property
    def duration(self) -> float:
        return max(0.0, self.end_time - self.start_time)


@dataclass
class PericialTraceability:
    """Registro de cadena de custodia técnica y trazabilidad pericial."""
    original_file_path: str
    original_file_sha256: str
    derived_file_path: Optional[str] = None
    derived_file_sha256: Optional[str] = None
    processing_timestamp_utc: str = field(
        default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()
    )
    python_version: str = field(default_factory=lambda: sys.version.split()[0])
    whisper_version: str = "20250625"
    pyannote_version: str = "4.x"
    torch_version: str = ""
    torchcodec_version: str = ""
    ffmpeg_version: str = ""
    device_used: str = "cpu"
    gpu_name: Optional[str] = None
    pipeline_id: str = "pyannote/speaker-diarization-community-1"
    execution_parameters: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class DiarizationResult:
    """Resultado estructurado completo emitido por el motor de diarización."""
    segments: List[DiarizationSegment] = field(default_factory=list)
    exclusive_segments: List[DiarizationSegment] = field(default_factory=list)
    overlap_segments: List[OverlapSegment] = field(default_factory=list)
    speaker_embeddings: Dict[str, SpeakerEmbedding] = field(default_factory=dict)
    speaker_ids: List[str] = field(default_factory=list)
    num_speakers: int = 0
    duration_seconds: float = 0.0
    engine: str = "pyannote.audio"
    model: str = "pyannote/speaker-diarization-community-1"
    traceability: Optional[PericialTraceability] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "segments": [asdict(s) for s in self.segments],
            "exclusive_segments": [asdict(s) for s in self.exclusive_segments],
            "overlap_segments": [asdict(s) for s in self.overlap_segments],
            "speaker_embeddings": {k: asdict(v) for k, v in self.speaker_embeddings.items()},
            "speaker_ids": self.speaker_ids,
            "num_speakers": self.num_speakers,
            "duration_seconds": round(self.duration_seconds, 3),
            "engine": self.engine,
            "model": self.model,
            "traceability": self.traceability.to_dict() if self.traceability else None,
        }


@dataclass
class DiarizedWord:
    """Palabra individual alineada con marcas de tiempo y hablante."""
    word: str
    start_time: float
    end_time: float
    speaker_id: str
    confidence: float = 1.0


@dataclass
class DiarizedUtterance:
    """Intervención o párrafo de transcripción reconciliado con su interlocutor."""
    id: str
    speaker_id: str
    speaker_name: str
    start_time: float
    end_time: float
    text: str
    confidence: float = 1.0
    speaker_role: Optional[str] = None
    words: List[DiarizedWord] = field(default_factory=list)
    is_overlap: bool = False
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def duration(self) -> float:
        return max(0.0, self.end_time - self.start_time)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "speakerId": self.speaker_id,
            "speakerName": self.speaker_name,
            "speakerRole": self.speaker_role,
            "startTime": round(self.start_time, 3),
            "endTime": round(self.end_time, 3),
            "text": self.text,
            "confidence": round(self.confidence, 3),
            "isOverlap": self.is_overlap,
            "words": [
                {
                    "word": w.word,
                    "start": round(w.start_time, 3),
                    "end": round(w.end_time, 3),
                    "speakerId": w.speaker_id,
                    "confidence": round(w.confidence, 3),
                }
                for w in self.words
            ] if self.words else None,
            "metadata": self.metadata,
        }


@dataclass
class DiarizedTranscript:
    """Transcripción final pericial que une Whisper y pyannote.audio."""
    utterances: List[DiarizedUtterance] = field(default_factory=list)
    speaker_names: Dict[str, str] = field(default_factory=dict)
    speaker_roles: Dict[str, str] = field(default_factory=dict)
    duration_seconds: float = 0.0
    model_whisper: str = ""
    model_diarization: str = ""
    language: str = "es"
    num_speakers: int = 0
    overlaps: List[OverlapSegment] = field(default_factory=list)
    traceability: Optional[PericialTraceability] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "segments": [u.to_dict() for u in self.utterances],
            "speakerNames": self.speaker_names,
            "speakerRoles": self.speaker_roles,
            "durationSeconds": round(self.duration_seconds, 3),
            "modelUsed": self.model_whisper,
            "modelDiarization": self.model_diarization,
            "language": self.language,
            "numSpeakers": self.num_speakers,
            "overlaps": [asdict(o) for o in self.overlaps],
            "traceability": self.traceability.to_dict() if self.traceability else None,
        }
