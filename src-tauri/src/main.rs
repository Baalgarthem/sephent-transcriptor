// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashSet;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
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
    pub python_recomendada: bool,
    pub python_min_version: String,
    pub python_max_version: String,
    pub python_version_recomendada: String,
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
            python_recomendada: false,
            python_min_version: "3.8.0".to_string(),
            python_max_version: "3.13.x".to_string(),
            python_version_recomendada: "3.11 o 3.12".to_string(),
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
pub const MAX_PYTHON_MINOR: u32 = 13;
pub const MAX_PYTHON_VERSION_STR: &str = "3.13.x";
pub const RECOMMENDED_PYTHON_VERSION_STR: &str = "3.11 o 3.12";

pub fn parsear_version_python(ver_str: &str) -> Option<(u32, u32, u32)> {
    let limpia = ver_str.trim().trim_start_matches("Python ").trim();
    let partes: Vec<&str> = limpia.split('.').collect();
    if partes.is_empty() {
        return None;
    }
    let major = partes.first()?.parse::<u32>().ok()?;
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

pub fn es_version_python_recomendada(ver_str: &str) -> bool {
    if let Some((major, minor, _)) = parsear_version_python(ver_str) {
        major == 3 && (minor == 11 || minor == 12)
    } else {
        false
    }
}

/// Asigna una puntuación técnica a cada instalación de Python para priorizar preferentemente 3.11 y 3.12
pub fn calcular_puntuacion_candidato(ver_str: &str, whisper_instalado: bool, torch_instalado: bool) -> i32 {
    let mut score = 0;
    if let Some((major, minor, _)) = parsear_version_python(ver_str) {
        if major == 3 && minor >= 8 {
            match minor {
                11 => score += 100, // Preferida: máxima estabilidad y compatibilidad con PyTorch, Numba, NumPy y TikToken
                12 => score += 95,  // Moderna y recomendada oficial por el ecosistema científico
                10 => score += 80,  // Madura y muy estable
                9  => score += 70,  // Estable
                8  => score += 60,  // Mínima soportada
                13 => score += 55,  // Soportada en metadata oficial
                _  => score += 50,  // Soportada si cuenta con dependencias nativas compiladas
            }
        } else {
            score -= 200;
        }
    } else {
        score -= 200;
    }

    if whisper_instalado {
        score += 100;
    }
    if torch_instalado {
        score += 50;
    }
    score
}

static ENTORNO_CACHE: Mutex<Option<InfoEntorno>> = Mutex::new(None);

const SCRIPT_INLINE_PROBE: &str = r#"import sys, json, os, site
py_ver = sys.version.split()[0]
py_major, py_minor = sys.version_info.major, sys.version_info.minor
is_compatible = (py_major == 3 and py_minor >= 8)
is_recommended = (py_major == 3 and (py_minor == 11 or py_minor == 12))

err_msg = ""
if not is_compatible:
    err_msg = f"Python {py_ver} es incompatible. OpenAI Whisper requiere como mínimo Python 3.8. Se recomienda preferentemente Python 3.11 o Python 3.12."

res = {
    'python_instalado': True,
    'python_version': py_ver,
    'python_ruta': sys.executable.replace('\\', '/'),
    'python_compatible': is_compatible,
    'python_recomendada': is_recommended,
    'python_min_version': '3.8.0',
    'python_max_version': '3.13.x',
    'python_version_recomendada': '3.11 o 3.12',
    'error_compatibilidad': err_msg,
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
                if cached.python_instalado {
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
    cmd_pip.args(["show", "openai-whisper"]);
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
        for v in &["pythoncore-3.11-64", "pythoncore-3.12-64", "pythoncore-3.10-64", "pythoncore-3.9-64", "pythoncore-3.8-64", "pythoncore-3.13-64", "pythoncore-3.14-64"] {
            let p = PathBuf::from(&local_app_data).join("Python").join(v).join("python.exe");
            if p.exists() {
                candidatos.push((p.to_string_lossy().to_string(), format!("LOCALAPPDATA {}", v)));
            }
            let w = PathBuf::from(&local_app_data).join("Python").join(v).join("Scripts").join("whisper.exe");
            if w.exists() && whisper_cli_encontrado.is_none() {
                whisper_cli_encontrado = Some(w.to_string_lossy().to_string());
            }
        }

        for v in &["Python311", "Python312", "Python310", "Python39", "Python38", "Python313", "Python314"] {
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

    for v in &["Python311", "Python312", "Python310", "Python39", "Python38", "Python313", "Python314"] {
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
    let mut mejor_candidato_info: Option<(i32, InfoEntorno)> = None;
    let mut primer_incompatible: Option<(String, String)> = None; // (version, ruta)

    for (cand_cmd, origen) in &candidatos_unicos {
        let mut probe = Command::new(cand_cmd);
        probe.args(["-c", SCRIPT_INLINE_PROBE]);
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
                    let w_inst = res_json["whisper_instalado"].as_bool().unwrap_or(false);
                    let w_ver = res_json["whisper_version"].as_str().unwrap_or("").to_string();
                    let w_ruta = res_json["whisper_ruta"].as_str().unwrap_or("").to_string();
                    let t_inst = res_json["torch_instalado"].as_bool().unwrap_or(false);
                    let t_ver = res_json["torch_version"].as_str().unwrap_or("").to_string();
                    let cuda = res_json["cuda_disponible"].as_bool().unwrap_or(false);
                    let cache = res_json["ruta_cache_oficial"].as_str().unwrap_or("").to_string();

                    if !is_comp {
                        if primer_incompatible.is_none() {
                            primer_incompatible = Some((py_ver.clone(), py_ruta.clone()));
                        }
                        info.candidatos_evaluados.push(format!(
                            "Rechazado [{}] py={} (Incompatible con OpenAI Whisper: requiere {} - {}, preferente {})",
                            origen, py_ver, MIN_PYTHON_VERSION_STR, MAX_PYTHON_VERSION_STR, RECOMMENDED_PYTHON_VERSION_STR
                        ));
                        continue;
                    }

                    let is_recom = es_version_python_recomendada(&py_ver);
                    let score = calcular_puntuacion_candidato(&py_ver, w_inst, t_inst);

                    info.candidatos_evaluados.push(format!(
                        "Candidato Compatible [{}] py={} (score={}) recom={} w={} t={}",
                        origen, py_ver, score, is_recom, w_inst, t_inst
                    ));

                    let mut cand_info = info.clone();
                    cand_info.python_instalado = true;
                    cand_info.python_version = py_ver.clone();
                    cand_info.python_ruta = if !py_ruta.is_empty() { py_ruta.clone() } else { cand_cmd.clone() };
                    cand_info.python_compatible = true;
                    cand_info.python_recomendada = is_recom;
                    cand_info.python_min_version = MIN_PYTHON_VERSION_STR.to_string();
                    cand_info.python_max_version = MAX_PYTHON_VERSION_STR.to_string();
                    cand_info.python_version_recomendada = RECOMMENDED_PYTHON_VERSION_STR.to_string();
                    cand_info.whisper_instalado = w_inst;
                    cand_info.whisper_version = if !w_ver.is_empty() {
                        w_ver
                    } else if w_inst {
                        whisper_ver_pip.clone().unwrap_or_else(|| "20250625".to_string())
                    } else {
                        String::new()
                    };
                    cand_info.whisper_ruta = w_ruta;
                    cand_info.whisper_cli_ruta = whisper_cli_encontrado.clone().unwrap_or_default();
                    cand_info.torch_instalado = t_inst;
                    cand_info.torch_version = t_ver;
                    cand_info.cuda_disponible = cuda;
                    cand_info.ruta_cache_oficial = cache;
                    cand_info.metodo_deteccion = format!("{}: {}", origen, cand_cmd);
                    cand_info.site_packages_ruta = site_packages_detectado.clone().unwrap_or_default();

                    let mejor = match &mejor_candidato_info {
                        None => true,
                        Some((mejor_score, _)) => score > *mejor_score,
                    };

                    if mejor {
                        mejor_candidato_info = Some((score, cand_info));
                    }

                    // Si encontramos una versión con Whisper ya instalado y compatible (Python >= 3.8), es óptima y detenemos la búsqueda
                    if w_inst && is_comp {
                        break;
                    }
                }
            }
        }
    }

    // 7. Si encontramos un candidato compatible ganador
    if let Some((_score, mut mejor)) = mejor_candidato_info {
        mejor.candidatos_evaluados = info.candidatos_evaluados;
        if mejor.whisper_instalado {
            if let Ok(mut guard) = ENTORNO_CACHE.lock() {
                *guard = Some(mejor.clone());
            }
            return mejor;
        }

        // Si Python es compatible pero whisper.py no importó directo, comprobar whisper.exe CLI
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
                    mejor.whisper_instalado = true;
                    if mejor.whisper_version.is_empty() {
                        mejor.whisper_version = whisper_ver_pip.unwrap_or_else(|| "20250625 (CLI)".to_string());
                    }
                    mejor.whisper_cli_ruta = cli_path.clone();
                    mejor.metodo_deteccion = format!("CLI nativo verificado con Python {}: {}", mejor.python_version, cli_path);
                    if let Ok(mut guard) = ENTORNO_CACHE.lock() {
                        *guard = Some(mejor.clone());
                    }
                    return mejor;
                }
            }
        }

        // Python compatible encontrado pero Whisper aún no instalado
        mejor.metodo_deteccion = format!("Python {} compatible sin Whisper", mejor.python_version);
        if let Ok(mut guard) = ENTORNO_CACHE.lock() {
            *guard = Some(mejor.clone());
        }
        return mejor;
    }

    // 8. Fallback: Si no hubo ningún candidato compatible en 3.8-3.13
    if let Some((incomp_ver, incomp_ruta)) = primer_incompatible {
        info.python_instalado = true;
        info.python_version = incomp_ver.clone();
        info.python_ruta = incomp_ruta;
        info.python_compatible = false;
        info.python_min_version = MIN_PYTHON_VERSION_STR.to_string();
        info.python_max_version = MAX_PYTHON_VERSION_STR.to_string();
        info.python_version_recomendada = RECOMMENDED_PYTHON_VERSION_STR.to_string();
        info.whisper_instalado = false;
        info.error_compatibilidad = format!(
            "Python {} detectado no es compatible con el stack de OpenAI Whisper. Las dependencias científicas (PyTorch, Numba, NumPy, TikToken) requieren Python entre {} y {}. Se recomienda instalar preferentemente Python {}.",
            incomp_ver, MIN_PYTHON_VERSION_STR, MAX_PYTHON_VERSION_STR, RECOMMENDED_PYTHON_VERSION_STR
        );
        info.metodo_deteccion = "Python fuera de rango detectado".to_string();
    } else {
        info.python_compatible = false;
        info.python_min_version = MIN_PYTHON_VERSION_STR.to_string();
        info.python_max_version = MAX_PYTHON_VERSION_STR.to_string();
        info.python_version_recomendada = RECOMMENDED_PYTHON_VERSION_STR.to_string();
        info.whisper_instalado = false;
        info.error_compatibilidad = format!(
            "No se encontró ninguna instalación de Python compatible con OpenAI Whisper (rango requerido: {} a {}, recomendado preferentemente: {}).",
            MIN_PYTHON_VERSION_STR, MAX_PYTHON_VERSION_STR, RECOMMENDED_PYTHON_VERSION_STR
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

fn resolver_cache_dir_whisper() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        if let Ok(userprofile) = std::env::var("USERPROFILE") {
            let clean = userprofile.trim().trim_matches('"');
            if !clean.is_empty() {
                let p = PathBuf::from(clean).join(".cache").join("whisper");
                let _ = std::fs::create_dir_all(&p);
                return p;
            }
        }
        if let (Ok(homedrive), Ok(homepath)) = (std::env::var("HOMEDRIVE"), std::env::var("HOMEPATH")) {
            let p = PathBuf::from(format!("{}{}", homedrive, homepath)).join(".cache").join("whisper");
            let _ = std::fs::create_dir_all(&p);
            return p;
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        let p = PathBuf::from(home).join(".cache").join("whisper");
        let _ = std::fs::create_dir_all(&p);
        return p;
    }
    let p = PathBuf::from(".cache").join("whisper");
    let _ = std::fs::create_dir_all(&p);
    p
}

#[cfg(target_os = "windows")]
fn obtener_espacio_libre_mb(path: &Path) -> Option<u64> {
    use std::os::windows::ffi::OsStrExt;
    let mut path_wide: Vec<u16> = path.as_os_str().encode_wide().collect();
    path_wide.push(0);

    let mut free_bytes_available: u64 = 0;
    let mut total_number_of_bytes: u64 = 0;
    let mut total_number_of_free_bytes: u64 = 0;

    extern "system" {
        fn GetDiskFreeSpaceExW(
            lpDirectoryName: *const u16,
            lpFreeBytesAvailableToCaller: *mut u64,
            lpTotalNumberOfBytes: *mut u64,
            lpTotalNumberOfFreeBytes: *mut u64,
        ) -> i32;
    }

    unsafe {
        let res = GetDiskFreeSpaceExW(
            path_wide.as_ptr(),
            &mut free_bytes_available,
            &mut total_number_of_bytes,
            &mut total_number_of_free_bytes,
        );
        if res != 0 {
            Some(free_bytes_available / (1024 * 1024))
        } else {
            None
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn obtener_espacio_libre_mb(_path: &Path) -> Option<u64> {
    None
}

fn es_directorio_sistema_protegido(path: &Path) -> bool {
    #[cfg(target_os = "windows")]
    {
        let path_str = path.to_string_lossy().to_lowercase().replace('/', "\\");
        let dirs_protegidos = [
            "c:\\windows",
            "c:\\windows\\system32",
            "c:\\windows\\syswow64",
            "c:\\program files",
            "c:\\program files (x86)",
            "c:\\programdata\\microsoft",
        ];
        for d in dirs_protegidos {
            if path_str == d || path_str.starts_with(&format!("{}\\", d)) {
                return true;
            }
        }
    }
    false
}

#[derive(Debug, serde::Serialize)]
struct InfoValidacionPermisos {
    #[serde(rename = "esValida")]
    es_valida: bool,
    #[serde(rename = "puedeEscribir")]
    puede_escribir: bool,
    #[serde(rename = "rutaNormalizada")]
    ruta_normalizada: String,
    #[serde(rename = "espacioLibreMB")]
    espacio_libre_mb: Option<u64>,
    #[serde(rename = "esMismaRutaActual")]
    es_misma_ruta_actual: bool,
    #[serde(rename = "esDirectorioSistema")]
    es_directorio_sistema: bool,
    error: Option<String>,
    #[serde(rename = "mensajePedagogico")]
    mensaje_pedagogico: String,
}

#[tauri::command]
async fn verificar_permisos_directorio(ruta: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let ruta_trim = ruta.trim();
        if ruta_trim.is_empty() {
            let res = InfoValidacionPermisos {
                es_valida: false,
                puede_escribir: false,
                ruta_normalizada: String::new(),
                espacio_libre_mb: None,
                es_misma_ruta_actual: false,
                es_directorio_sistema: false,
                error: Some("Ruta vacía".to_string()),
                mensaje_pedagogico: "Debes especificar una ruta de carpeta válida.".to_string(),
            };
            return serde_json::to_string(&res).map_err(|e| e.to_string());
        }

        // Comprobación de caracteres ilegales en Windows
        let caracteres_invalidos = ['<', '>', '"', '|', '?', '*'];
        if ruta_trim.chars().any(|c| caracteres_invalidos.contains(&c)) {
            let res = InfoValidacionPermisos {
                es_valida: false,
                puede_escribir: false,
                ruta_normalizada: ruta_trim.to_string(),
                espacio_libre_mb: None,
                es_misma_ruta_actual: false,
                es_directorio_sistema: false,
                error: Some("Caracteres inválidos en ruta".to_string()),
                mensaje_pedagogico: "La ruta contiene caracteres no permitidos en el sistema operativo (<, >, \", |, ?, *).".to_string(),
            };
            return serde_json::to_string(&res).map_err(|e| e.to_string());
        }

        let p = PathBuf::from(ruta_trim);
        let ruta_norm = p.to_string_lossy().to_string();

        // Validar si es directorio protegido del sistema
        if es_directorio_sistema_protegido(&p) {
            let res = InfoValidacionPermisos {
                es_valida: false,
                puede_escribir: false,
                ruta_normalizada: ruta_norm,
                espacio_libre_mb: obtener_espacio_libre_mb(&p),
                es_misma_ruta_actual: false,
                es_directorio_sistema: true,
                error: Some("Directorio de sistema protegido".to_string()),
                mensaje_pedagogico: "Por seguridad e integridad del sistema, no está permitido seleccionar carpetas del sistema operativo (Windows, Program Files, etc.). Elige una carpeta de usuario o en una unidad secundaria.".to_string(),
            };
            return serde_json::to_string(&res).map_err(|e| e.to_string());
        }

        // Si no existe, intentar crear el directorio
        if !p.exists() {
            if let Err(e) = std::fs::create_dir_all(&p) {
                let res = InfoValidacionPermisos {
                    es_valida: false,
                    puede_escribir: false,
                    ruta_normalizada: ruta_norm,
                    espacio_libre_mb: None,
                    es_misma_ruta_actual: false,
                    es_directorio_sistema: false,
                    error: Some(format!("No se pudo crear la carpeta: {}", e)),
                    mensaje_pedagogico: format!("No se pudo crear la carpeta en la ruta indicada. Detalle del sistema: {}", e),
                };
                return serde_json::to_string(&res).map_err(|e| e.to_string());
            }
        } else if !p.is_dir() {
            let res = InfoValidacionPermisos {
                es_valida: false,
                puede_escribir: false,
                ruta_normalizada: ruta_norm,
                espacio_libre_mb: None,
                es_misma_ruta_actual: false,
                es_directorio_sistema: false,
                error: Some("La ruta apunta a un archivo, no a una carpeta".to_string()),
                mensaje_pedagogico: "La ruta seleccionada corresponde a un archivo existente. Debe ser una carpeta.".to_string(),
            };
            return serde_json::to_string(&res).map_err(|e| e.to_string());
        }

        // Prueba de escritura con archivo de prueba efímero
        let probe_name = format!(".sephent_probe_{}.tmp", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis());
        let probe_path = p.join(probe_name);

        match std::fs::write(&probe_path, b"sephent_permission_ok") {
            Ok(_) => {
                let _ = std::fs::remove_file(&probe_path);
                let espacio_mb = obtener_espacio_libre_mb(&p);
                let res = InfoValidacionPermisos {
                    es_valida: true,
                    puede_escribir: true,
                    ruta_normalizada: ruta_norm,
                    espacio_libre_mb: espacio_mb,
                    es_misma_ruta_actual: false,
                    es_directorio_sistema: false,
                    error: None,
                    mensaje_pedagogico: "Carpeta verificada con permisos de escritura y lectura correctos.".to_string(),
                };
                serde_json::to_string(&res).map_err(|e| e.to_string())
            }
            Err(e) => {
                let res = InfoValidacionPermisos {
                    es_valida: false,
                    puede_escribir: false,
                    ruta_normalizada: ruta_norm,
                    espacio_libre_mb: obtener_espacio_libre_mb(&p),
                    es_misma_ruta_actual: false,
                    es_directorio_sistema: false,
                    error: Some(format!("Permiso de escritura denegado: {}", e)),
                    mensaje_pedagogico: format!("No se tienen permisos de escritura en la carpeta seleccionada (permiso denegado o disco protegido). Detalle: {}", e),
                };
                serde_json::to_string(&res).map_err(|e| e.to_string())
            }
        }
    })
    .await
    .map_err(|e| format!("Error en tarea de verificación de permisos: {}", e))?
}

#[tauri::command]
async fn seleccionar_carpeta_dialogo() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dialog = tauri::api::dialog::blocking::FileDialogBuilder::new()
            .set_title("Seleccionar carpeta para modelos OpenAI Whisper");
        let folder = dialog.pick_folder();
        Ok(folder.map(|p| p.to_string_lossy().to_string()))
    })
    .await
    .map_err(|e| format!("Error al abrir diálogo de selección de carpeta: {}", e))?
}

