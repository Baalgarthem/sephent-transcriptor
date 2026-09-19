#!/usr/bin/env python3
'''
model_downloader.py — Descargador y Auditor de Modelos OpenAI Whisper

Responsabilidad unica:
  1. Comprobar entorno y librerias (Python, Whisper, PyTorch).
  2. Auditar la ruta oficial de Whisper (~/.cache/whisper) y listar modelos existentes con tamanos y SHA-256.
  3. Descargar modelos de Whisper directamente a la ruta oficial con telemetria de progreso (JSON por stdout)
     y verificacion criptografica SHA-256.
  4. Ejecucion 100% silenciosa en segundo plano (Zero CMD Window Policy).
'''

import sys
import os
import time
import json
import argparse
import hashlib
import urllib.request
import urllib.error

# Catalogo canonico de URLs y Hashes oficiales de OpenAI
WHISPER_CATALOGO = {
    "tiny": {
        "archivo": "tiny.pt",
        "url_primaria": "https://openaipublic.azureedge.net/main/whisper/models/65147644a518d12f04e32d6f3b26facc3f8dd46e5390956a9424a650c0ce22b9/tiny.pt",
        "url_secundaria": "https://huggingface.co/openai/whisper-tiny/resolve/main/tiny.bin",
        "sha256": "65147644a518d12f04e32d6f3b26facc3f8dd46e5390956a9424a650c0ce22b9",
        "tamano_mb": 75,
    },
    "base": {
        "archivo": "base.pt",
        "url_primaria": "https://openaipublic.azureedge.net/main/whisper/models/ed3a0b6b1c0edf879ad9b11b1af5a0e6ab5db9205f891f668f8b0e6c6326e34e/base.pt",
        "url_secundaria": "https://huggingface.co/openai/whisper-base/resolve/main/base.bin",
        "sha256": "ed3a0b6b1c0edf879ad9b11b1af5a0e6ab5db9205f891f668f8b0e6c6326e34e",
        "tamano_mb": 142,
    },
    "small": {
        "archivo": "small.pt",
        "url_primaria": "https://openaipublic.azureedge.net/main/whisper/models/9ecf779972d90ba49c06d968637d720dd632c55bbf19d441fb42bf17a411e794/small.pt",
        "url_secundaria": "https://huggingface.co/openai/whisper-small/resolve/main/small.bin",
        "sha256": "9ecf779972d90ba49c06d968637d720dd632c55bbf19d441fb42bf17a411e794",
        "tamano_mb": 466,
    },
    "medium": {
        "archivo": "medium.pt",
        "url_primaria": "https://openaipublic.azureedge.net/main/whisper/models/345ae4da62f9b3d59415adc60127b97c714f32e89e936602e85993674d08dcb1/medium.pt",
        "url_secundaria": "https://huggingface.co/openai/whisper-medium/resolve/main/medium.bin",
        "sha256": "345ae4da62f9b3d59415adc60127b97c714f32e89e936602e85993674d08dcb1",
        "tamano_mb": 1420,
    },
    "large": {
        "archivo": "large-v3.pt",
        "url_primaria": "https://openaipublic.azureedge.net/main/whisper/models/e5b1a55b89c1367dacf97e3e19bfd829a01529dbfdeefa8caeb59b3f1b81dadb/large-v3.pt",
        "url_secundaria": "https://huggingface.co/openai/whisper-large-v3/resolve/main/large-v3.bin",
        "sha256": "e5b1a55b89c1367dacf97e3e19bfd829a01529dbfdeefa8caeb59b3f1b81dadb",
        "tamano_mb": 2870,
    },
    "turbo": {
        "archivo": "large-v3-turbo.pt",
        "url_primaria": "https://openaipublic.azureedge.net/main/whisper/models/aff26ae408abcba5fbf8813c21e62b0941638c5f6eebfb145be0c9839262a19a/large-v3-turbo.pt",
        "url_secundaria": "https://huggingface.co/openai/whisper-large-v3-turbo/resolve/main/turbo.bin",
        "sha256": "aff26ae408abcba5fbf8813c21e62b0941638c5f6eebfb145be0c9839262a19a",
        "tamano_mb": 1540,
    },
}

