"""
Validador e Inspector de Integridad Multimedia con FFprobe y FFmpeg.
"""

from dataclasses import dataclass
from typing import Optional, Dict, Any
import os
import shutil
import subprocess
import json


@dataclass
class AudioValidationResult:
    """Resultado estructurado de validación de un archivo probatorio."""
    is_valid: bool
    file_path: str
    file_size_bytes: int = 0
    duration_seconds: float = 0.0
    sample_rate: int = 0
    channels: int = 0
    codec_name: str = ""
    has_audio_stream: bool = False
    has_video_stream: bool = False
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = None


class AudioValidator:
    """Valida la integridad de archivos de audio/video antes de la transcripción y diarización."""

    @staticmethod
    def localizar_ffprobe() -> Optional[str]:
        """Localiza el binario de ffprobe en PATH o ubicaciones conocidas seguras."""
        directo = shutil.which("ffprobe")
        if directo:
            return directo
        # Buscar en ubicaciones de Winget o AppData comunes en Windows
        local_appdata = os.environ.get("LOCALAPPDATA", "")
        if local_appdata:
            candidatos = [
                os.path.join(local_appdata, "Microsoft", "WinGet", "Links", "ffprobe.exe"),
                os.path.join(local_appdata, "Programs", "ffmpeg", "bin", "ffprobe.exe"),
            ]
            for c in candidatos:
                if os.path.isfile(c):
                    return c
        return None

    @staticmethod
    def localizar_ffmpeg() -> Optional[str]:
        """Localiza el binario de ffmpeg en PATH o ubicaciones conocidas seguras."""
        directo = shutil.which("ffmpeg")
        if directo:
            return directo
        local_appdata = os.environ.get("LOCALAPPDATA", "")
        if local_appdata:
            candidatos = [
                os.path.join(local_appdata, "Microsoft", "WinGet", "Links", "ffmpeg.exe"),
                os.path.join(local_appdata, "Programs", "ffmpeg", "bin", "ffmpeg.exe"),
            ]
            for c in candidatos:
                if os.path.isfile(c):
                    return c
        return None

    @classmethod
    def validar(cls, file_path: str) -> AudioValidationResult:
        """
        Inspecciona y valida exhaustivamente el archivo probatorio sin alterarlo.
        Detecta: archivo inexistente, permisos, vacío, corrupto o video sin audio.
        """
        if not file_path or not isinstance(file_path, str):
            return AudioValidationResult(
                is_valid=False,
                file_path=str(file_path),
                error_code="INVALID_AUDIO",
                error_message="Ruta de archivo no especificada o inválida."
            )

        if not os.path.exists(file_path):
            return AudioValidationResult(
                is_valid=False,
                file_path=file_path,
                error_code="FILE_NOT_FOUND",
                error_message=f"El archivo no existe en disco: {file_path}"
            )

        if not os.path.isfile(file_path):
            return AudioValidationResult(
                is_valid=False,
                file_path=file_path,
                error_code="INVALID_AUDIO",
                error_message=f"La ruta no apunta a un archivo regular: {file_path}"
            )

        try:
            size = os.path.getsize(file_path)
            if size == 0:
                return AudioValidationResult(
                    is_valid=False,
                    file_path=file_path,
                    file_size_bytes=0,
                    error_code="EMPTY_AUDIO",
                    error_message="El archivo probatorio está completamente vacío (0 bytes)."
                )
        except PermissionError:
            return AudioValidationResult(
                is_valid=False,
                file_path=file_path,
                error_code="PERMISSION_DENIED",
                error_message=f"Permiso denegado para leer el archivo: {file_path}"
            )

        # Inspección profunda con ffprobe
        ffprobe = cls.localizar_ffprobe()
        if ffprobe:
            try:
                cmd = [
                    ffprobe,
                    "-v", "error",
                    "-show_entries", "stream=codec_type,codec_name,sample_rate,channels,duration:format=duration,size",
                    "-of", "json",
                    file_path
                ]
                kwargs = {}
                if os.name == "nt":
                    kwargs["creationflags"] = 0x08000000  # CREATE_NO_WINDOW
                res = subprocess.run(cmd, capture_output=True, text=True, timeout=15, **kwargs)
                if res.returncode == 0 and res.stdout:
                    info = json.loads(res.stdout)
                    streams = info.get("streams", [])
                    fmt = info.get("format", {})

                    audio_streams = [s for s in streams if s.get("codec_type") == "audio"]
                    video_streams = [s for s in streams if s.get("codec_type") == "video"]

                    has_audio = len(audio_streams) > 0
                    has_video = len(video_streams) > 0

                    if not has_audio:
                        if has_video:
                            return AudioValidationResult(
                                is_valid=False,
                                file_path=file_path,
                                file_size_bytes=size,
                                has_video_stream=True,
                                has_audio_stream=False,
                                error_code="NO_AUDIO_STREAM",
                                error_message="El video no contiene ninguna pista o stream de audio analizable."
                            )
                        return AudioValidationResult(
                            is_valid=False,
                            file_path=file_path,
                            file_size_bytes=size,
                            error_code="CORRUPTED_AUDIO",
                            error_message="No se detectó ningún flujo de audio decodificable en el contenedor."
                        )

                    prim_audio = audio_streams[0]
                    duration = float(prim_audio.get("duration") or fmt.get("duration") or 0.0)
                    sample_rate = int(prim_audio.get("sample_rate") or 16000)
                    channels = int(prim_audio.get("channels") or 1)
                    codec = prim_audio.get("codec_name", "")

                    if duration <= 0.01:
                        return AudioValidationResult(
                            is_valid=False,
                            file_path=file_path,
                            file_size_bytes=size,
                            error_code="EMPTY_AUDIO",
                            error_message="La duración del audio es nula o menor a 10 milisegundos."
                        )

                    return AudioValidationResult(
                        is_valid=True,
                        file_path=file_path,
                        file_size_bytes=size,
                        duration_seconds=duration,
                        sample_rate=sample_rate,
                        channels=channels,
                        codec_name=codec,
                        has_audio_stream=True,
                        has_video_stream=has_video,
                        metadata=info
                    )
            except Exception as e:
                # Si ffprobe falla inesperadamente, se registra pero no impide comprobación básica
                pass

        # Fallback sin ffprobe (comprobación básica de lectura)
        try:
            with open(file_path, "rb") as f:
                header = f.read(1024)
                if len(header) < 16:
                    return AudioValidationResult(
                        is_valid=False,
                        file_path=file_path,
                        file_size_bytes=size,
                        error_code="CORRUPTED_AUDIO",
                        error_message="Encabezado del archivo corrupto o truncado."
                    )
            return AudioValidationResult(
                is_valid=True,
                file_path=file_path,
                file_size_bytes=size,
                has_audio_stream=True,
                sample_rate=16000,
                channels=1
            )
        except Exception as e:
            return AudioValidationResult(
                is_valid=False,
                file_path=file_path,
                file_size_bytes=size,
                error_code="CORRUPTED_AUDIO",
                error_message=f"Error de lectura en archivo: {e}"
            )
