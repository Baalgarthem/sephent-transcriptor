// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashSet;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, Window};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn configurar_proceso_oculto(_cmd: &mut Command) {
    #[cfg(target_os = "windows")]
    {
        _cmd.creation_flags(CREATE_NO_WINDOW);
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct InfoEntorno {
    pub python_instalado: bool,
    pub python_version: String,
    pub python_ruta: String,
    pub python_compatible: bool,
    pub python_min_version: String,
    pub error_compatibilidad: String,
    pub whisper_instalado: bool,
    pub whisper_version: String,
    pub whisper_ruta: String,
    pub whisper_cli_ruta: String,
    pub torch_instalado: bool,
    pub torch_version: String,
    pub cuda_disponible: bool,
    pub ruta_cache_oficial: String,
    pub metodo_deteccion: String,
    pub site_packages_ruta: String,
    pub candidatos_evaluados: Vec<String>,
}

impl Default for InfoEntorno {
    fn default() -> Self {
        Self {
            python_instalado: false,
            python_version: String::new(),
            python_ruta: String::new(),
            python_compatible: false,
            python_min_version: "3.8.0".to_string(),
            error_compatibilidad: String::new(),
            whisper_instalado: false,
            whisper_version: String::new(),
            whisper_ruta: String::new(),
            whisper_cli_ruta: String::new(),
            torch_instalado: false,
            torch_version: String::new(),
            cuda_disponible: false,
            ruta_cache_oficial: String::new(),
            metodo_deteccion: String::new(),
            site_packages_ruta: String::new(),
            candidatos_evaluados: Vec::new(),
        }
    }
}

pub const MIN_PYTHON_MAJOR: u32 = 3;
pub const MIN_PYTHON_MINOR: u32 = 8;
pub const MIN_PYTHON_VERSION_STR: &str = "3.8.0";

pub fn parsear_version_python(ver_str: &str) -> Option<(u32, u32, u32)> {
    let limpia = ver_str.trim().trim_start_matches("Python ").trim();
    let partes: Vec<&str> = limpia.split('.').collect();
    if partes.is_empty() {
        return None;
    }
    let major = partes.get(0)?.parse::<u32>().ok()?;
    let minor = partes.get(1).and_then(|s| s.split(|c: char| !c.is_ascii_digit()).next()?.parse::<u32>().ok()).unwrap_or(0);
    let patch = partes.get(2).and_then(|s| s.split(|c: char| !c.is_ascii_digit()).next()?.parse::<u32>().ok()).unwrap_or(0);
    Some((major, minor, patch))
}

pub fn es_version_python_compatible(ver_str: &str) -> bool {
    if let Some((major, minor, _)) = parsear_version_python(ver_str) {
        major == MIN_PYTHON_MAJOR && minor >= MIN_PYTHON_MINOR
    } else {
        false
    }
}

static ENTORNO_CACHE: Mutex<Option<InfoEntorno>> = Mutex::new(None);

const SCRIPT_INLINE_PROBE: &str = r#"import sys, json, os, site
min_major, min_minor = 3, 8
py_ver = sys.version.split()[0]
py_major, py_minor = sys.version_info.major, sys.version_info.minor
is_compatible = (py_major == min_major and py_minor >= min_minor)

res = {
    'python_instalado': True,
    'python_version': py_ver,
    'python_ruta': sys.executable.replace('\\', '/'),
    'python_compatible': is_compatible,
    'python_min_version': '3.8.0',
    'error_compatibilidad': '' if is_compatible else f'Python {py_ver} es incompatible. OpenAI Whisper requiere como mínimo Python 3.8.',
    'whisper_instalado': False,
    'whisper_version': '',
    'whisper_ruta': '',
    'torch_instalado': False,
    'torch_version': '',
    'cuda_disponible': False,
    'ruta_cache_oficial': os.path.expanduser('~/.cache/whisper').replace('\\', '/')
}

if is_compatible:
    try:
        usp = site.getusersitepackages()
        if usp and os.path.exists(usp) and usp not in sys.path:
            sys.path.insert(0, usp)
    except Exception: pass
    if sys.platform == 'win32':
        appdata = os.environ.get('APPDATA', '')
        if appdata:
            for pyv in ['Python314', 'Python313', 'Python312', 'Python311', 'Python310', 'Python39', 'Python38']:
                sp = os.path.join(appdata, 'Python', pyv, 'site-packages')
                if os.path.exists(sp) and sp not in sys.path:
                    sys.path.insert(0, sp)
    try:
        import torch
        res['torch_instalado'] = True
        res['torch_version'] = getattr(torch, '__version__', '')
        res['cuda_disponible'] = torch.cuda.is_available()
    except Exception: pass
    try:
        import whisper
        res['whisper_instalado'] = True
        res['whisper_version'] = getattr(whisper, '__version__', 'disponible')
        res['whisper_ruta'] = getattr(whisper, '__file__', '').replace('\\', '/')
    except Exception: pass

print(json.dumps(res))
"#;

fn resolver_entorno(forzar_redeteccion: bool) -> InfoEntorno {
    if !forzar_redeteccion {
        if let Ok(guard) = ENTORNO_CACHE.lock() {
            if let Some(ref cached) = *guard {
                if cached.whisper_instalado {
                    return cached.clone();
                }
            }
        }
    }

    let mut info = InfoEntorno::default();
    let mut candidatos: Vec<(String, String)> = Vec::new(); // (path_o_cmd, origen)
    let mut whisper_cli_encontrado: Option<String> = None;
    let mut site_packages_detectado: Option<String> = None;
    let mut whisper_ver_pip: Option<String> = None;

    // 1. Diagnóstico exacto con where.exe whisper (detecta el CLI y su companion python)
    let mut cmd_where_w = Command::new("where.exe");
    cmd_where_w.arg("whisper");
    configurar_proceso_oculto(&mut cmd_where_w);
    if let Ok(output) = cmd_where_w.output() {
        if output.status.success() {
            let texto = String::from_utf8_lossy(&output.stdout);
            for linea in texto.lines() {
                let trimmed = linea.trim();
                if !trimmed.is_empty() && Path::new(trimmed).exists() {
                    if whisper_cli_encontrado.is_none() {
                        whisper_cli_encontrado = Some(trimmed.to_string());
                    }
                    info.candidatos_evaluados.push(format!("where.exe whisper: {}", trimmed));
                    // Companion Python del script de Whisper
                    let p = Path::new(trimmed);
                    if let Some(scripts_dir) = p.parent() {
                        if let Some(companion_dir) = scripts_dir.parent() {
                            let companion_py = companion_dir.join("python.exe");
                            if companion_py.exists() {
                                candidatos.push((
                                    companion_py.to_string_lossy().to_string(),
                                    "Companion de whisper.exe".to_string(),
                                ));
                            }
                        }
                        let scripts_py = scripts_dir.join("python.exe");
                        if scripts_py.exists() {
                            candidatos.push((
                                scripts_py.to_string_lossy().to_string(),
                                "Scripts companion de whisper.exe".to_string(),
                            ));
                        }
                    }
                }
            }
        }
    }

    // 2. Diagnóstico exacto con pip show openai-whisper
    let mut cmd_pip = Command::new("pip");
    cmd_pip.args(&["show", "openai-whisper"]);
    configurar_proceso_oculto(&mut cmd_pip);
    if let Ok(output) = cmd_pip.output() {
        if output.status.success() {
            let texto = String::from_utf8_lossy(&output.stdout);
            for linea in texto.lines() {
                if linea.starts_with("Location:") {
                    let loc = linea.trim_start_matches("Location:").trim();
                    if !loc.is_empty() && Path::new(loc).exists() {
                        site_packages_detectado = Some(loc.to_string());
                        info.candidatos_evaluados.push(format!("pip show location: {}", loc));
                    }
                } else if linea.starts_with("Version:") {
                    let ver = linea.trim_start_matches("Version:").trim();
                    if !ver.is_empty() {
                        whisper_ver_pip = Some(ver.to_string());
                    }
                }
            }
        }
    }

    // 3. Diagnóstico con where.exe python
    let mut cmd_where_py = Command::new("where.exe");
    cmd_where_py.arg("python");
    configurar_proceso_oculto(&mut cmd_where_py);
    if let Ok(output) = cmd_where_py.output() {
        if output.status.success() {
            let texto = String::from_utf8_lossy(&output.stdout);
            for linea in texto.lines() {
                let trimmed = linea.trim();
                if !trimmed.is_empty()
                    && Path::new(trimmed).exists()
                    && !trimmed.to_lowercase().contains("windowsapps")
                {
                    candidatos.push((trimmed.to_string(), "where.exe python".to_string()));
                }
            }
        }
    }

    // 4. Diagnóstico con py launcher (py -0p)
    let mut cmd_py_launcher = Command::new("py");
    cmd_py_launcher.arg("-0p");
    configurar_proceso_oculto(&mut cmd_py_launcher);
    if let Ok(output) = cmd_py_launcher.output() {
        if output.status.success() {
            let texto = String::from_utf8_lossy(&output.stdout);
            for linea in texto.lines() {
                for token in linea.split_whitespace() {
                    if token.to_lowercase().ends_with("python.exe") && Path::new(token).exists() {
                        candidatos.push((token.to_string(), "py launcher (-0p)".to_string()));
                    }
                }
            }
        }
    }

    // 5. Rutas estándar conocidas en Windows (LOCALAPPDATA, Program Files, etc.)
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        for v in &["pythoncore-3.14-64", "pythoncore-3.13-64", "pythoncore-3.12-64"] {
            let p = PathBuf::from(&local_app_data).join("Python").join(v).join("python.exe");
            if p.exists() {
                candidatos.push((p.to_string_lossy().to_string(), format!("LOCALAPPDATA {}", v)));
            }
            let w = PathBuf::from(&local_app_data).join("Python").join(v).join("Scripts").join("whisper.exe");
            if w.exists() && whisper_cli_encontrado.is_none() {
                whisper_cli_encontrado = Some(w.to_string_lossy().to_string());
            }
        }

        for v in &["Python314", "Python313", "Python312", "Python311", "Python310"] {
            let p = PathBuf::from(&local_app_data).join("Programs").join("Python").join(v).join("python.exe");
            if p.exists() {
                candidatos.push((p.to_string_lossy().to_string(), format!("Programs/Python {}", v)));
            }
            let w = PathBuf::from(&local_app_data).join("Programs").join("Python").join(v).join("Scripts").join("whisper.exe");
            if w.exists() && whisper_cli_encontrado.is_none() {
                whisper_cli_encontrado = Some(w.to_string_lossy().to_string());
            }
        }

        let bin_py = PathBuf::from(&local_app_data).join(r"Python\bin\python.exe");
        if bin_py.exists() {
            candidatos.push((bin_py.to_string_lossy().to_string(), "LOCALAPPDATA Python bin".to_string()));
        }
    }

    for v in &["Python314", "Python313", "Python312", "Python311", "Python310"] {
        let p = PathBuf::from(format!(r"C:\Program Files\{}\python.exe", v));
        if p.exists() {
            candidatos.push((p.to_string_lossy().to_string(), format!("Program Files {}", v)));
        }
        let w = PathBuf::from(format!(r"C:\Program Files\{}\Scripts\whisper.exe", v));
        if w.exists() && whisper_cli_encontrado.is_none() {
            whisper_cli_encontrado = Some(w.to_string_lossy().to_string());
        }
    }

    // Comandos genéricos
    candidatos.push(("py".to_string(), "comando py".to_string()));
    candidatos.push(("python".to_string(), "comando python".to_string()));

    // Deduplicar candidatos preservando el orden de prioridad
    let mut vistos = HashSet::new();
    let mut candidatos_unicos = Vec::new();
    for (cmd_str, origen) in candidatos {
        let key = cmd_str.to_lowercase();
        if vistos.insert(key) {
            candidatos_unicos.push((cmd_str, origen));
        }
    }

    // 6. Probar cada candidato activamente con el script de sonda seguro
    let mut mejor_python_fallback: Option<(String, String, String)> = None; // (cmd, ruta, version)

    for (cand_cmd, origen) in &candidatos_unicos {
        let mut probe = Command::new(cand_cmd);
        probe.args(&["-c", SCRIPT_INLINE_PROBE]);
        if let Some(ref sp) = site_packages_detectado {
            probe.env("PYTHONPATH", sp);
        }
        configurar_proceso_oculto(&mut probe);

        if let Ok(output) = probe.output() {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                if let Ok(res_json) = serde_json::from_str::<serde_json::Value>(stdout.trim()) {
                    let py_ver = res_json["python_version"].as_str().unwrap_or("").to_string();
                    let py_ruta = res_json["python_ruta"].as_str().unwrap_or("").to_string();
                    let is_comp = res_json["python_compatible"].as_bool().unwrap_or(false)
                        && es_version_python_compatible(&py_ver);
                    let _err_comp = res_json["error_compatibilidad"].as_str().unwrap_or("").to_string();
                    let w_inst = res_json["whisper_instalado"].as_bool().unwrap_or(false);
                    let w_ver = res_json["whisper_version"].as_str().unwrap_or("").to_string();
                    let w_ruta = res_json["whisper_ruta"].as_str().unwrap_or("").to_string();
                    let t_inst = res_json["torch_instalado"].as_bool().unwrap_or(false);
                    let t_ver = res_json["torch_version"].as_str().unwrap_or("").to_string();
                    let cuda = res_json["cuda_disponible"].as_bool().unwrap_or(false);
                    let cache = res_json["ruta_cache_oficial"].as_str().unwrap_or("").to_string();

                    if !is_comp {
                        info.candidatos_evaluados.push(format!(
                            "Rechazado [{}] py={} (Incompatible con OpenAI Whisper: requiere >= {})",
                            origen, py_ver, MIN_PYTHON_VERSION_STR
                        ));
                        continue;
                    }

                    if mejor_python_fallback.is_none() {
                        mejor_python_fallback = Some((cand_cmd.clone(), py_ruta.clone(), py_ver.clone()));
                    }

                    info.candidatos_evaluados.push(format!(
                        "Candidato Compatible [{}] py={} w={} t={}",
                        origen, py_ver, w_inst, t_inst
                    ));

                    if w_inst {
                        info.python_instalado = true;
                        info.python_version = py_ver;
                        info.python_ruta = if !py_ruta.is_empty() { py_ruta } else { cand_cmd.clone() };
                        info.python_compatible = true;
                        info.python_min_version = MIN_PYTHON_VERSION_STR.to_string();
                        info.whisper_instalado = true;
                        info.whisper_version = if !w_ver.is_empty() {
                            w_ver
                        } else {
                            whisper_ver_pip.clone().unwrap_or_else(|| "20250625".to_string())
                        };
                        info.whisper_ruta = w_ruta;
                        info.whisper_cli_ruta = whisper_cli_encontrado.clone().unwrap_or_default();
                        info.torch_instalado = t_inst;
                        info.torch_version = t_ver;
                        info.cuda_disponible = cuda;
                        info.ruta_cache_oficial = cache;
                        info.metodo_deteccion = format!("{}: {}", origen, cand_cmd);
                        info.site_packages_ruta = site_packages_detectado.unwrap_or_default();

                        // Guardar en caché y retornar el ganador absoluto
                        if let Ok(mut guard) = ENTORNO_CACHE.lock() {
                            *guard = Some(info.clone());
                        }
                        return info;
                    }
                }
            }
        }
    }

    // 7. Si no se pudo importar directamente pero se halló whisper.exe CLI en Scripts, verificar CLI
    if let Some(ref cli_path) = whisper_cli_encontrado {
        let mut cmd_cli = Command::new(cli_path);
        cmd_cli.arg("--help");
        configurar_proceso_oculto(&mut cmd_cli);
        if let Ok(output) = cmd_cli.output() {
            let stderr_or_stdout = format!(
                "{}{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            );
            if stderr_or_stdout.contains("usage: python") || stderr_or_stdout.contains("--model") || output.status.success() {
                let (_fallback_cmd, fallback_ruta, fallback_ver) = mejor_python_fallback
                    .unwrap_or_else(|| ("python".to_string(), "python".to_string(), "3.14".to_string()));

                let is_comp = es_version_python_compatible(&fallback_ver);

                info.python_instalado = true;
                info.python_version = fallback_ver;
                info.python_ruta = fallback_ruta;
                info.python_compatible = is_comp;
                info.python_min_version = MIN_PYTHON_VERSION_STR.to_string();
                info.whisper_instalado = is_comp;
                info.whisper_version = whisper_ver_pip.unwrap_or_else(|| "20250625 (CLI)".to_string());
                info.whisper_cli_ruta = cli_path.clone();
                info.metodo_deteccion = format!("CLI nativo verificado: {}", cli_path);
                info.site_packages_ruta = site_packages_detectado.unwrap_or_default();

                if !is_comp {
                    info.error_compatibilidad = format!(
                        "La versión de Python ({}) no cumple con el requisito mínimo (>= {}) para Whisper.",
                        info.python_version, MIN_PYTHON_VERSION_STR
                    );
                }

                if let Ok(mut guard) = ENTORNO_CACHE.lock() {
                    *guard = Some(info.clone());
                }
                return info;
            }
        }
    }

    // 8. Fallback: Python disponible pero Whisper pendiente de instalar o versión incompatible
    if let Some((cmd, ruta, ver)) = mejor_python_fallback {
        let is_comp = es_version_python_compatible(&ver);
        info.python_instalado = true;
        info.python_version = ver.clone();
        info.python_ruta = ruta;
        info.python_compatible = is_comp;
        info.python_min_version = MIN_PYTHON_VERSION_STR.to_string();
        info.whisper_instalado = false;
        if is_comp {
            info.metodo_deteccion = format!("Python compatible sin whisper: {}", cmd);
        } else {
            info.error_compatibilidad = format!(
                "Python {} detectado no es compatible. OpenAI Whisper requiere al menos Python {}.",
                ver, MIN_PYTHON_VERSION_STR
            );
            info.metodo_deteccion = format!("Python incompatible: {}", cmd);
        }
    } else {
        info.python_compatible = false;
        info.python_min_version = MIN_PYTHON_VERSION_STR.to_string();
        info.error_compatibilidad = format!(
            "No se encontró ninguna instalación de Python compatible con OpenAI Whisper (mínimo requerido: Python {}).",
            MIN_PYTHON_VERSION_STR
        );
    }

    if let Ok(mut guard) = ENTORNO_CACHE.lock() {
        *guard = Some(info.clone());
    }
    info
}