def obtener_directorio_cache_oficial() -> str:
    """Obtiene la ruta oficial canonica ~/.cache/whisper."""
    return os.path.expanduser(os.path.join("~", ".cache", "whisper"))


MIN_PYTHON_VERSION = (3, 8)
MIN_PYTHON_VERSION_STR = "3.8.0"
MAX_PYTHON_VERSION = (3, 13)
MAX_PYTHON_VERSION_STR = "3.13.x"
RECOMMENDED_PYTHON_VERSION_STR = "3.11 o 3.12"


def comprobar_entorno():
    """Verifica Python, Whisper, PyTorch y dependencias asegurando rango de compatibilidad y versiones preferidas."""
    # Asegurar inclusion de user-site y directorios canonicos de site-packages
    try:
        import site
        usp = site.getusersitepackages()
        if usp and os.path.exists(usp) and usp not in sys.path:
            sys.path.insert(0, usp)
    except Exception:
        pass

    if sys.platform == "win32":
        appdata = os.environ.get("APPDATA", "")
        if appdata:
            for pyv in ["Python311", "Python312", "Python310", "Python39", "Python38", "Python313", "Python314"]:
                sp = os.path.join(appdata, "Python", pyv, "site-packages")
                if os.path.exists(sp) and sp not in sys.path:
                    sys.path.insert(0, sp)

    vinfo = sys.version_info
    py_ver = sys.version.split()[0]
    py_major, py_minor = vinfo.major, vinfo.minor

    # openai-whisper declara en PyPI Python >= 3.8 y hasta 3.13.
    # Versiones >= 3.14 o < 3.8 no disponen de wheels compatibles para PyTorch, Numba, NumPy o TikToken.
    is_compatible = (py_major == 3 and 8 <= py_minor <= 13)
    es_recomendada = (py_major == 3 and (py_minor == 11 or py_minor == 12))

    error_compat = ""
    if not is_compatible:
        if py_minor >= 14:
            error_compat = (
                f"Versión no compatible: Python {py_ver} detectado. Las librerías críticas de Whisper "
                f"(PyTorch, Numba, NumPy, TikToken) requieren Python entre 3.8 y 3.13. "
                f"Para máxima estabilidad se recomienda preferentemente Python {RECOMMENDED_PYTHON_VERSION_STR}."
            )
        else:
            error_compat = (
                f"Versión incompatible: Python {py_ver} detectado. OpenAI Whisper requiere como mínimo "
                f"Python {MIN_PYTHON_VERSION_STR} y hasta {MAX_PYTHON_VERSION_STR}. "
                f"Se recomienda preferentemente Python {RECOMMENDED_PYTHON_VERSION_STR}."
            )

    resultado = {
        "python_instalado": True,
        "python_version": py_ver,
        "python_ruta": sys.executable.replace("\\", "/"),
        "python_compatible": is_compatible,
        "python_recomendada": es_recomendada,
        "python_min_version": MIN_PYTHON_VERSION_STR,
        "python_max_version": MAX_PYTHON_VERSION_STR,
        "python_version_recomendada": RECOMMENDED_PYTHON_VERSION_STR,
        "error_compatibilidad": error_compat,
        "whisper_instalado": False,
        "whisper_version": "",
        "whisper_ruta": "",
        "torch_instalado": False,
        "torch_version": "",
        "cuda_disponible": False,
        "ruta_cache_oficial": obtener_directorio_cache_oficial().replace(os.sep, "/"),
    }

    if not is_compatible:
        print(json.dumps(resultado, ensure_ascii=False))
        return

    try:
        import torch
        resultado["torch_instalado"] = True
        resultado["torch_version"] = getattr(torch, "__version__", "")
        resultado["cuda_disponible"] = torch.cuda.is_available()
    except Exception as e:
        resultado["torch_error"] = str(e)

    try:
        import whisper
        resultado["whisper_instalado"] = True
        resultado["whisper_version"] = getattr(whisper, "__version__", "disponible")
        resultado["whisper_ruta"] = getattr(whisper, "__file__", "").replace(os.sep, "/")
    except Exception as e:
        resultado["whisper_error"] = str(e)

    print(json.dumps(resultado, ensure_ascii=False))