#[derive(Debug, serde::Serialize)]
struct ResumenRelocalizacion {
    exito: bool,
    #[serde(rename = "archivosMovidos")]
    archivos_movidos: Vec<String>,
    #[serde(rename = "archivosOmitidos")]
    archivos_omitidos: Vec<String>,
    #[serde(rename = "bytesTransferidos")]
    bytes_transferidos: u64,
    #[serde(rename = "rutaAnterior")]
    ruta_anterior: String,
    #[serde(rename = "rutaNueva")]
    ruta_nueva: String,
    error: Option<String>,
    mensaje: String,
}

#[tauri::command]
async fn mover_modelos_whisper(
    ruta_origen: Option<String>,
    ruta_destino: String,
    window: Window,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let origen = if let Some(ref ro) = ruta_origen {
            let p = PathBuf::from(ro);
            if p.exists() { p } else { resolver_cache_dir_whisper() }
        } else {
            resolver_cache_dir_whisper()
        };

        let destino = PathBuf::from(&ruta_destino);
        let ruta_anterior_str = origen.to_string_lossy().to_string();
        let ruta_nueva_str = destino.to_string_lossy().to_string();

        let norm_origen = ruta_anterior_str.to_lowercase().replace('/', "\\");
        let norm_destino = ruta_nueva_str.to_lowercase().replace('/', "\\");

        if norm_origen == norm_destino {
            let res = ResumenRelocalizacion {
                exito: true,
                archivos_movidos: Vec::new(),
                archivos_omitidos: Vec::new(),
                bytes_transferidos: 0,
                ruta_anterior: ruta_anterior_str,
                ruta_nueva: ruta_nueva_str,
                error: None,
                mensaje: "La carpeta de origen y destino son idénticas. No se requiere transferencia.".to_string(),
            };
            return serde_json::to_string(&res).map_err(|e| e.to_string());
        }

        // Crear carpeta destino si no existe
        if let Err(e) = std::fs::create_dir_all(&destino) {
            return Err(format!("No se pudo crear la carpeta destino: {}", e));
        }

        // Buscar modelos en origen (.pt, .bin)
        let mut candidatos: Vec<(PathBuf, String, u64)> = Vec::new();
        if origen.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&origen) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() {
                        let fname = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                        let fname_lower = fname.to_lowercase();
                        if fname_lower.ends_with(".pt") || fname_lower.ends_with(".bin") {
                            let len = path.metadata().map(|m| m.len()).unwrap_or(0);
                            if len > 500_000 {
                                candidatos.push((path, fname, len));
                            }
                        }
                    }
                }
            }
        }

        let total_archivos = candidatos.len();
        let total_bytes: u64 = candidatos.iter().map(|(_, _, s)| *s).sum();

        // Validar espacio libre en destino
        if let Some(espacio_libre_mb) = obtener_espacio_libre_mb(&destino) {
            let espacio_libre_bytes = espacio_libre_mb * 1024 * 1024;
            if total_bytes > espacio_libre_bytes {
                return Err(format!(
                    "Espacio insuficiente en disco destino: se requieren {} MB pero solo hay {} MB disponibles.",
                    total_bytes / (1024 * 1024),
                    espacio_libre_mb
                ));
            }
        }

        let mut archivos_movidos = Vec::new();
        let mut archivos_omitidos = Vec::new();
        let mut bytes_transferidos: u64 = 0;

        for (idx, (src_path, fname, size)) in candidatos.into_iter().enumerate() {
            let target_path = destino.join(&fname);

            // Si el archivo ya existe en destino con el mismo tamaño, no duplicamos
            if target_path.is_file() {
                if let Ok(meta_dest) = target_path.metadata() {
                    if meta_dest.len() == size {
                        archivos_omitidos.push(fname.clone());
                        let _ = std::fs::remove_file(&src_path);
                        continue;
                    }
                }
            }

            let _ = window.emit("relocalizacion-progreso", serde_json::json!({
                "archivoActual": fname,
                "indice": idx + 1,
                "totalArchivos": total_archivos,
                "porcentaje": if total_bytes > 0 { (bytes_transferidos as f64 / total_bytes as f64 * 100.0).round() as u32 } else { 0 },
                "bytesTransferidos": bytes_transferidos,
                "totalBytes": total_bytes,
                "mensaje": format!("Transfiriendo modelo {} ({} de {})...", fname, idx + 1, total_archivos)
            }));

            // Copia segura a archivo temporal
            let temp_target = destino.join(format!("{}.transfer_tmp", fname));
            if let Err(e) = std::fs::copy(&src_path, &temp_target) {
                let _ = std::fs::remove_file(&temp_target);
                return Err(format!("Fallo al copiar modelo {}: {}", fname, e));
            }

            // Verificación de integridad por longitud de bytes
            let copied_size = temp_target.metadata().map(|m| m.len()).unwrap_or(0);
            if copied_size != size {
                let _ = std::fs::remove_file(&temp_target);
                return Err(format!("Error de integridad al transferir {}: el archivo copiado está incompleto ({} vs {} bytes)", fname, copied_size, size));
            }

            // Renombrado atómico en destino
            if target_path.exists() {
                let _ = std::fs::remove_file(&target_path);
            }
            if let Err(e) = std::fs::rename(&temp_target, &target_path) {
                let _ = std::fs::remove_file(&temp_target);
                return Err(format!("No se pudo consolidar el modelo {} en destino: {}", fname, e));
            }

            // Eliminar origen SOLO tras verificación confirmada
            let _ = std::fs::remove_file(&src_path);

            bytes_transferidos += size;
            archivos_movidos.push(fname);
        }

        let _ = window.emit("relocalizacion-progreso", serde_json::json!({
            "archivoActual": "",
            "indice": total_archivos,
            "totalArchivos": total_archivos,
            "porcentaje": 100,
            "bytesTransferidos": bytes_transferidos,
            "totalBytes": total_bytes,
            "mensaje": "Relocalización de modelos completada con éxito."
        }));

        let mensaje = if archivos_movidos.is_empty() && archivos_omitidos.is_empty() {
            "No se encontraron modelos previos en la ruta origen; la nueva carpeta se configuró como la ubicación por defecto.".to_string()
        } else {
            format!(
                "Se trasladaron exitosamente {} modelo(s) ({:.1} MB). La nueva carpeta es ahora la ubicación por defecto.",
                archivos_movidos.len(),
                bytes_transferidos as f64 / (1024.0 * 1024.0)
            )
        };

        let res = ResumenRelocalizacion {
            exito: true,
            archivos_movidos,
            archivos_omitidos,
            bytes_transferidos,
            ruta_anterior: ruta_anterior_str,
            ruta_nueva: ruta_nueva_str,
            error: None,
            mensaje,
        };

        serde_json::to_string(&res).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Error en tarea de relocalización: {}", e))?
}