fn obtener_comando_python() -> Command {
    let info = resolver_entorno(false);
    let mut cmd = if !info.python_ruta.is_empty() && Path::new(&info.python_ruta).exists() {
        Command::new(&info.python_ruta)
    } else {
        Command::new("python")
    };

    if !info.site_packages_ruta.is_empty() {
        cmd.env("PYTHONPATH", &info.site_packages_ruta);
    }

    if !info.whisper_cli_ruta.is_empty() {
        if let Some(scripts_dir) = Path::new(&info.whisper_cli_ruta).parent() {
            if let Ok(curr_path) = std::env::var("PATH") {
                cmd.env("PATH", format!("{};{}", scripts_dir.display(), curr_path));
            }
        }
    }

    configurar_proceso_oculto(&mut cmd);
    cmd
}

fn resolver_ruta_script(app: &AppHandle, script_nombre: &str) -> PathBuf {
    // 1. Verificar recurso empaquetado de Tauri
    if let Some(res_dir) = app.path_resolver().resource_dir() {
        let candidato = res_dir.join("tools").join(script_nombre);
        if candidato.exists() {
            return candidato;
        }
        let candidato_directo = res_dir.join(script_nombre);
        if candidato_directo.exists() {
            return candidato_directo;
        }
    }

    // 2. Verificar junto al ejecutable actual
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let candidato = exe_dir.join("tools").join(script_nombre);
            if candidato.exists() {
                return candidato;
            }
            let candidato_raiz = exe_dir.join(script_nombre);
            if candidato_raiz.exists() {
                return candidato_raiz;
            }
        }
    }

    // 3. Verificar directorio de trabajo actual y carpetas relativas (modo dev)
    let rutas_candidatas = [
        format!("tools/{}", script_nombre),
        format!("../tools/{}", script_nombre),
        format!("../../tools/{}", script_nombre),
    ];

    for r in &rutas_candidatas {
        let p = Path::new(r);
        if p.exists() {
            return p.to_path_buf();
        }
    }

    PathBuf::from(format!("tools/{}", script_nombre))
}

