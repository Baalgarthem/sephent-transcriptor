"""
Diagnóstico Exhaustivo del Entorno en 3 Niveles: PRESENCIA → COMPATIBILIDAD → PRUEBA FUNCIONAL.
"""

from dataclasses import dataclass, field, asdict
from typing import Dict, Any, List, Optional
import sys
import platform
import shutil
import subprocess
import os


@dataclass
class ItemDiagnostico:
    """Diagnóstico individual de un componente del sistema."""
    nombre: str
    instalado: bool = False
    compatible: bool = False
    funcional: bool = False
    version: str = "No detectada"
    detalle: str = ""
    nivel_error: Optional[str] = None  # None, "WARNING", "ERROR"

    @property
    def estado_str(self) -> str:
        if self.funcional and self.compatible:
            return "OK"
        if self.instalado and not self.compatible:
            return "INCOMPATIBLE"
        if self.instalado and not self.funcional:
            return "NO FUNCIONAL"
        return "FALTA"


@dataclass
class EstadoDiagnostico:
    """Reporte estructurado del diagnóstico de entorno de Sephent Transcriptor."""
    listo_para_transcribir: bool = False
    listo_para_diarizar_pyannote: bool = False
    listo_para_diarizar_acustico: bool = False
    dispositivo_preferido: str = "cpu"
    gpu_nombre: Optional[str] = None
    cuda_funcional: bool = False
    items: Dict[str, ItemDiagnostico] = field(default_factory=dict)
    resumen_texto: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "listo_para_transcribir": self.listo_para_transcribir,
            "listo_para_diarizar_pyannote": self.listo_para_diarizar_pyannote,
            "listo_para_diarizar_acustico": self.listo_para_diarizar_acustico,
            "dispositivo_preferido": self.dispositivo_preferido,
            "gpu_nombre": self.gpu_nombre,
            "cuda_funcional": self.cuda_funcional,
            "items": {k: asdict(v) for k, v in self.items.items()},
        }