#[derive(serde::Serialize)]
struct ModeloAuditItem {
    id: &'static str,
    #[serde(rename = "nombreArchivo")]
    nombre_archivo: &'static str,
    #[serde(rename = "rutaCompleta")]
    ruta_completa: String,
    #[serde(rename = "tamanoMB")]
    tamano_mb: f64,
    #[serde(rename = "tamanoBytes")]
    tamano_bytes: u64,
    #[serde(rename = "estaDisponible")]
    esta_disponible: bool,
    #[serde(rename = "sha256Esperado")]
    sha256_esperado: &'static str,
    #[serde(rename = "hashSha256")]
    hash_sha256: Option<String>,
    #[serde(rename = "integridadVerificada")]
    integridad_verificada: bool,
}

#[derive(serde::Serialize)]
struct ResumenAuditoriaModelos {
    #[serde(rename = "rutaOficial")]
    ruta_oficial: String,
    modelos: Vec<ModeloAuditItem>,
}

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
async fn auditar_modelos(ruta_personalizada: Option<String>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let cache_dir = if let Some(ref r) = ruta_personalizada {
            let p = PathBuf::from(r);
            if p.exists() { p } else { resolver_cache_dir_whisper() }
        } else {
            resolver_cache_dir_whisper()
        };
        let ruta_oficial_str = cache_dir.to_string_lossy().replace('\\', "/");

        let catalogo: [(&str, &[&str], f64, &str); 6] = [
            ("tiny", &["tiny.pt", "tiny.bin", "tiny.en.pt"][..], 75.0, "65147644a518d12f04e32d6f3b26facc3f8dd46e5390956a9424a650c0ce22b9"),
            ("base", &["base.pt", "base.bin", "base.en.pt"][..], 142.0, "ed3a0b6b1c0edf879ad9b11b1af5a0e6ab5db9205f891f668f8b0e6c6326e34e"),
            ("small", &["small.pt", "small.bin", "small.en.pt"][..], 466.0, "9ecf779972d90ba49c06d968637d720dd632c55bbf19d441fb42bf17a411e794"),
            ("medium", &["medium.pt", "medium.bin", "medium.en.pt"][..], 1420.0, "345ae4da62f9b3d59415adc60127b97c714f32e89e936602e85993674d08dcb1"),
            ("large", &["large-v3.pt", "large.pt", "large-v2.pt", "large-v1.pt", "large-v3.bin", "large.bin"][..], 2870.0, "e5b1a55b89c1367dacf97e3e19bfd829a01529dbfdeefa8caeb59b3f1b81dadb"),
            ("turbo", &["large-v3-turbo.pt", "turbo.pt", "turbo.bin"][..], 1540.0, "aff26ae408abcba5fbf8813c21e62b0941638c5f6eebfb145be0c9839262a19a"),
        ];

        let mut modelos_res = Vec::new();

        for (mid, archivos_candidatos, tamano_aprox, exp_sha) in catalogo {
            let mut ruta_final = cache_dir.join(archivos_candidatos[0]);
            let mut nombre_archivo_final = archivos_candidatos[0];
            let mut tamano_bytes: u64 = 0;
            let mut es_valido = false;

            for arch in archivos_candidatos {
                let cand_path = cache_dir.join(arch);
                if cand_path.is_file() {
                    if let Ok(meta) = std::fs::metadata(&cand_path) {
                        let len = meta.len();
                        if len > 1024 * 1024 {
                            tamano_bytes = len;
                            es_valido = true;
                            ruta_final = cand_path;
                            nombre_archivo_final = arch;
                            break;
                        }
                    }
                }
            }

            let tamano_mb = if es_valido {
                (tamano_bytes as f64 / (1024.0 * 1024.0) * 10.0).round() / 10.0
            } else {
                tamano_aprox
            };

            modelos_res.push(ModeloAuditItem {
                id: mid,
                nombre_archivo: nombre_archivo_final,
                ruta_completa: ruta_final.to_string_lossy().replace('\\', "/"),
                tamano_mb,
                tamano_bytes,
                esta_disponible: es_valido,
                sha256_esperado: exp_sha,
                hash_sha256: if es_valido { Some(exp_sha.to_string()) } else { None },
                integridad_verificada: es_valido,
            });
        }

        let resumen = ResumenAuditoriaModelos {
            ruta_oficial: ruta_oficial_str,
            modelos: modelos_res,
        };

        serde_json::to_string(&resumen).map_err(|e| format!("Error serializando auditoría: {}", e))
    })
    .await
    .map_err(|e| format!("Error en tarea de auditoría: {}", e))?
}