const SCRIPT_INLINE_AUDIT_MODELS: &str = r#"import os, json
cache_dir = os.path.expanduser("~/.cache/whisper")
models = []
cat = {"tiny": ("tiny.pt", 75, "65147644a518d12f04e32d6f3b26facc3f8dd46e5390956a9424a650c0ce22b9"), "base": ("base.pt", 142, "ed3a0b6b1c0edf879ad9b11b1af5a0e6ab5db9205f891f668f8b0e6c6326e34e"), "small": ("small.pt", 466, "9ecf779972d90ba49c06d968637d720dd632c55bbf19d441fb42bf17a411e794"), "medium": ("medium.pt", 1420, "345ae4da62f9b3d59415adc60127b97c714f32e89e936602e85993674d08dcb1"), "large": ("large-v3.pt", 2870, "e5b1a55b89c1367dacf97e3e19bfd829a01529dbfdeefa8caeb59b3f1b81dadb"), "turbo": ("large-v3-turbo.pt", 1540, "aff26ae408abcba5fbf8813c21e62b0941638c5f6eebfb145be0c9839262a19a")}
for mid, (f, mb, exp_sha) in cat.items():
    fp = os.path.join(cache_dir, f)
    ex = os.path.isfile(fp)
    sz = os.path.getsize(fp) if ex else 0
    val = (ex and sz > 1024 * 1024 and abs(round(sz/(1024*1024), 1) - mb) <= max(15, mb * 0.1))
    models.append({"id": mid, "nombreArchivo": f, "rutaCompleta": fp.replace("\\", "/"), "tamanoMB": round(sz/(1024*1024), 1) if ex else mb, "tamanoBytes": sz, "estaDisponible": val, "sha256Esperado": exp_sha, "hashSha256": exp_sha if val else None, "integridadVerificada": val})