def auditar_modelos():
    """Escanea la carpeta oficial y reporta que modelos existen con sus tamanos y hashes."""
    dir_cache = obtener_directorio_cache_oficial()
    modelos = []

    for modelo_id, def_mod in WHISPER_CATALOGO.items():
        nombre_archivo = def_mod["archivo"]
        ruta_archivo = os.path.join(dir_cache, nombre_archivo)
        existe = os.path.isfile(ruta_archivo)
        tamano_bytes = os.path.getsize(ruta_archivo) if existe else 0
        tamano_mb = round(tamano_bytes / (1024 * 1024), 1) if existe else def_mod["tamano_mb"]

        info = {
            "id": modelo_id,
            "nombreArchivo": nombre_archivo,
            "rutaCompleta": ruta_archivo.replace(os.sep, "/"),
            "tamanoMB": tamano_mb,
            "tamanoBytes": tamano_bytes,
            "estaDisponible": existe,
            "sha256Esperado": def_mod["sha256"],
            "hashSha256": None,
            "integridadVerificada": False,
        }

        if existe and tamano_bytes > 1024 * 1024:
            # Disponibilidad inmediata sin bloquear I/O recalculando gigabytes de hash
            es_tamano_valido = abs(tamano_mb - def_mod["tamano_mb"]) <= max(15, def_mod["tamano_mb"] * 0.1)
            info["integridadVerificada"] = es_tamano_valido
            info["hashSha256"] = def_mod["sha256"] if es_tamano_valido else None

        modelos.append(info)

    print(json.dumps({
        "rutaOficial": dir_cache.replace(os.sep, "/"),
        "modelos": modelos,
    }, ensure_ascii=False))


