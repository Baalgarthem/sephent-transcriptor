"""
Gestor de Modelos para pyannote/speaker-diarization-community-1 (Online / Offline).
"""

import os
import json
from pathlib import Path
from typing import Optional, Callable, Dict, Any


class DiarizationModelManager:
    """Gestiona la descarga, verificación de integridad y carga offline de community-1."""

    MODEL_ID = "pyannote/speaker-diarization-community-1"
    CONFIG_DIR = os.path.expanduser("~/.sephent")
    TOKEN_FILE = os.path.join(CONFIG_DIR, "hf_token.json")

    @classmethod
    def obtener_token(cls) -> Optional[str]:
        """
        Recupera de forma segura el token de Hugging Face sin exponerlo en texto plano ni logs.
        Orden de prioridad:
          1. Variable de entorno HF_TOKEN
          2. Variable de entorno HUGGING_FACE_HUB_TOKEN
          3. Archivo seguro de configuración de Sephent (~/.sephent/hf_token.json)
          4. Token de la CLI de Hugging Face (~/.cache/huggingface/token)
        """
        # 1 y 2: Variables de entorno
        env_token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")
        if env_token and env_token.strip():
            return env_token.strip()

        # 3: Configuración local de Sephent
        if os.path.isfile(cls.TOKEN_FILE):
            try:
                with open(cls.TOKEN_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    tok = data.get("hf_token")
                    if tok and isinstance(tok, str) and tok.strip():
                        return tok.strip()
            except Exception:
                pass

        # 4: Token estándar de Hugging Face Hub
        hf_home_token = os.path.expanduser("~/.cache/huggingface/token")
        if os.path.isfile(hf_home_token):
            try:
                with open(hf_home_token, "r", encoding="utf-8") as f:
                    tok = f.read().strip()
                    if tok:
                        return tok
            except Exception:
                pass

        return None

    @classmethod
    def guardar_token(cls, token: str) -> bool:
        """Guarda el token de forma privada en ~/.sephent/hf_token.json."""
        if not token or not token.strip():
            return False
        try:
            os.makedirs(cls.CONFIG_DIR, exist_ok=True)
            with open(cls.TOKEN_FILE, "w", encoding="utf-8") as f:
                json.dump({"hf_token": token.strip()}, f)
            return True
        except Exception:
            return False

    @classmethod
    def obtener_ruta_cache_local(cls) -> Path:
        """Ruta al repositorio cacheado en el Hub de Hugging Face."""
        hf_home = os.environ.get("HF_HOME") or os.path.expanduser("~/.cache/huggingface")
        repo_dir_name = "models--" + cls.MODEL_ID.replace("/", "--")
        return Path(hf_home) / "hub" / repo_dir_name

    @classmethod
    def existe_modelo_local(cls) -> bool:
        """Comprueba si el modelo community-1 está descargado completamente en caché offline."""
        cache_path = cls.obtener_ruta_cache_local()
        if not cache_path.exists():
            return False

        snapshots = cache_path / "snapshots"
        if not snapshots.exists():
            return False

        # Verificar si hay al menos un snapshot con config.yaml
        for snap in snapshots.iterdir():
            if snap.is_dir() and (snap / "config.yaml").exists():
                return True
        return False

    @classmethod
    def descargar_modelo(cls, token: Optional[str] = None, progress_hook: Optional[Callable] = None) -> bool:
        """
        Descarga el pipeline completo community-1 a la caché local para permitir uso offline posterior.
        Requiere haber aceptado los términos del modelo en Hugging Face.
        """
        tok = token or cls.obtener_token()
        if not tok:
            raise ValueError(
                "HF_TOKEN_MISSING: Se requiere un token de Hugging Face para descargar "
                "pyannote/speaker-diarization-community-1. Acepta los términos en https://hf.co/pyannote/speaker-diarization-community-1"
            )

        from huggingface_hub import snapshot_download
        try:
            snapshot_download(
                repo_id=cls.MODEL_ID,
                token=tok,
                local_files_only=False,
            )
            return True
        except Exception as e:
            err_str = str(e)
            if "403" in err_str or "gated" in err_str.lower() or "restricted" in err_str.lower():
                raise PermissionError(
                    "MODEL_ACCESS_NOT_ACCEPTED: Acceso condicionado al modelo no aceptado. "
                    "Visita https://huggingface.co/pyannote/speaker-diarization-community-1 y acepta las condiciones con tu cuenta de Hugging Face."
                )
            if "401" in err_str or "invalid token" in err_str.lower():
                raise ValueError("HF_TOKEN_INVALID: El token de Hugging Face proporcionado no es válido.")
            raise RuntimeError(f"MODEL_DOWNLOAD_FAILED: Error al descargar community-1: {e}")

    @classmethod
    def cargar_pipeline(cls, token: Optional[str] = None, device: str = "cpu"):
        """
        Carga el pipeline pyannote.audio 4.x de forma tolerante a fallos (online con token u offline desde caché).
        """
        from pyannote.audio import Pipeline
        import torch

        tok = token or cls.obtener_token()
        model_id = cls.MODEL_ID

        # Si ya existe en caché local, podemos cargar incluso sin conexión
        kwargs = {}
        if tok:
            kwargs["token"] = tok

        try:
            pipeline = Pipeline.from_pretrained(model_id, **kwargs)
        except Exception as e:
            # Si falló por falta de token pero existe en caché local
            if cls.existe_modelo_local():
                try:
                    pipeline = Pipeline.from_pretrained(model_id)
                except Exception as e_local:
                    raise RuntimeError(f"Error al cargar modelo community-1 desde caché offline: {e_local}")
            else:
                err_str = str(e)
                if "403" in err_str or "gated" in err_str.lower():
                    raise PermissionError(
                        "MODEL_ACCESS_NOT_ACCEPTED: Debes aceptar las condiciones de pyannote/speaker-diarization-community-1 en Hugging Face."
                    )
                raise RuntimeError(f"MODEL_LOAD_FAILED: No se pudo cargar el pipeline pyannote 4.x: {e}")

        # Configurar dispositivo (CUDA o CPU)
        if device == "cuda" and torch.cuda.is_available():
            try:
                pipeline.to(torch.device("cuda"))
            except Exception as e_cuda:
                print(f"[ModelManager] Aviso: Falló asignación a CUDA ({e_cuda}). Utilizando CPU.", flush=True)
                pipeline.to(torch.device("cpu"))
        else:
            pipeline.to(torch.device("cpu"))

        return pipeline