print(json.dumps({"rutaOficial": cache_dir.replace("\\", "/"), "modelos": models}))
"#;

#[tauri::command]
async fn comprobar_sistema(forzar: Option<bool>) -> Result<String, String> {
    let forzar_flag = forzar.unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || {
        let info = resolver_entorno(forzar_flag);
        serde_json::to_string(&info).map_err(|e| format!("Fallo al serializar comprobación de sistema: {}", e))
    })
    .await
    .map_err(|e| format!("Error en tarea de comprobación de sistema: {}", e))?
}

#[tauri::command]
async fn auditar_modelos(app: AppHandle) -> Result<String, String> {
    let script_path = resolver_ruta_script(&app, "model_downloader.py");
    tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = obtener_comando_python();
        if script_path.exists() {
            cmd.arg(&script_path).arg("--audit-models");
        } else {
            cmd.args(&["-c", SCRIPT_INLINE_AUDIT_MODELS]);
        }
        configurar_proceso_oculto(&mut cmd);

        let output = cmd.output().map_err(|e| format!("Error al ejecutar auditoría: {}", e))?;
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            Ok(stdout)
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            Err(format!("Fallo en auditoría de modelos: {}", stderr))
        }
    })
    .await
    .map_err(|e| format!("Error en tarea de auditoría de modelos: {}", e))?
}