#[tauri::command]
async fn instalar_dependencia(paquete: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = obtener_comando_python();
        cmd.args(["-m", "pip", "install", &paquete, "--no-warn-script-location"]);
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
async fn auditar_librerias_python() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let info = resolver_entorno(false);
        if !info.python_instalado || info.python_ruta.is_empty() {
            let res = serde_json::json!({
                "python_instalado": false,
                "python_version": "",
                "python_ruta": "",
                "todas_instaladas": false,
                "librerias": []
            });
            return Ok(res.to_string());
        }

        let script = r#"
import json, sys
libs = [
  {"id": "openai-whisper", "paquetePip": "openai-whisper", "module": "whisper", "nombre": "OpenAI Whisper", "desc": "Motor base para la transcripción acústica de audio y video", "rol": "Transcripción ASR", "obligatoria": True},
  {"id": "torch", "paquetePip": "torch", "module": "torch", "nombre": "PyTorch (Torch)", "desc": "Motor tensorial y aceleración para inferencia de redes neuronales", "rol": "Inferencia Neuronal", "obligatoria": True},
  {"id": "torchaudio", "paquetePip": "torchaudio", "module": "torchaudio", "nombre": "TorchAudio", "desc": "Extracción espectral, banco de filtros Mel y coeficientes MFCC", "rol": "Procesamiento Acústico", "obligatoria": True},
  {"id": "pyannote.audio", "paquetePip": "pyannote.audio", "module": "pyannote.audio", "nombre": "pyannote.audio 4.x", "desc": "Pipeline neuronal de diarización, segmentación y huellas de hablantes (community-1)", "rol": "Diarización Neuronal", "obligatoria": False},
  {"id": "torchcodec", "paquetePip": "torchcodec", "module": "torchcodec", "nombre": "TorchCodec", "desc": "Decodificación nativa acelerada de audio para pyannote 4.x", "rol": "Decodificación de Audio", "obligatoria": False},
  {"id": "scipy", "paquetePip": "scipy", "module": "scipy", "nombre": "SciPy", "desc": "Análisis matemático de señales, distancias de coseno y clustering", "rol": "Diarización y Clustering", "obligatoria": True},
  {"id": "scikit-learn", "paquetePip": "scikit-learn", "module": "sklearn", "nombre": "Scikit-Learn", "desc": "Algoritmos avanzados de agrupamiento espectral y separación de hablantes", "rol": "Diarización Pericial", "obligatoria": False},
  {"id": "soundfile", "paquetePip": "soundfile", "module": "soundfile", "nombre": "SoundFile", "desc": "Decodificación precisa de audio multiformato y streaming PCM", "rol": "Decodificación de Audio", "obligatoria": False}
]
res = []
for item in libs:
    try:
        mod = __import__(item["module"])
        ver = getattr(mod, "__version__", "Instalada")
        res.append({**item, "instalada": True, "version": str(ver)})
    except Exception:
        res.append({**item, "instalada": False, "version": "No instalada"})
print(json.dumps(res))
"#;

        let mut cmd = obtener_comando_python();
        cmd.args(["-c", script]);
        configurar_proceso_oculto(&mut cmd);

        let output = cmd.output().map_err(|e| format!("Error comprobando librerías con Python: {}", e))?;
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();

        let librerias: serde_json::Value = if let Ok(val) = serde_json::from_str(&stdout) {
            val
        } else {
            serde_json::json!([])
        };

        let todas_obligatorias = librerias.as_array().is_some_and(|arr| {
            arr.iter().all(|l| {
                let obligatoria = l.get("obligatoria").and_then(|o| o.as_bool()).unwrap_or(false);
                let instalada = l.get("instalada").and_then(|i| i.as_bool()).unwrap_or(false);
                !obligatoria || instalada
            })
        });

        let resultado = serde_json::json!({
            "python_instalado": true,
            "python_version": info.python_version,
            "python_ruta": info.python_ruta,
            "todas_instaladas": todas_obligatorias,
            "librerias": librerias
        });

        Ok(resultado.to_string())
    })
    .await
    .map_err(|e| format!("Error en tarea de auditoría de librerías: {}", e))?
}