class EnvironmentDiagnostics:
    """Diagnostica y certifica el entorno de ejecución para Whisper y pyannote.audio 4.x."""

    @staticmethod
    def _obtener_version_paquete(nombre: str) -> Optional[str]:
        try:
            from importlib.metadata import version, PackageNotFoundError
            return version(nombre)
        except Exception:
            return None

    @classmethod
    def diagnosticar(cls) -> EstadoDiagnostico:
        estado = EstadoDiagnostico()
        items = {}

        # 1. Python
        py_ver = sys.version.split()[0]
        py_major, py_minor = sys.version_info.major, sys.version_info.minor
        py_comp = (py_major == 3 and py_minor >= 8)
        py_func = True
        items["python"] = ItemDiagnostico(
            nombre="Python",
            instalado=True,
            compatible=py_comp,
            funcional=py_func,
            version=py_ver,
            detalle=f"Ejecutable: {sys.executable}"
        )

        # 2. PyTorch
        torch_ver = cls._obtener_version_paquete("torch")
        torch_inst = torch_ver is not None
        torch_comp = False
        torch_func = False
        torch_det = ""
        if torch_inst:
            try:
                import torch
                torch_comp = True
                t = torch.randn(10, 10)
                _ = t @ t
                torch_func = True
                torch_det = "Operaciones tensoriales en CPU verificadas"
            except Exception as e:
                torch_det = f"Error en tensor CPU: {e}"
        items["torch"] = ItemDiagnostico(
            nombre="PyTorch",
            instalado=torch_inst,
            compatible=torch_comp,
            funcional=torch_func,
            version=torch_ver or "No instalado",
            detalle=torch_det
        )

        # 3. CUDA & GPU
        cuda_inst = False
        cuda_comp = False
        cuda_func = False
        cuda_ver_str = "No disponible"
        gpu_name = None
        if torch_func:
            try:
                import torch
                if torch.cuda.is_available():
                    cuda_inst = True
                    cuda_ver_str = str(getattr(torch.version, "cuda", "Disponible"))
                    gpu_name = torch.cuda.get_device_name(0)
                    t_cuda = torch.randn(10, 10, device="cuda")
                    _ = t_cuda @ t_cuda
                    cuda_comp = True
                    cuda_func = True
                    estado.cuda_funcional = True
                    estado.gpu_nombre = gpu_name
                    estado.dispositivo_preferido = "cuda"
                    cuda_det = f"GPU: {gpu_name} (CUDA {cuda_ver_str})"
                else:
                    cuda_det = "CUDA no disponible o GPU NVIDIA no detectada (uso en CPU)"
            except Exception as e:
                cuda_det = f"CUDA detectada pero no funcional: {e}"
        else:
            cuda_det = "Requiere PyTorch funcional"
        items["cuda"] = ItemDiagnostico(
            nombre="CUDA / GPU",
            instalado=cuda_inst,
            compatible=cuda_comp,
            funcional=cuda_func,
            version=cuda_ver_str,
            detalle=cuda_det
        )

        # 4. OpenAI Whisper
        whisper_ver = cls._obtener_version_paquete("openai-whisper")
        whisper_inst = whisper_ver is not None
        whisper_comp = False
        whisper_func = False
        whisper_det = ""
        if whisper_inst:
            try:
                import whisper
                whisper_comp = True
                whisper_func = True
                whisper_det = "Módulo whisper cargado correctamente"
            except Exception as e:
                whisper_det = f"Error al importar whisper: {e}"
        items["whisper"] = ItemDiagnostico(
            nombre="OpenAI Whisper",
            instalado=whisper_inst,
            compatible=whisper_comp,
            funcional=whisper_func,
            version=whisper_ver or "No instalado",
            detalle=whisper_det
        )

        # 5. pyannote.audio
        pyannote_ver = cls._obtener_version_paquete("pyannote.audio")
        pyannote_inst = pyannote_ver is not None
        pyannote_comp = False
        pyannote_func = False
        pyannote_det = ""
        if pyannote_inst:
            try:
                from pyannote.audio import Pipeline
                pyannote_comp = True
                pyannote_func = True
                pyannote_det = "Clase Pipeline de pyannote 4.x disponible"
            except Exception as e:
                pyannote_det = f"Error al importar pyannote.audio: {e}"
        items["pyannote"] = ItemDiagnostico(
            nombre="pyannote.audio",
            instalado=pyannote_inst,
            compatible=pyannote_comp,
            funcional=pyannote_func,
            version=pyannote_ver or "No instalado",
            detalle=pyannote_det
        )

        # 6. TorchCodec
        torchcodec_ver = cls._obtener_version_paquete("torchcodec")
        torchcodec_inst = torchcodec_ver is not None
        torchcodec_comp = False
        torchcodec_func = False
        torchcodec_det = ""
        if torchcodec_inst:
            try:
                import torchcodec
                torchcodec_comp = True
                torchcodec_func = True
                torchcodec_det = "Decodificador nativo TorchCodec disponible"
            except Exception as e:
                torchcodec_det = f"Aviso de carga TorchCodec: {e}"
        items["torchcodec"] = ItemDiagnostico(
            nombre="TorchCodec",
            instalado=torchcodec_inst,
            compatible=torchcodec_comp,
            funcional=torchcodec_func,
            version=torchcodec_ver or "No instalado",
            detalle=torchcodec_det
        )

        # 7. NumPy
        numpy_ver = cls._obtener_version_paquete("numpy")
        numpy_inst = numpy_ver is not None
        numpy_func = False
        if numpy_inst:
            try:
                import numpy as np
                _ = np.zeros((2, 2))
                numpy_func = True
            except Exception: pass
        items["numpy"] = ItemDiagnostico(
            nombre="NumPy",
            instalado=numpy_inst,
            compatible=numpy_inst,
            funcional=numpy_func,
            version=numpy_ver or "No instalado",
            detalle="Operaciones numéricas vectoriales"
        )

        # 8. FFmpeg & FFprobe
        ffmpeg_bin = shutil.which("ffmpeg")
        ffprobe_bin = shutil.which("ffprobe")
        ffmpeg_inst = ffmpeg_bin is not None
        ffprobe_inst = ffprobe_bin is not None
        ffmpeg_func = False
        ffmpeg_ver_str = "No detectado"

        if ffmpeg_inst:
            try:
                kwargs = {"creationflags": 0x08000000} if os.name == "nt" else {}
                res = subprocess.run([ffmpeg_bin, "-version"], capture_output=True, text=True, timeout=5, **kwargs)
                if res.returncode == 0:
                    ffmpeg_func = True
                    primera_linea = res.stdout.splitlines()[0] if res.stdout else ""
                    if "version" in primera_linea:
                        partes = primera_linea.split("version")
                        if len(partes) > 1:
                            ffmpeg_ver_str = partes[1].split()[0]
            except Exception: pass

        items["ffmpeg"] = ItemDiagnostico(
            nombre="FFmpeg",
            instalado=ffmpeg_inst,
            compatible=ffmpeg_inst,
            funcional=ffmpeg_func,
            version=ffmpeg_ver_str,
            detalle=f"Ruta: {ffmpeg_bin or 'No encontrado en PATH'}"
        )
        items["ffprobe"] = ItemDiagnostico(
            nombre="FFprobe",
            instalado=ffprobe_inst,
            compatible=ffprobe_inst,
            funcional=ffprobe_inst,
            version=ffmpeg_ver_str if ffprobe_inst else "No detectado",
            detalle=f"Ruta: {ffprobe_bin or 'No encontrado en PATH'}"
        )

        # 9. Hugging Face Token & Community-1 Model Status
        from .model_manager import DiarizationModelManager
        hf_token_presente = DiarizationModelManager.obtener_token() is not None
        modelo_local_existe = DiarizationModelManager.existe_modelo_local()

        items["hf_token"] = ItemDiagnostico(
            nombre="Token Hugging Face",
            instalado=hf_token_presente,
            compatible=hf_token_presente,
            funcional=hf_token_presente,
            version="Configurado" if hf_token_presente else "No configurado",
            detalle="Requerido para descarga inicial de pyannote/community-1"
        )
        items["community_1"] = ItemDiagnostico(
            nombre="Modelo Community-1",
            instalado=modelo_local_existe,
            compatible=modelo_local_existe,
            funcional=modelo_local_existe,
            version="En caché local" if modelo_local_existe else "No descargado",
            detalle="Pipeline pyannote/speaker-diarization-community-1"
        )

        # Evaluar readiness global
        estado.items = items
        estado.listo_para_transcribir = (
            items["python"].funcional and
            items["torch"].funcional and
            items["whisper"].funcional
        )
        estado.listo_para_diarizar_pyannote = (
            items["python"].funcional and
            items["torch"].funcional and
            items["pyannote"].funcional and
            items["community_1"].funcional
        )
        # Fallback acústico heurístico disponible si scipy/numpy/torch están listos
        estado.listo_para_diarizar_acustico = (
            items["python"].funcional and
            items["torch"].funcional and
            items["numpy"].funcional
        )

        # Formatear resumen
        lineas = ["\nDiagnóstico de Entorno — Sephent Transcriptor", "---------------------------------------------"]
        for k, it in items.items():
            lineas.append(f"{it.nombre:<22} {it.estado_str:<12} {it.version}")
        lineas.append("---------------------------------------------")
        if estado.listo_para_diarizar_pyannote:
            lineas.append("Estado: LISTO PARA TRANSCRIBIR Y DIARIZAR (pyannote community-1)")
        elif estado.listo_para_transcribir:
            lineas.append("Estado: LISTO PARA TRANSCRIBIR (Diarización por fallback acústico)")
        else:
            lineas.append("Estado: DEPENDENCIAS INCOMPLETAS")
        estado.resumen_texto = "\n".join(lineas)

        return estado