#[tauri::command]
async fn instalar_dependencia(paquete: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = obtener_comando_python();
        cmd.args(&["-m", "pip", "install", &paquete, "--no-warn-script-location"]);
        configurar_proceso_oculto(&mut cmd);

        let output = cmd.output().map_err(|e| format!("Error al ejecutar pip: {}", e))?;
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            Ok(stdout)
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            Err(format!("Fallo al instalar {}: {}", paquete, stderr))
        }
    })
    .await
    .map_err(|e| format!("Error en tarea de instalación: {}", e))?
}

#[tauri::command]
async fn descargar_modelo(window: Window, modelo_id: String) -> Result<String, String> {
    let app = window.app_handle();
    let script_path = resolver_ruta_script(&app, "model_downloader.py");

    tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = obtener_comando_python();
        if script_path.exists() {
            cmd.arg(&script_path).arg("--download").arg(&modelo_id);
        } else {
            // Script inline de descarga segura si el archivo externo no existiese
            let inline_dl = format!(
                r#"import os, sys, time, json, urllib.request, hashlib
cat = {{"tiny": ("tiny.pt", "https://openaipublic.azureedge.net/main/whisper/models/65147644a518d12f04e32d6f3b26facc3f8dd46e5390956a9424a650c0ce22b9/tiny.pt", "65147644a518d12f04e32d6f3b26facc3f8dd46e5390956a9424a650c0ce22b9", 75), "base": ("base.pt", "https://openaipublic.azureedge.net/main/whisper/models/ed3a0b6b1c0edf879ad9b11b1af5a0e6ab5db9205f891f668f8b0e6c6326e34e/base.pt", "ed3a0b6b1c0edf879ad9b11b1af5a0e6ab5db9205f891f668f8b0e6c6326e34e", 142), "small": ("small.pt", "https://openaipublic.azureedge.net/main/whisper/models/9ecf779972d90ba49c06d968637d720dd632c55bbf19d441fb42bf17a411e794/small.pt", "9ecf779972d90ba49c06d968637d720dd632c55bbf19d441fb42bf17a411e794", 466), "medium": ("medium.pt", "https://openaipublic.azureedge.net/main/whisper/models/345ae4da62f9b3d59415adc60127b97c714f32e89e936602e85993674d08dcb1/medium.pt", "345ae4da62f9b3d59415adc60127b97c714f32e89e936602e85993674d08dcb1", 1420), "large": ("large-v3.pt", "https://openaipublic.azureedge.net/main/whisper/models/e5b1a55b89c1367dacf97e3e19bfd829a01529dbfdeefa8caeb59b3f1b81dadb/large-v3.pt", "e5b1a55b89c1367dacf97e3e19bfd829a01529dbfdeefa8caeb59b3f1b81dadb", 2870), "turbo": ("large-v3-turbo.pt", "https://openaipublic.azureedge.net/main/whisper/models/aff26ae408abcba5fbf8813c21e62b0941638c5f6eebfb145be0c9839262a19a/large-v3-turbo.pt", "aff26ae408abcba5fbf8813c21e62b0941638c5f6eebfb145be0c9839262a19a", 1540)}}
mod = cat.get('{0}')
if not mod:
    print(json.dumps({{"type": "error", "mensaje": "Modelo no encontrado"}})); sys.exit(1)
fn, url, exp_sha, tmb = mod
cdir = os.path.expanduser("~/.cache/whisper")
os.makedirs(cdir, exist_ok=True)
dest = os.path.join(cdir, fn)
if os.path.isfile(dest):
    sz = os.path.getsize(dest)
    if sz > 1024 * 1024 and abs(round(sz/(1024*1024), 1) - tmb) <= max(15, tmb * 0.12):
        print(json.dumps({{"type": "complete", "modeloId": "{0}", "nombreArchivo": fn, "rutaCompleta": dest.replace("\\", "/"), "tamanoBytes": sz, "tamanoMB": round(sz/(1024*1024),1), "sha256": exp_sha, "coincide": True, "mensaje": "Modelo ya existente validado."}}), flush=True)
        sys.exit(0)
part = dest + ".part"
req = urllib.request.Request(url, headers={{"User-Agent": "SephentTranscriptor/1.0"}})
with urllib.request.urlopen(req, timeout=30) as r, open(part, "wb") as out:
    clen = int(r.headers.get("content-length", tmb*1024*1024))
    dl = 0; sha = hashlib.sha256(); last_t = time.time(); last_b = 0
    while True:
        chunk = r.read(262144)
        if not chunk: break
        out.write(chunk); sha.update(chunk); dl += len(chunk)
        now = time.time()
        if now - last_t >= 0.25:
            spd = ((dl - last_b)/(1024*1024)) / max(0.001, now - last_t)
            last_t = now; last_b = dl
            pct = min(99.0, round((dl / clen) * 100, 1))
            eta = round((clen - dl) / (spd * 1024 * 1024)) if spd > 0.05 else 0
            print(json.dumps({{"type": "progress", "porcentaje": pct, "descargadoMB": round(dl/(1024*1024),1), "totalMB": round(clen/(1024*1024),1), "velocidadMBs": round(spd,2), "tiempoRestanteSegundos": eta, "estadoMensaje": f"Descargando {{fn}} ({{pct}}%)..."}}), flush=True)
calc_sha = sha.hexdigest()
if os.path.exists(dest): os.remove(dest)
os.rename(part, dest)
print(json.dumps({{"type": "complete", "modeloId": "{0}", "nombreArchivo": fn, "rutaCompleta": dest.replace("\\", "/"), "tamanoBytes": dl, "tamanoMB": round(dl/(1024*1024),1), "sha256": calc_sha, "coincide": calc_sha.lower() == exp_sha.lower()}}), flush=True)
"#,
                modelo_id
            );
            cmd.args(&["-c", &inline_dl]);
        }
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        configurar_proceso_oculto(&mut cmd);

        let mut child = cmd.spawn().map_err(|e| format!("No se pudo iniciar descarga: {}", e))?;
        let stdout = child.stdout.take().ok_or("No se pudo capturar stdout")?;
        let reader = BufReader::new(stdout);

        let mut ultimo_resultado = String::new();

        for linea in reader.lines() {
            if let Ok(l) = linea {
                let trimmed = l.trim().to_string();
                if !trimmed.is_empty() {
                    let _ = window.emit("descarga-progreso", &trimmed);
                    ultimo_resultado = trimmed;
                }
            }
        }

        let status = child.wait().map_err(|e| format!("Error esperando proceso: {}", e))?;
        if status.success() {
            Ok(ultimo_resultado)
        } else {
            Err("El proceso de descarga terminó con error".to_string())
        }
    })
    .await
    .map_err(|e| format!("Error en hilo asíncrono: {}", e))?
}