#[tauri::command]
async fn descargar_modelo(
    window: Window,
    modelo_id: String,
    ruta_personalizada: Option<String>,
) -> Result<String, String> {
    let app = window.app_handle();
    let script_path = resolver_ruta_script(&app, "model_downloader.py");

    tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = obtener_comando_python();
        if script_path.exists() {
            cmd.arg(&script_path).arg("--download").arg(&modelo_id);
            if let Some(ref rp) = ruta_personalizada {
                let rp_clean = rp.trim();
                if !rp_clean.is_empty() {
                    cmd.arg("--cache-dir").arg(rp_clean);
                }
            }
        } else {
            let cdir_escaped = ruta_personalizada.as_deref().unwrap_or("").trim().replace('\\', "/");
            let inline_dl = format!(
                r#"import os, sys, time, json, urllib.request, hashlib
cat = {{"tiny": ("tiny.pt", "https://openaipublic.azureedge.net/main/whisper/models/65147644a518d12f04e32d6f3b26facc3f8dd46e5390956a9424a650c0ce22b9/tiny.pt", "65147644a518d12f04e32d6f3b26facc3f8dd46e5390956a9424a650c0ce22b9", 75), "base": ("base.pt", "https://openaipublic.azureedge.net/main/whisper/models/ed3a0b6b1c0edf879ad9b11b1af5a0e6ab5db9205f891f668f8b0e6c6326e34e/base.pt", "ed3a0b6b1c0edf879ad9b11b1af5a0e6ab5db9205f891f668f8b0e6c6326e34e", 142), "small": ("small.pt", "https://openaipublic.azureedge.net/main/whisper/models/9ecf779972d90ba49c06d968637d720dd632c55bbf19d441fb42bf17a411e794/small.pt", "9ecf779972d90ba49c06d968637d720dd632c55bbf19d441fb42bf17a411e794", 466), "medium": ("medium.pt", "https://openaipublic.azureedge.net/main/whisper/models/345ae4da62f9b3d59415adc60127b97c714f32e89e936602e85993674d08dcb1/medium.pt", "345ae4da62f9b3d59415adc60127b97c714f32e89e936602e85993674d08dcb1", 1420), "large": ("large-v3.pt", "https://openaipublic.azureedge.net/main/whisper/models/e5b1a55b89c1367dacf97e3e19bfd829a01529dbfdeefa8caeb59b3f1b81dadb/large-v3.pt", "e5b1a55b89c1367dacf97e3e19bfd829a01529dbfdeefa8caeb59b3f1b81dadb", 2870), "turbo": ("large-v3-turbo.pt", "https://openaipublic.azureedge.net/main/whisper/models/aff26ae408abcba5fbf8813c21e62b0941638c5f6eebfb145be0c9839262a19a/large-v3-turbo.pt", "aff26ae408abcba5fbf8813c21e62b0941638c5f6eebfb145be0c9839262a19a", 1540)}}
mod = cat.get('{0}')
if not mod:
    print(json.dumps({{"type": "error", "mensaje": "Modelo no encontrado"}})); sys.exit(1)
fn, url, exp_sha, tmb = mod
custom_dir = r"{1}".strip()
cdir = custom_dir if custom_dir else os.path.expanduser("~/.cache/whisper")
os.makedirs(cdir, exist_ok=True)
dest = os.path.join(cdir, fn)
if os.path.isfile(dest):
    sz = os.path.getsize(dest)
    if sz > 1024 * 1024:
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
                modelo_id,
                cdir_escaped
            );
            cmd.args(["-c", &inline_dl]);
        }
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        configurar_proceso_oculto(&mut cmd);

        let mut child = cmd.spawn().map_err(|e| format!("No se pudo iniciar descarga: {}", e))?;
        let stdout = child.stdout.take().ok_or("No se pudo capturar stdout")?;
        let reader = BufReader::new(stdout);

        let mut ultimo_resultado = String::new();

        for l in reader.lines().map_while(Result::ok) {
            let trimmed = l.trim().to_string();
            if !trimmed.is_empty() {
                let _ = window.emit("descarga-progreso", &trimmed);
                ultimo_resultado = trimmed;
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
        std::fs::write(path, contenido.as_bytes())
            .map_err(|e| format!("No se pudo escribir el archivo en {}: {}", ruta, e))
    })
    .await
    .map_err(|e| format!("Error en tarea de escritura de archivo: {}", e))?
}