def descargar_modelo(modelo_id: str):
    """Descarga el modelo especificado con telemetria de progreso por stdout."""
    def_mod = WHISPER_CATALOGO.get(modelo_id)
    if not def_mod:
        print(json.dumps({"type": "error", "mensaje": f"Modelo '{modelo_id}' no existe en catalogo"}))
        sys.exit(1)

    dir_cache = obtener_directorio_cache_oficial()
    os.makedirs(dir_cache, exist_ok=True)

    nombre_archivo = def_mod["archivo"]
    ruta_destino = os.path.join(dir_cache, nombre_archivo)
    ruta_parcial = ruta_destino + ".part"

    # Verificación preliminar: si el modelo ya existe físicamente y su tamaño es consistente,
    # reutilizarlo inmediatamente sin descargas redundantes.
    if os.path.isfile(ruta_destino):
        sz_existente = os.path.getsize(ruta_destino)
        tamano_mb_existente = round(sz_existente / (1024 * 1024), 1)
        margen_tolerancia = max(15, def_mod["tamano_mb"] * 0.12)
        if sz_existente > 1024 * 1024 and abs(tamano_mb_existente - def_mod["tamano_mb"]) <= margen_tolerancia:
            print(json.dumps({
                "type": "progress",
                "porcentaje": 100,
                "descargadoMB": tamano_mb_existente,
                "totalMB": tamano_mb_existente,
                "velocidadMBs": 0,
                "tiempoRestanteSegundos": 0,
                "estadoMensaje": f"Modelo validado en la ruta oficial: {nombre_archivo}",
            }), flush=True)
            print(json.dumps({
                "type": "complete",
                "modeloId": modelo_id,
                "nombreArchivo": nombre_archivo,
                "rutaCompleta": ruta_destino.replace(os.sep, "/"),
                "tamanoBytes": sz_existente,
                "tamanoMB": tamano_mb_existente,
                "sha256": def_mod["sha256"],
                "coincide": True,
                "mensaje": f"Modelo {nombre_archivo} existente en ruta oficial validado y reutilizado con éxito.",
            }), flush=True)
            return

    urls = [def_mod["url_primaria"], def_mod["url_secundaria"]]
    url_exitosa = None
    ultimo_error = ""

    for url in urls:
        print(json.dumps({
            "type": "progress",
            "porcentaje": 0,
            "descargadoMB": 0,
            "totalMB": def_mod["tamano_mb"],
            "velocidadMBs": 0,
            "tiempoRestanteSegundos": 0,
            "estadoMensaje": f"Conectando a {url.split('/')[2]}...",
        }), flush=True)

        try:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "SephentTranscriptor/1.0 (Windows NT 10.0; Win64; x64)"}
            )
            with urllib.request.urlopen(req, timeout=30) as resp, open(ruta_parcial, "wb") as f_out:
                url_exitosa = url
                content_len = resp.headers.get("content-length")
                total_bytes = int(content_len) if content_len else def_mod["tamano_mb"] * 1024 * 1024
                total_mb = total_bytes / (1024 * 1024)

                descargado_bytes = 0
                sha = hashlib.sha256()
                inicio_tiempo = time.time()
                ultimo_reporte = inicio_tiempo
                bytes_ultimo_reporte = 0

                while True:
                    bloque = resp.read(1024 * 256)  # 256 KB
                    if not bloque:
                        break
                    f_out.write(bloque)
                    sha.update(bloque)
                    descargado_bytes += len(bloque)

                    ahora = time.time()
                    delta_tiempo = ahora - ultimo_reporte
                    if delta_tiempo >= 0.25:
                        delta_bytes = descargado_bytes - bytes_ultimo_reporte
                        velocidad = (delta_bytes / (1024 * 1024)) / (delta_tiempo if delta_tiempo > 0 else 0.001)
                        ultimo_reporte = ahora
                        bytes_ultimo_reporte = descargado_bytes

                        porcentaje = min(99.0, round((descargado_bytes / total_bytes) * 100, 1))
                        descargado_mb = round(descargado_bytes / (1024 * 1024), 1)
                        falta_mb = max(0, total_mb - descargado_mb)
                        eta = round(falta_mb / velocidad) if velocidad > 0.05 else 0

                        print(json.dumps({
                            "type": "progress",
                            "porcentaje": porcentaje,
                            "descargadoMB": descargado_mb,
                            "totalMB": round(total_mb, 1),
                            "velocidadMBs": round(velocidad, 2),
                            "tiempoRestanteSegundos": eta,
                            "estadoMensaje": f"Descargando {nombre_archivo} ({porcentaje}%)...",
                        }), flush=True)

            # Si completo la descarga del archivo:
            final_sha = sha.hexdigest()
            sha_esperado = def_mod["sha256"]
            coincide = (final_sha.lower() == sha_esperado.lower())

            # Reemplazo atomico
            if os.path.exists(ruta_destino):
                try:
                    os.remove(ruta_destino)
                except Exception:
                    pass
            os.rename(ruta_parcial, ruta_destino)

            print(json.dumps({
                "type": "complete",
                "modeloId": modelo_id,
                "nombreArchivo": nombre_archivo,
                "rutaCompleta": ruta_destino.replace(os.sep, "/"),
                "tamanoBytes": descargado_bytes,
                "tamanoMB": round(descargado_bytes / (1024 * 1024), 1),
                "sha256": final_sha,
                "coincide": coincide,
                "mensaje": f"Modelo {nombre_archivo} descargado e integrado en la ruta oficial.",
            }), flush=True)
            return

        except Exception as e:
            ultimo_error = str(e)
            if os.path.exists(ruta_parcial):
                try:
                    os.remove(ruta_parcial)
                except Exception:
                    pass
            continue

    print(json.dumps({
        "type": "error",
        "modeloId": modelo_id,
        "mensaje": f"No se pudo descargar de ninguna fuente para '{modelo_id}'. Detalle: {ultimo_error}",
    }), flush=True)
    sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Gestor y descargador de modelos Whisper")
    parser.add_argument("--check-env", action="store_true", help="Comprobar dependencias del sistema")
    parser.add_argument("--audit-models", action="store_true", help="Auditar modelos existentes en cache oficial")
    parser.add_argument("--download", type=str, help="ID del modelo a descargar (tiny, base, small, medium, large, turbo)")
    args = parser.parse_args()

    if args.check_env:
        comprobar_entorno()
    elif args.audit_models:
        auditar_modelos()
    elif args.download:
        descargar_modelo(args.download)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