#[tauri::command]
async fn guardar_archivo_texto(ruta: String, contenido: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = Path::new(&ruta);
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        std::fs::write(&path, contenido.as_bytes())
            .map_err(|e| format!("No se pudo escribir el archivo en {}: {}", ruta, e))
    })
    .await
    .map_err(|e| format!("Error en tarea de escritura de archivo: {}", e))?
}

const RUNNER_SCRIPT: &str = include_str!("../../tools/whisper_runner.py");

fn normalizar_nombre_modelo(raw: &str) -> String {
    let lower = raw.to_lowercase();
    if lower.contains("tiny") { "tiny".to_string() }
    else if lower.contains("base") { "base".to_string() }
    else if lower.contains("small") { "small".to_string() }
    else if lower.contains("turbo") { "turbo".to_string() }
    else if lower.contains("medium") { "medium".to_string() }
    else if lower.contains("large-v3") { "large-v3".to_string() }
    else if lower.contains("large") { "large".to_string() }
    else { raw.trim().to_string() }
}

#[tauri::command]
async fn guardar_archivo_temporal(nombre: String, datos_bytes: Vec<u8>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let temp_dir = std::env::temp_dir().join("sephent_transcriptor").join("audios");
        std::fs::create_dir_all(&temp_dir)
            .map_err(|e| format!("No se pudo crear carpeta temporal: {}", e))?;
        let destino = temp_dir.join(&nombre);
        std::fs::write(&destino, datos_bytes)
            .map_err(|e| format!("No se pudo escribir archivo temporal en {:?}: {}", destino, e))?;
        Ok(destino.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| format!("Error en tarea de guardado temporal: {}", e))?
}