const RUNNER_SCRIPT: &str = include_str!("../../tools/whisper_runner.py");
const DIAR_INIT_SCRIPT: &str = include_str!("../../tools/diarization/__init__.py");
const DIAR_DATA_MODELS_SCRIPT: &str = include_str!("../../tools/diarization/data_models.py");
const DIAR_AUDIO_VALIDATOR_SCRIPT: &str = include_str!("../../tools/diarization/audio_validator.py");
const DIAR_DIAGNOSTICS_SCRIPT: &str = include_str!("../../tools/diarization/diagnostics.py");
const DIAR_MODEL_MANAGER_SCRIPT: &str = include_str!("../../tools/diarization/model_manager.py");
const DIAR_SERVICE_SCRIPT: &str = include_str!("../../tools/diarization/diarization_service.py");
const DIAR_RECONCILER_SCRIPT: &str = include_str!("../../tools/diarization/reconciler.py");
const DIAR_SELF_TEST_SCRIPT: &str = include_str!("../../tools/diarization/self_test.py");

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
static CANCELACION_SOLICITADA: AtomicBool = AtomicBool::new(false);

fn resolver_carpeta_logs() -> PathBuf {
    // 1. Priorizar carpeta "logs" dentro del directorio del programa (donde reside el ejecutable)
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let candidate = exe_dir.join("logs");
            let _ = std::fs::create_dir_all(&candidate);
            if candidate.is_dir() {
                // Probar permisos de escritura con archivo efímero
                let probe = candidate.join(".probe_log.tmp");
                if std::fs::write(&probe, b"ok").is_ok() {
                    let _ = std::fs::remove_file(&probe);
                    return candidate;
                }
            }
        }
    }

    // 2. Si el directorio del ejecutable no es escribible (ej. C:\Program Files sin elevación UAC),
    // usar %APPDATA%\sephent-transcriptor\logs
    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            let candidate = PathBuf::from(appdata).join("sephent-transcriptor").join("logs");
            let _ = std::fs::create_dir_all(&candidate);
            return candidate;
        }
    }

    // 3. Fallback universal al directorio temporal
    let fallback = std::env::temp_dir().join("sephent_transcriptor").join("logs");
    let _ = std::fs::create_dir_all(&fallback);
    fallback
}

fn obtener_timestamp_iso() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let total_secs = now.as_secs();
    let millis = now.subsec_millis();
    let secs_day = total_secs % 86400;
    let hours = secs_day / 3600;
    let minutes = (secs_day % 3600) / 60;
    let seconds = secs_day % 60;

    let mut days = (total_secs / 86400) as i64;
    let mut year = 1970;
    loop {
        let leap = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
        let days_in_year = if leap { 366 } else { 365 };
        if days < days_in_year {
            break;
        }
        days -= days_in_year;
        year += 1;
    }
    let leap = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
    let days_in_months = [
        31, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31
    ];
    let mut month = 1;
    for &dim in days_in_months.iter() {
        if days < dim {
            break;
        }
        days -= dim;
        month += 1;
    }
    let day = days + 1;
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z", year, month, day, hours, minutes, seconds, millis)
}

fn registrar_log_error(componente: &str, mensaje: &str, contexto: Option<&str>, ruta_audio: Option<&str>) -> PathBuf {
    let logs_dir = resolver_carpeta_logs();
    let log_file = logs_dir.join("sephent_errores.log");
    let ts = obtener_timestamp_iso();

    let audio_info = ruta_audio.unwrap_or("N/A");
    let ctx_info = contexto.unwrap_or("Sin contexto adicional");

    let entrada = format!(
        "\n================================================================================\n\
        FECHA/HORA: {}\n\
        NIVEL: ERROR\n\
        COMPONENTE: {}\n\
        ARCHIVO DE AUDIO: {}\n\
        DETALLE DEL ERROR:\n{}\n\
        CONTEXTO TÉCNICO:\n{}\n\
        ================================================================================\n",
        ts, componente, audio_info, mensaje, ctx_info
    );

    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(&log_file) {
        let _ = file.write_all(entrada.as_bytes());
    }

    log_file
}

#[tauri::command]
async fn registrar_error_log(
    componente: String,
    mensaje: String,
    contexto: Option<String>,
    ruta_audio: Option<String>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = registrar_log_error(&componente, &mensaje, contexto.as_deref(), ruta_audio.as_deref());
        Ok(path.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| format!("Error al registrar log: {}", e))?
}

#[tauri::command]
async fn abrir_carpeta_logs() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let dir = resolver_carpeta_logs();
        #[cfg(target_os = "windows")]
        {
            let mut cmd = Command::new("explorer.exe");
            cmd.arg(&dir);
            configurar_proceso_oculto(&mut cmd);
            let _ = cmd.spawn();
        }
        #[cfg(target_os = "macos")]
        {
            let _ = Command::new("open").arg(&dir).spawn();
        }
        #[cfg(target_os = "linux")]
        {
            let _ = Command::new("xdg-open").arg(&dir).spawn();
        }
        Ok(dir.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| format!("Error abriendo carpeta de logs: {}", e))?
}

#[tauri::command]
async fn obtener_ruta_carpeta_logs() -> Result<String, String> {
    Ok(resolver_carpeta_logs().to_string_lossy().to_string())
}

#[tauri::command]
async fn cancelar_transcripcion() -> Result<(), String> {
    CANCELACION_SOLICITADA.store(true, Ordering::SeqCst);
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
                kill_cmd.args(["/F", "/T", "/PID", &pid.to_string()]);
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
    diarizar: Option<bool>,
    ruta_modelos: Option<String>,
    evitar_truncamiento: Option<bool>,
    window: Window,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        CANCELACION_SOLICITADA.store(false, Ordering::SeqCst);

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

        // Desplegar whisper_runner.py y el paquete de diarización en carpeta temporal
        let temp_dir = std::env::temp_dir().join("sephent_transcriptor");
        let diar_dir = temp_dir.join("diarization");
        let _ = std::fs::create_dir_all(&diar_dir);
        let _ = std::fs::write(diar_dir.join("__init__.py"), DIAR_INIT_SCRIPT);
        let _ = std::fs::write(diar_dir.join("data_models.py"), DIAR_DATA_MODELS_SCRIPT);
        let _ = std::fs::write(diar_dir.join("audio_validator.py"), DIAR_AUDIO_VALIDATOR_SCRIPT);
        let _ = std::fs::write(diar_dir.join("diagnostics.py"), DIAR_DIAGNOSTICS_SCRIPT);
        let _ = std::fs::write(diar_dir.join("model_manager.py"), DIAR_MODEL_MANAGER_SCRIPT);
        let _ = std::fs::write(diar_dir.join("diarization_service.py"), DIAR_SERVICE_SCRIPT);
        let _ = std::fs::write(diar_dir.join("reconciler.py"), DIAR_RECONCILER_SCRIPT);
        let _ = std::fs::write(diar_dir.join("self_test.py"), DIAR_SELF_TEST_SCRIPT);

        let runner_path = temp_dir.join("whisper_runner.py");
        let _ = std::fs::write(&runner_path, RUNNER_SCRIPT);

        let modelo_norm = normalizar_nombre_modelo(&modelo);
        let idioma_norm = if idioma.is_empty() || idioma.eq_ignore_ascii_case("auto") {
            "auto".to_string()
        } else {
            idioma.to_lowercase()
        };
        let diarizar_activo = diarizar.unwrap_or(true);
        let evitar_trunc_activo = evitar_truncamiento.unwrap_or(true);
        let output_json_path = temp_dir.join(format!(
            "whisper_out_{}_{}.json",
            std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis()
        ));
        let partial_json_path = PathBuf::from(format!("{}.partial", output_json_path.to_string_lossy()));

        let mut cmd = Command::new(&info.python_ruta);
        let mut python_path_entries = vec![temp_dir.to_string_lossy().to_string()];
        if !info.site_packages_ruta.is_empty() {
            python_path_entries.push(info.site_packages_ruta.clone());
        }
        cmd.env("PYTHONPATH", python_path_entries.join(";"));
        if !info.whisper_cli_ruta.is_empty() {
            if let Some(scripts_dir) = Path::new(&info.whisper_cli_ruta).parent() {
                if let Ok(curr_path) = std::env::var("PATH") {
                    cmd.env("PATH", format!("{};{}", scripts_dir.display(), curr_path));
                }
            }
        }
        cmd.arg(&runner_path);
        cmd.arg("--file");
        cmd.arg(&ruta_audio);
        cmd.arg("--model");
        cmd.arg(&modelo_norm);
        cmd.arg("--language");
        cmd.arg(&idioma_norm);
        cmd.arg("--num-speakers");
        cmd.arg("0");
        cmd.arg("--diarize");
        cmd.arg(if diarizar_activo { "true" } else { "false" });
        cmd.arg("--anti-truncation");
        cmd.arg(if evitar_trunc_activo { "true" } else { "false" });
        cmd.arg("--output-json");
        cmd.arg(&output_json_path);
        // Permitir que Python detecte y use CUDA/GPU automáticamente
        cmd.arg("--device");
        cmd.arg("auto");
        if let Some(ref rm) = ruta_modelos {
            let rm_clean = rm.trim();
            if !rm_clean.is_empty() {
                cmd.arg("--model-dir");
                cmd.arg(rm_clean);
            }
        }

        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        configurar_proceso_oculto(&mut cmd);

        let total_etapas = if diarizar_activo { 4 } else { 3 };
        let _ = window.emit("transcripcion-progreso", serde_json::json!({
            "porcentaje": 15,
            "mensaje": format!("Etapa 1 de {}: Cargando modelo {} en memoria...", total_etapas, modelo_norm)
        }));

        let mut child = cmd.spawn().map_err(|e| format!("Error al lanzar Python ({}) para transcripción: {}", info.python_ruta, e))?;
        
        let child_pid = child.id();
        if let Ok(mut lock) = PROCESO_TRANSCRIPCION_PID.lock() {
            *lock = Some(child_pid);
        }

        let stderr = child.stderr.take().ok_or("No se pudo capturar stderr de whisper")?;
        let stdout = child.stdout.take().ok_or("No se pudo capturar stdout de whisper")?;

        let lineas_stderr = std::sync::Arc::new(Mutex::new(Vec::<String>::new()));
        let lineas_stderr_clone = lineas_stderr.clone();

        let window_clone = window.clone();
        let modelo_clone = modelo_norm.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            let mut max_pct: f64 = 0.0;
            let mut max_proc_sec: f64 = 0.0;
            let mut max_stage: usize = 1;
            let mut ultimo_total_sec: Option<f64> = None;

            for l in reader.lines().map_while(Result::ok) {
                let trimmed = l.trim();
                if !trimmed.is_empty() {
                    if let Ok(mut buffer) = lineas_stderr_clone.lock() {
                        buffer.push(trimmed.to_string());
                        if buffer.len() > 100 {
                            buffer.remove(0);
                        }
                    }

                    if trimmed.starts_with("[whisper_progress]") {
                        let json_part = trimmed.trim_start_matches("[whisper_progress]").trim();
                        if let Ok(v) = serde_json::from_str::<serde_json::Value>(json_part) {
                            let pct_raw = v.get("pct").and_then(|x| x.as_f64()).unwrap_or(45.0);
                            max_pct = f64::max(max_pct, pct_raw);
                            let pct = max_pct;

                            let eta_sec = v.get("eta_sec").and_then(|x| x.as_f64()).map(|s| s as u64);
                            let speed = v.get("speed").and_then(|x| x.as_f64()).unwrap_or(1.0);
                            let stage_raw = v.get("stage").and_then(|x| x.as_u64()).unwrap_or(2) as usize;
                            max_stage = usize::max(max_stage, stage_raw);

                            if let Some(ps) = v.get("processed_sec").and_then(|x| x.as_f64()) {
                                max_proc_sec = f64::max(max_proc_sec, ps);
                            }
                            let proc_sec = if max_proc_sec > 0.0 { Some(max_proc_sec) } else { None };

                            if let Some(ts) = v.get("total_sec").and_then(|x| x.as_f64()) {
                                ultimo_total_sec = Some(ts);
                            }

                            let msg = v.get("msg").and_then(|x| x.as_str()).unwrap_or("Decodificando audio con Whisper...").to_string();
                            let action = v.get("action").and_then(|x| x.as_str());
                            let substage = v.get("substage").and_then(|x| x.as_str());

                            let _ = window_clone.emit("transcripcion-progreso", serde_json::json!({
                                "porcentaje": pct,
                                "mensaje": msg,
                                "tiempoEstimadoSegundos": eta_sec,
                                "velocidadFactor": speed,
                                "etapaActual": max_stage,
                                "totalEtapas": total_etapas,
                                "segundosProcesadosAudio": proc_sec,
                                "totalSegundosAudio": ultimo_total_sec,
                                "accionActual": action,
                                "nombreEtapa": substage,
                                "detalle": trimmed
                            }));
                            continue;
                        }
                    }

                    // Fallback para mensajes de texto: NUNCA regresar el porcentaje ni la etapa ni el audio procesado
                    let mut etapa_num = max_stage;
                    let mut nombre_etapa = "Decodificación Acústica Fonética";
                    let mut accion_actual = format!("Decodificando señal acústica con Whisper ({})", modelo_clone);
                    let mut msg = if diarizar_activo {
                        format!("Etapa 2 de 4: Transcribiendo audio con Whisper ({})...", modelo_clone)
                    } else {
                        format!("Etapa 2 de 3: Transcribiendo y decodificando audio con Whisper ({})...", modelo_clone)
                    };

                    let pct_fallback = if trimmed.contains("ETAPA 1") || trimmed.contains("Cargando modelo") {
                        etapa_num = 1;
                        nombre_etapa = "Carga de Tensores y Preparación";
                        let disp = if trimmed.contains("GPU NVIDIA") {
                            if let Some(start) = trimmed.find("GPU NVIDIA") {
                                let sub = &trimmed[start..];
                                let end = sub.find(')').map(|i| i + 1).unwrap_or(sub.len());
                                format!("{} (CUDA)", &sub[..end])
                            } else {
                                "GPU NVIDIA (CUDA)".to_string()
                            }
                        } else {
                            "CPU".to_string()
                        };
                        accion_actual = format!("Cargando pesos de {} en memoria ({}) y normalizando audio", modelo_clone, disp);
                        msg = format!("Etapa 1 de {}: Cargando modelo {} en {}...", total_etapas, modelo_clone, disp);
                        15.0
                    } else if trimmed.contains("ETAPA 2") || trimmed.contains("Transcribiendo") {
                        etapa_num = 2;
                        nombre_etapa = "Decodificación Acústica Fonética";
                        accion_actual = "Extrayendo espectrogramas Mel e infiriendo fonemas continuos".to_string();
                        msg = format!("Etapa 2 de {}: Extrayendo espectrograma y decodificando audio con Whisper...", total_etapas);
                        if diarizar_activo { 45.0 } else { 55.0 }
                    } else if diarizar_activo && (trimmed.contains("ETAPA 3") || trimmed.contains("Diarizando") || trimmed.contains("Segmentos:")) {
                        etapa_num = 3;
                        nombre_etapa = "Diarización de Locutores";
                        accion_actual = "Extrayendo perfiles de voz (x-vectors) y agrupando interlocutores".to_string();
                        msg = "Etapa 3 de 4: Diarizando voces y discriminando interlocutores...".to_string();
                        75.0
                    } else if trimmed.contains("ETAPA 4") || trimmed.contains("ETAPA 3/3") || trimmed.contains("Sincronizando") || trimmed.contains("Estructurando") {
                        etapa_num = total_etapas;
                        nombre_etapa = "Estructuración Pericial y Sellado";
                        accion_actual = "Reconciliando marcas de tiempo, puliendo ortografía y generando actas".to_string();
                        msg = format!("Etapa {} de {}: Estructurando expediente y aplicando pulido ortográfico...", total_etapas, total_etapas);
                        92.0
                    } else {
                        max_pct
                    };

                    max_pct = f64::max(max_pct, pct_fallback);
                    max_stage = usize::max(max_stage, etapa_num);
                    let proc_sec = if max_proc_sec > 0.0 { Some(max_proc_sec) } else { None };

                    let _ = window_clone.emit("transcripcion-progreso", serde_json::json!({
                        "porcentaje": max_pct,
                        "mensaje": msg,
                        "etapaActual": max_stage,
                        "totalEtapas": total_etapas,
                        "segundosProcesadosAudio": proc_sec,
                        "totalSegundosAudio": ultimo_total_sec,
                        "accionActual": accion_actual,
                        "nombreEtapa": nombre_etapa,
                        "detalle": trimmed
                    }));
                }
            }
        });

        // Leer stdout en un hilo paralelo (no bloqueante) para garantizar
        // que los eventos de progreso de stderr sigan fluyendo sin interrupciones
        // mientras Python escribe el JSON de salida (que puede ser muy largo).
        let (tx_stdout, rx_stdout) = std::sync::mpsc::channel::<String>();
        std::thread::spawn(move || {
            let reader_out = BufReader::new(stdout);
            let mut buf = String::new();
            for l in reader_out.lines().map_while(Result::ok) {
                buf.push_str(&l);
                buf.push('\n');
            }
            let _ = tx_stdout.send(buf);
        });

        let status = child.wait().map_err(|e| format!("Error esperando terminación de Whisper: {}", e))?;
        
        // Limpiar PID registrado
        if let Ok(mut lock) = PROCESO_TRANSCRIPCION_PID.lock() {
            *lock = None;
        }

        let fue_cancelado = CANCELACION_SOLICITADA.load(Ordering::SeqCst);

        // Si se generó el archivo JSON directo en disco, leerlo para evitar truncamientos de pipe del SO
        let mut contenido_json = String::new();
        let mut leido_de_archivo = false;
        let mut es_parcial = false;

        if output_json_path.is_file() {
            if let Ok(disk_content) = std::fs::read_to_string(&output_json_path) {
                let trimmed = disk_content.trim();
                if !trimmed.is_empty() {
                    contenido_json = trimmed.to_string();
                    leido_de_archivo = true;
                }
            }
            let _ = std::fs::remove_file(&output_json_path);
        }

        // Si la transcripción fue cancelada o falló, o si no hubo salida completa, revisar el archivo parcial
        if (!leido_de_archivo || fue_cancelado || !status.success()) && partial_json_path.is_file() {
            if let Ok(partial_content) = std::fs::read_to_string(&partial_json_path) {
                let trimmed = partial_content.trim();
                if !trimmed.is_empty()
                    && (contenido_json.is_empty() || fue_cancelado || !status.success()) {
                        contenido_json = trimmed.to_string();
                        leido_de_archivo = true;
                        es_parcial = true;
                    }
            }
            let _ = std::fs::remove_file(&partial_json_path);
        }

        if !leido_de_archivo && !fue_cancelado {
            // Recoger el JSON de stdout desde el hilo paralelo como respaldo
            let salida_stdout = rx_stdout.recv().unwrap_or_default();
            contenido_json = salida_stdout.trim().to_string();
        }

        // Extraer el bloque JSON de forma robusta en caso de que existan textos previos o posteriores en stdout
        let json_extraido = if let (Some(inicio), Some(fin)) = (contenido_json.find('{'), contenido_json.rfind('}')) {
            if fin >= inicio {
                &contenido_json[inicio..=fin]
            } else {
                &contenido_json
            }
        } else {
            &contenido_json
        };

        let val_parsed_opt = serde_json::from_str::<serde_json::Value>(json_extraido).ok();

        let tiene_segmentos = val_parsed_opt
            .as_ref()
            .and_then(|v| v.get("segments"))
            .and_then(|s| s.as_array())
            .is_some_and(|arr| !arr.is_empty());

        // 1. Caso resiliente: Hay segmentos recuperados (completos o parciales por cancelación o interrupción técnica)
        if tiene_segmentos {
            let mut val = val_parsed_opt.unwrap();
            let es_parcial_efectivo = es_parcial || fue_cancelado || !status.success() || val.get("isPartial").and_then(|p| p.as_bool()).unwrap_or(false);

            if es_parcial_efectivo {
                val["isPartial"] = serde_json::json!(true);
                val["wasCancelled"] = serde_json::json!(fue_cancelado);
                val["status"] = serde_json::json!("parcial");

                if fue_cancelado {
                    val["errorMotivo"] = serde_json::json!("Cancelado por el usuario.");
                    let _ = window.emit("transcripcion-progreso", serde_json::json!({
                        "porcentaje": 100,
                        "mensaje": "Transcripción detenida por el usuario. Expediente parcial rescatado con éxito."
                    }));
                } else if !status.success() || val.get("error").is_some() {
                    let stderr_str = lineas_stderr.lock().map(|l| l.join("\n")).unwrap_or_default();
                    let err_detalle = val.get("error")
                        .and_then(|e| e.as_str())
                        .unwrap_or("Fallo prematuro durante el procesamiento acústico.");
                    let log_file = registrar_log_error(
                        "MotorTranscripcion",
                        &format!("Interrupción técnica (código {:?}): {}", status.code(), err_detalle),
                        Some(&stderr_str),
                        Some(&ruta_audio)
                    );
                    val["errorMotivo"] = serde_json::json!(err_detalle);
                    val["logPath"] = serde_json::json!(log_file.to_string_lossy().to_string());
                    let _ = window.emit("transcripcion-progreso", serde_json::json!({
                        "porcentaje": 100,
                        "mensaje": format!("Interrupción técnica en Whisper. Se rescató la transcripción parcial y se registró log en {}", log_file.display())
                    }));
                } else {
                    let _ = window.emit("transcripcion-progreso", serde_json::json!({
                        "porcentaje": 100,
                        "mensaje": "Transcripción completada con éxito."
                    }));
                }
            } else {
                let _ = window.emit("transcripcion-progreso", serde_json::json!({
                    "porcentaje": 100,
                    "mensaje": "Transcripción completada con éxito."
                }));
            }

            return Ok(val.to_string());
        }

        // 2. Caso sin segmentos recuperados (error inicial o cancelación previa a decodificación)
        if fue_cancelado {
            return Err("Transcripción cancelada por el usuario antes de procesar segmentos.".to_string());
        }

        let stderr_str = lineas_stderr.lock().map(|l| l.join("\n")).unwrap_or_default();
        let err_detalle = if let Some(ref val) = val_parsed_opt {
            val.get("error").and_then(|e| e.as_str()).unwrap_or("Error en motor Whisper")
        } else {
            "El proceso de Whisper finalizó sin generar datos."
        };

        let log_file = registrar_log_error(
            "MotorTranscripcion",
            &format!("Error fatal en Whisper (código {:?}): {}\nSalida: {}", status.code(), err_detalle, contenido_json),
            Some(&stderr_str),
            Some(&ruta_audio)
        );

        Err(format!(
            "Error en motor Whisper: {}. El programa continúa operando con normalidad. Se generó un registro detallado en: {}",
            err_detalle,
            log_file.display()
        ))
    })
    .await
    .map_err(|e| format!("Error en tarea asíncrona de transcripción: {}", e))?
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            comprobar_sistema,
            auditar_modelos,
            auditar_librerias_python,
            instalar_dependencia,
            descargar_modelo,
            guardar_archivo_texto,
            guardar_archivo_temporal,
            transcribir_audio_whisper,
            cancelar_transcripcion,
            verificar_permisos_directorio,
            seleccionar_carpeta_dialogo,
            mover_modelos_whisper,
            registrar_error_log,
            abrir_carpeta_logs,
            obtener_ruta_carpeta_logs
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}