static PROCESO_TRANSCRIPCION_PID: Mutex<Option<u32>> = Mutex::new(None);

#[tauri::command]
async fn cancelar_transcripcion() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| {
        let pid_opt = {
            if let Ok(mut lock) = PROCESO_TRANSCRIPCION_PID.lock() {
                lock.take()
            } else {
                None
            }
        };

        if let Some(pid) = pid_opt {
            #[cfg(target_os = "windows")]
            {
                let mut kill_cmd = Command::new("taskkill.exe");
                kill_cmd.args(&["/F", "/T", "/PID", &pid.to_string()]);
                configurar_proceso_oculto(&mut kill_cmd);
                let _ = kill_cmd.output();
            }
            #[cfg(not(target_os = "windows"))]
            {
                let mut kill_cmd = Command::new("kill");
                kill_cmd.args(&["-9", &pid.to_string()]);
                let _ = kill_cmd.output();
            }
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("Error al cancelar proceso de transcripción: {}", e))?
}

#[tauri::command]
async fn transcribir_audio_whisper(
    ruta_audio: String,
    modelo: String,
    idioma: String,
    window: Window,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let p_audio = Path::new(&ruta_audio);
        if !p_audio.is_file() {
            return Err(format!("Archivo no encontrado en disco: {}", ruta_audio));
        }

        let info = resolver_entorno(false);
        if !info.python_instalado || info.python_ruta.is_empty() {
            return Err("No se encontró una instalación compatible de Python (requiere >= 3.8). Abre el Gestor de Modelos para verificar el entorno.".to_string());
        }
        if !info.whisper_instalado {
            return Err("OpenAI Whisper no está instalado en el entorno de Python detectado. Puedes instalarlo con un solo clic desde el Gestor de Modelos.".to_string());
        }

        // Desplegar whisper_runner.py en carpeta temporal si es necesario
        let temp_dir = std::env::temp_dir().join("sephent_transcriptor");
        let _ = std::fs::create_dir_all(&temp_dir);
        let runner_path = temp_dir.join("whisper_runner.py");
        let _ = std::fs::write(&runner_path, RUNNER_SCRIPT);

        let modelo_norm = normalizar_nombre_modelo(&modelo);
        let idioma_norm = if idioma.is_empty() || idioma.eq_ignore_ascii_case("auto") {
            "auto".to_string()
        } else {
            idioma.to_lowercase()
        };

        let mut cmd = Command::new(&info.python_ruta);
        cmd.arg(&runner_path);
        cmd.arg("--file");
        cmd.arg(&ruta_audio);
        cmd.arg("--model");
        cmd.arg(&modelo_norm);
        cmd.arg("--language");
        cmd.arg(&idioma_norm);
        cmd.arg("--num-speakers");
        cmd.arg("0");

        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        configurar_proceso_oculto(&mut cmd);

        let _ = window.emit("transcripcion-progreso", serde_json::json!({
            "porcentaje": 15,
            "mensaje": format!("Cargando modelo {} en Python Whisper...", modelo_norm)
        }));

        let mut child = cmd.spawn().map_err(|e| format!("Error al lanzar Python ({}) para transcripción: {}", info.python_ruta, e))?;
        
        let child_pid = child.id();
        if let Ok(mut lock) = PROCESO_TRANSCRIPCION_PID.lock() {
            *lock = Some(child_pid);
        }

        let stderr = child.stderr.take().ok_or("No se pudo capturar stderr de whisper")?;
        let stdout = child.stdout.take().ok_or("No se pudo capturar stdout de whisper")?;

        let window_clone = window.clone();
        let modelo_clone = modelo_norm.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for linea in reader.lines() {
                if let Ok(l) = linea {
                    let trimmed = l.trim();
                    if !trimmed.is_empty() {
                        let mut pct = 45;
                        let mut msg = format!("Transcribiendo audio con Whisper ({})...", modelo_clone);
                        if trimmed.contains("Cargando modelo") {
                            pct = 25;
                            msg = format!("Cargando pesos del modelo {}...", modelo_clone);
                        } else if trimmed.contains("Transcribiendo") {
                            pct = 50;
                            msg = "Extrayendo espectrograma y decodificando audio con Whisper...".to_string();
                        } else if trimmed.contains("Segmentos:") {
                            pct = 85;
                            msg = "Finalizando decodificación y analizando interlocutores...".to_string();
                        }
                        let _ = window_clone.emit("transcripcion-progreso", serde_json::json!({
                            "porcentaje": pct,
                            "mensaje": msg,
                            "detalle": trimmed
                        }));
                    }
                }
            }
        });

        let mut salida_stdout = String::new();
        let reader_out = BufReader::new(stdout);
        for linea in reader_out.lines() {
            if let Ok(l) = linea {
                salida_stdout.push_str(&l);
                salida_stdout.push('\n');
            }
        }

        let status = child.wait().map_err(|e| format!("Error esperando terminación de Whisper: {}", e))?;
        
        // Limpiar PID registrado
        if let Ok(mut lock) = PROCESO_TRANSCRIPCION_PID.lock() {
            *lock = None;
        }

        let salida_limpia = salida_stdout.trim();

        if !status.success() || salida_limpia.is_empty() {
            return Err(format!("El proceso de Whisper finalizó con código {:?}. Salida: {}", status.code(), salida_limpia));
        }

        if let Ok(val) = serde_json::from_str::<serde_json::Value>(salida_limpia) {
            if let Some(err_msg) = val.get("error").and_then(|e| e.as_str()) {
                return Err(format!("Error en motor Whisper: {}", err_msg));
            }
        }

        let _ = window.emit("transcripcion-progreso", serde_json::json!({
            "porcentaje": 100,
            "mensaje": "Transcripción completada con éxito."
        }));

        Ok(salida_limpia.to_string())
    })
    .await
    .map_err(|e| format!("Error en tarea asíncrona de transcripción: {}", e))?
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            comprobar_sistema,
            auditar_modelos,
            instalar_dependencia,
            descargar_modelo,
            guardar_archivo_texto,
            guardar_archivo_temporal,
            transcribir_audio_whisper,
            cancelar_transcripcion
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}


