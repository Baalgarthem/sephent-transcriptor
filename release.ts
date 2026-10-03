#!/usr/bin/env node
/**
 * ============================================================================
 * Sephent Transcriptor — Gestor Maestro de Versiones, Dist e Instalables
 * ============================================================================
 *
 * ¿QUÉ ES ESTE ARCHIVO Y POR QUÉ EXISTE?
 * ----------------------------------------------------------------------------
 * Este script (`release.ts`) es la herramienta canónica de automatización y
 * ciclo de vida (DevOps / Release Engineering) ubicada en la raíz (root) del
 * proyecto Sephent Transcriptor.
 *
 * En aplicaciones de escritorio construidas sobre arquitecturas híbridas
 * (Frontend en TypeScript/React/Vite + Backend en Rust/Tauri + Motores Python
 * para transcripción y diarización), el proceso de compilación, control de
 * versiones y empaquetado involucra múltiples subsistemas desacoplados.
 *
 * Si este proceso se realizara de forma manual, existiría un alto riesgo de:
 * 1. Desincronización de versiones entre `package.json`, `Cargo.toml` y `tauri.conf.json`.
 * 2. Olvido de pruebas unitarias críticas antes de empaquetar ejecutables finales.
 * 3. Generación dispersa de archivos en carpetas temporales o de compilación.
 * 4. Distribución de binarios sin verificar su integridad criptográfica SHA-256.
 *
 * Este gestor centraliza TODO en un único punto con una interfaz limpia, interactiva
 * y pedagógica, asegurando que:
 * - Toda la compilación e instaladores residan en una sola carpeta: `instalables/`.
 * - La pantalla de la terminal se limpie tras cada operación para mantener el menú despejado.
 * - Cada acción esté explicada con fines formativos y de auditoría forense.
 *
 * FORMAS DE USO:
 * ----------------------------------------------------------------------------
 * 1. Modo interactivo guiado (Recomendado para el desarrollador):
 *    $ npm run release.ts
 *    $ npm run release
 *    $ npx tsx release.ts
 *
 * 2. Comandos CLI directos (Ideal para scripts de integración o terminal rápida):
 *    $ npx tsx release.ts --dist-only          # Solo compila frontend a dist/ y dist-web/
 *    $ npx tsx release.ts --installers-only    # Compila instaladores en instalables/ y reporta
 *    $ npx tsx release.ts --patch --build      # Incrementa parche y compila todo
 *    $ npx tsx release.ts --help               # Despliega la guía de opciones
 *
 * ============================================================================
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as readline from 'readline';
import { exec, spawn } from 'child_process';

// ============================================================================
// CONSTANTES DE RUTAS Y ARQUITECTURA DEL PROYECTO
// ============================================================================
// Obtenemos el directorio raíz del proyecto de forma absoluta a partir del proceso actual.
const ROOT_DIR = process.cwd();

// Manifiesto de dependencias y versión del ecosistema Node.js / TypeScript
const PKG_PATH = path.join(ROOT_DIR, 'package.json');

// Manifiesto del motor de backend y dependencias nativas en Rust
const CARGO_PATH = path.join(ROOT_DIR, 'src-tauri', 'Cargo.toml');

// Manifiesto de configuración de la ventana, empaquetadores y metadatos de Tauri
const TAURI_CONF_PATH = path.join(ROOT_DIR, 'src-tauri', 'tauri.conf.json');

// Carpeta donde Vite genera el bundle compilado para la vista web de Tauri
const DIST_WEB_DIR = path.join(ROOT_DIR, 'dist-web');

// Carpeta estándar de distribución web en la raíz del proyecto
const DIST_DIR = path.join(ROOT_DIR, 'dist');

// Carpeta única y canónica en el root para todos los instaladores, portables y herramientas
const INSTALABLES_DIR = path.join(ROOT_DIR, 'instalables');

// ============================================================================
// SECCIÓN 1: UTILIDADES DE CONSOLA, COLORES ANSI Y LIMPIEZA DE PANTALLA
// ============================================================================

/**
 * Paleta de colores ANSI para la consola.
 *
 * ¿CÓMO FUNCIONA?
 * Las secuencias de escape ANSI (por ejemplo `\x1b[32m`) son estándares de la industria
 * para enviar códigos de control a la terminal, indicándole que cambie el color del texto
 * o del fondo sin necesidad de instalar librerías externas adicionales.
 * Siempre se finaliza con `\x1b[0m` (reset) para no alterar la consola del usuario.
 */
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

/**
 * Limpia la pantalla de la terminal de manera multiplataforma y robusta.
 *
 * EXPLICACIÓN PEDAGÓGICA:
 * En diferentes terminales (CMD de Windows, PowerShell, Mintty en Git Bash, o terminales
 * de Linux/macOS), una simple llamada a `console.clear()` puede fallar o dejar líneas
 * residuales en el historial de scroll (scrollback buffer).
 *
 * Para garantizar una limpieza impecable:
 * 1. Invocamos `console.clear()`: Notifica al runtime de Node.js que borre la consola.
 * 2. Escribimos la secuencia ANSI `\x1b[2J\x1b[3J\x1b[H`:
 *    - `\x1b[2J`: Borra toda la vista de pantalla activa actual.
 *    - `\x1b[3J`: Borra el búfer de historial / scrollback (evita que el usuario tenga que scrollear).
 *    - `\x1b[H` : Mueve el cursor a la esquina superior izquierda (coordenada 1,1).
 */
export function limpiarPantalla(): void {
  try {
    console.clear();
  } catch {
    // Protección silenciosa si la salida estándar está redirigida a un archivo
  }
  process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
}

/**
 * Emite un mensaje estándar en la consola.
 */
function log(msg: string) {
  console.log(msg);
}

/**
 * Emite un mensaje informativo decorado en color cian.
 */
function logInfo(msg: string) {
  console.log(`${colors.cyan}ℹ ${msg}${colors.reset}`);
}

/**
 * Emite un mensaje de éxito decorado con marca de verificación en color verde.
 */
function logSuccess(msg: string) {
  console.log(`${colors.green}✔ ${msg}${colors.reset}`);
}

/**
 * Emite un mensaje de advertencia decorado en color amarillo.
 */
function logWarn(msg: string) {
  console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`);
}

/**
 * Emite un mensaje de error decorado con cruz en color rojo.
 */
function logError(msg: string) {
  console.log(`${colors.red}✖ ${msg}${colors.reset}`);
}

/**
 * Dibuja un encabezado visualmente distinguido con líneas dobles para guiar
 * la atención del usuario en etapas clave del proceso.
 */
function logHeader(title: string) {
  const line = '═'.repeat(72);
  console.log(`\n${colors.bright}${colors.cyan}${line}${colors.reset}`);
  console.log(`${colors.bright}${colors.white}  ${title}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}${line}${colors.reset}\n`);
}

/**
 * Pausa la ejecución hasta que el usuario presione la tecla Enter.
 *
 * EXPLICACIÓN PEDAGÓGICA:
 * Esta función es esencial para una buena experiencia de usuario (UX en CLI).
 * Tras ejecutar una compilación, pruebas o reporte, permite que el usuario
 * examine con detenimiento los resultados. Una vez presionado Enter, el bucle
 * del menú llamará a `limpiarPantalla()`, logrando un regreso impecable al menú.
 */
export async function pausarParaContinuar(mensaje: string = 'Presiona Enter para volver al menú principal...'): Promise<void> {
  await preguntar(`\n${colors.dim}${mensaje}${colors.reset}`);
}

// ============================================================================
// SECCIÓN 2: EJECUCIÓN DE PROCESOS DEL SISTEMA OPERATIVO
// ============================================================================

/**
 * Ejecuta un comando en el sistema y captura toda su salida (stdout) en una cadena.
 *
 * EXPLICACIÓN PEDAGÓGICA:
 * `child_process.exec` ejecuta un comando dentro de una shell y acumula los datos
 * en un búfer de memoria. Es ideal para comandos rápidos cuya salida necesitamos
 * procesar por software (por ejemplo: `node -v`, `git rev-parse`, `git status`).
 */
function runCmd(cmd: string, cwd = ROOT_DIR): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, { cwd, windowsHide: true, maxBuffer: 1024 * 1024 * 32 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`Comando falló (${cmd}): ${stderr || err.message}`));
      } else {
        resolve((stdout || '').toString());
      }
    });
  });
}

/**
 * Ejecuta un comando transmitiendo su salida en tiempo real a la consola del usuario.
 *
 * EXPLICACIÓN PEDAGÓGICA:
 * `child_process.spawn` con `{ stdio: 'inherit' }` no guarda la salida en un buffer
 * en memoria, sino que conecta directamente los flujos de entrada/salida (stdin/stdout/stderr)
 * del proceso hijo con la terminal activa. Es la técnica correcta para compilaciones
 * largas (`cargo build`, `vite build`, `tauri build`), permitiendo que el usuario
 * vea el progreso de compilación línea por línea sin congelar la terminal.
 */
function runCmdLive(cmd: string, args: string[], cwd = ROOT_DIR): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit', shell: true });
    child.on('close', (code) => {
      if (code === 0) resolve(0);
      else reject(new Error(`Proceso finalizó con código de salida ${code}`));
    });
    child.on('error', reject);
  });
}

/**
 * Abre una carpeta de disco en el explorador de archivos nativo del sistema operativo.
 *
 * EXPLICACIÓN PEDAGÓGICA:
 * Detecta la plataforma mediante `process.platform`:
 * - En Windows ('win32'): Lanza `explorer.exe <ruta>`
 * - En macOS ('darwin'): Lanza `open <ruta>`
 * - En Linux: Lanza `xdg-open <ruta>`
 * La bandera `{ detached: true, stdio: 'ignore' }` desacopla el proceso de la ventana
 * del explorador, permitiendo que la terminal continúe su ejecución sin bloquearse.
 */
export function abrirCarpetaEnExplorador(ruta: string): void {
  try {
    if (process.platform === 'win32') {
      spawn('explorer.exe', [ruta], { detached: true, stdio: 'ignore' });
    } else if (process.platform === 'darwin') {
      spawn('open', [ruta], { detached: true, stdio: 'ignore' });
    } else {
      spawn('xdg-open', [ruta], { detached: true, stdio: 'ignore' });
    }
  } catch (err: any) {
    logWarn(`No se pudo abrir el explorador automáticamente: ${err.message}`);
  }
}

// ============================================================================
// SECCIÓN 3: CONTROL DE VERSIONES SEMVER (SEMANTIC VERSIONING)
// ============================================================================

/**
 * Estructura de datos que representa los componentes de una versión semántica.
 */
export interface VersionInfo {
  version: string;
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

/**
 * Descompone una cadena de texto en sus partes SemVer según el estándar SemVer 2.0.0.
 *
 * EXPLICACIÓN PEDAGÓGICA:
 * El estándar SemVer define que una versión tiene el formato `MAJOR.MINOR.PATCH`:
 * - MAJOR: Cambios incompatibles con versiones anteriores (breaking changes).
 * - MINOR: Nuevas funcionalidades compatibles hacia atrás.
 * - PATCH: Correcciones de errores (bug fixes) compatibles hacia atrás.
 *
 * Esta función utiliza una expresión regular para validar rigurosamente la cadena.
 * Si alguien ingresa algo inválido (como "1.5" o "v.dos"), se lanza un error explicativo.
 */
export function parseSemVer(v: string): VersionInfo {
  const clean = v.trim().replace(/^v/, '');
  const match = clean.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) {
    throw new Error(`Cadena de versión no válida según SemVer: "${v}". Formato esperado: X.Y.Z (ejemplo: 1.5.2)`);
  }
  return {
    version: clean,
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4],
  };
}

/**
 * Lee y devuelve la versión actual registrada en `package.json`.
 */
export function obtenerVersionActual(): string {
  if (!fs.existsSync(PKG_PATH)) {
    throw new Error(`No se encontró package.json en la ruta: ${PKG_PATH}`);
  }
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
  return pkg.version || '1.0.0';
}

/**
 * Calcula matemáticamente el siguiente número de versión según el tipo de incremento.
 *
 * REGLAS PEDAGÓGICAS DE SEMVER:
 * - Si se incrementa MAJOR: Se suma 1 a Major, y Minor y Patch se reinician a 0 (ej. 1.5.1 -> 2.0.0).
 * - Si se incrementa MINOR: Se mantiene Major, se suma 1 a Minor, y Patch se reinicia a 0 (ej. 1.5.1 -> 1.6.0).
 * - Si se incrementa PATCH: Se mantienen Major y Minor, y se suma 1 a Patch (ej. 1.5.1 -> 1.5.2).
 */
export function calcularSiguienteVersion(actual: string, tipo: 'patch' | 'minor' | 'major'): string {
  const parsed = parseSemVer(actual);
  switch (tipo) {
    case 'patch':
      return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
    case 'minor':
      return `${parsed.major}.${parsed.minor + 1}.0`;
    case 'major':
      return `${parsed.major + 1}.0.0`;
    default:
      throw new Error(`Tipo de incremento no reconocido: ${tipo}`);
  }
}

/**
 * Sincroniza la versión calculada en todos los manifiestos del proyecto.
 *
 * EXPLICACIÓN PEDAGÓGICA:
 * En un proyecto Tauri existen TRES archivos que guardan la versión:
 * 1. `package.json`: El ecosistema JavaScript/Node.js y las dependencias del frontend.
 * 2. `src-tauri/Cargo.toml`: El empaquetado nativo de Rust para compilar el binario .exe.
 * 3. `src-tauri/tauri.conf.json`: El generador de instaladores NSIS y MSI de Tauri.
 *
 * Si estos tres archivos no tienen exactamente la misma versión, Windows mostrará
 * metadatos contradictorios en los instaladores y el gestor de paquetes.
 * Esta función garantiza una sincronización atómica y libre de fallos humanos.
 */
export function sincronizarVersionEnArchivos(nuevaVersion: string): void {
  parseSemVer(nuevaVersion); // Valida sintaxis antes de modificar ningún archivo en disco

  logInfo(`Sincronizando versión ${colors.bright}${nuevaVersion}${colors.reset} en todos los manifiestos del proyecto...`);

  // 1. Sincronizar package.json
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
  pkg.version = nuevaVersion;
  fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  logSuccess(`package.json actualizado a ${nuevaVersion}`);

  // 2. Sincronizar src-tauri/Cargo.toml mediante expresión regular
  // Reemplazamos únicamente el campo version dentro del encabezado [package]
  if (fs.existsSync(CARGO_PATH)) {
    let cargoContent = fs.readFileSync(CARGO_PATH, 'utf8');
    const cargoRegex = /(\[package\][\s\S]*?version\s*=\s*")([^"]+)(")/;
    if (cargoRegex.test(cargoContent)) {
      cargoContent = cargoContent.replace(cargoRegex, `$1${nuevaVersion}$3`);
      fs.writeFileSync(CARGO_PATH, cargoContent, 'utf8');
      logSuccess(`src-tauri/Cargo.toml actualizado a ${nuevaVersion}`);
    } else {
      logWarn(`No se encontró bloque [package] version en ${CARGO_PATH}`);
    }
  }

  // 3. Sincronizar src-tauri/tauri.conf.json (paquete y título de ventana nativa)
  if (fs.existsSync(TAURI_CONF_PATH)) {
    const tauriConf = JSON.parse(fs.readFileSync(TAURI_CONF_PATH, 'utf8'));
    if (tauriConf.package) {
      tauriConf.package.version = nuevaVersion;
    }
    if (tauriConf.tauri?.windows?.[0]) {
      tauriConf.tauri.windows[0].title = `Sephent Transcriptor v${nuevaVersion}`;
    }
    fs.writeFileSync(TAURI_CONF_PATH, JSON.stringify(tauriConf, null, 2) + '\n', 'utf8');
    logSuccess(`src-tauri/tauri.conf.json actualizado a ${nuevaVersion} (versión y título de ventana)`);
  }

  // 4. Sincronizar src/config/appConfig.ts (constante de versión del frontend para todos los motores gráficos)
  const appConfigPath = path.join(ROOT_DIR, 'src', 'config', 'appConfig.ts');
  if (fs.existsSync(appConfigPath)) {
    let appConfigContent = fs.readFileSync(appConfigPath, 'utf8');
    const versionRegex = /(APP_VERSION\s*=\s*['"])([^'"]+)(['"])/;
    if (versionRegex.test(appConfigContent)) {
      appConfigContent = appConfigContent.replace(versionRegex, `$1${nuevaVersion}$3`);
      fs.writeFileSync(appConfigPath, appConfigContent, 'utf8');
      logSuccess(`src/config/appConfig.ts actualizado a ${nuevaVersion}`);
    }
  }

  // 5. Sincronizar index.html (título del documento web)
  const indexHtmlPath = path.join(ROOT_DIR, 'index.html');
  if (fs.existsSync(indexHtmlPath)) {
    let indexHtmlContent = fs.readFileSync(indexHtmlPath, 'utf8');
    const titleRegex = /(<title>Sephent Transcriptor)(?: v[^<]+)?(<\/title>)/;
    if (titleRegex.test(indexHtmlContent)) {
      indexHtmlContent = indexHtmlContent.replace(titleRegex, `$1 v${nuevaVersion}$2`);
      fs.writeFileSync(indexHtmlPath, indexHtmlContent, 'utf8');
      logSuccess(`index.html actualizado a Sephent Transcriptor v${nuevaVersion}`);
    }
  }
}

// ============================================================================
// SECCIÓN 4: COMPROBACIONES DE SALUD DEL ENTORNO (PRE-FLIGHT CHECKS)
// ============================================================================

/**
 * Valida la existencia y funcionamiento de todas las herramientas necesarias.
 *
 * EXPLICACIÓN PEDAGÓGICA:
 * Un error común en DevOps es comenzar una compilación larga para que falle
 * a los 10 minutos por la falta de una herramienta básica. Esta verificación
 * previa comprueba la disponibilidad de Node.js, Cargo (Rust), Tauri CLI, Git y Python.
 */
export async function verificarEntorno(): Promise<boolean> {
  logHeader('COMPROBACIÓN DE SALUD Y DEPENDENCIAS DEL ENTORNO');
  let todoListo = true;

  // 1. Entorno Node.js
  try {
    const nodeV = (await runCmd('node -v')).trim();
    logSuccess(`Node.js detectado: ${nodeV}`);
  } catch {
    logError('Node.js no está disponible en la variable PATH.');
    todoListo = false;
  }

  // 2. Compilador de Rust (Cargo)
  try {
    const cargoV = (await runCmd('cargo --version')).trim();
    logSuccess(`Rust Cargo detectado: ${cargoV}`);
  } catch {
    logError('Cargo no está disponible en PATH (imprescindible para el motor de Tauri).');
    todoListo = false;
  }

  // 3. Interfaz de comandos Tauri
  try {
    const tauriV = (await runCmd('npx tauri --version')).trim();
    logSuccess(`Tauri CLI detectado: ${tauriV}`);
  } catch {
    logError('Tauri CLI no está disponible mediante npx.');
    todoListo = false;
  }

  // 4. Sistema de control de versiones Git
  try {
    const gitV = (await runCmd('git --version')).trim();
    logSuccess(`Git detectado: ${gitV}`);
  } catch {
    logWarn('Git no detectado en PATH. Las funciones de control de cambios no estarán disponibles.');
  }

  // 5. Motor de scripting Python
  try {
    const pyV = (await runCmd('python --version')).trim();
    logSuccess(`Python detectado: ${pyV}`);
  } catch {
    logWarn('Python no detectado directamente con comando "python" (se usará detección dinámica en runtime).');
  }

  console.log('');
  if (todoListo) {
    logSuccess('El entorno cuenta con todos los prerrequisitos fundamentales para compilar.');
  } else {
    logError('Se detectaron ausencias críticas. Resuelve las dependencias señaladas antes de compilar.');
  }

  return todoListo;
}

// ============================================================================
// SECCIÓN 5: BATERÍA DE PRUEBAS UNITARIAS FORENSES
// ============================================================================

/**
 * Lista de suites de pruebas unitarias que cubren los subsistemas críticos:
 * Blindaje contra truncamiento de audio, inyección de dependencias, base de datos SQLite,
 * persistencia de estado parcial, interfaz gráfica y servicios de audio.
 */
export const TEST_SUITES = [
  'tests/antiTruncation.test.ts',
  'tests/audioTranscriptionEngine.test.ts',
  'tests/diContainer.test.ts',
  'tests/etaNormalization.test.ts',
  'tests/guiManager.test.ts',
  'tests/modelManager.test.ts',
  'tests/partialAndErrorResilience.test.ts',
  'tests/reviewer.test.ts',
  'tests/silentExecutionAndPlatform.test.ts',
  'tests/transcriptionDatabase.test.ts',
  'tests/transcriptionGroups.test.ts',
  'tests/transcriptionIntegrity.test.ts',
  'tests/transcriptionService.test.ts',
  'tests/userSettings.test.ts',
];

/**
 * Ejecuta de forma secuencial y controlada cada suite de prueba unitaria.
 *
 * EXPLICACIÓN PEDAGÓGICA:
 * ¿Por qué no usamos `npm test` con comandos encadenados por `&&`?
 * En entornos Windows PowerShell o en shells restringidas, los operadores `&&`
 * pueden interpretarse de manera inconsistente y romper la ejecución.
 * Ejecutar cada suite aisladamente mediante `npx tsx` garantiza:
 * 1. Control exacto de qué prueba falló con un mensaje claro y legible.
 * 2. Cero falsos positivos causados por el parser de la shell del sistema operativo.
 * 3. Protección de calidad: Si una sola prueba falla, se detiene la liberación.
 */
export async function ejecutarPruebas(): Promise<boolean> {
  logHeader(`EJECUTANDO BATERÍA DE PRUEBAS UNITARIAS FORENSES (${TEST_SUITES.length} SUITES)`);
  let exitosas = 0;

  for (const testFile of TEST_SUITES) {
    process.stdout.write(`  ⏳ Probando ${testFile}... `);
    try {
      await runCmd(`npx tsx "${testFile}"`);
      process.stdout.write(`${colors.green}✔ PASÓ${colors.reset}\n`);
      exitosas++;
    } catch (err: any) {
      process.stdout.write(`${colors.red}✖ FALLÓ${colors.reset}\n`);
      logError(`Detalle del fallo en la prueba ${testFile}:\n${err.message}`);
      return false;
    }
  }

  logSuccess(`Todas las pruebas pasaron satisfactoriamente (${exitosas}/${TEST_SUITES.length}). Integridad validada.\n`);
  return true;
}

// ============================================================================
// SECCIÓN 6: COMPILACIÓN DEL FRONTEND (VITE + TYPESCRIPT)
// ============================================================================

/**
 * Compila el frontend web y sincroniza las carpetas `dist/` y `dist-web/`.
 *
 * EXPLICACIÓN PEDAGÓGICA:
 * El frontend está desarrollado en React con TypeScript. Para generar los archivos:
 * 1. `npx tsc --noEmit`: Realiza una verificación estricta de tipos de todo el código
 *    sin emitir archivos. Si hay una discrepancia de tipos, falla aquí antes de empaquetar.
 * 2. `npx vite build`: Toma el código TSX/CSS y genera un bundle optimizado, minificado
 *    y empaquetado para producción en `dist-web/` (la carpeta que lee Tauri).
 * 3. Sincronización a `dist/`: Copia recursivamente el resultado para que el proyecto
 *    tenga disponibles los artefactos web tanto en `dist/` como en `dist-web/`.
 */
export async function compilarFrontend(): Promise<{ distWeb: string; dist: string }> {
  logHeader('COMPILACIÓN DEL FRONTEND WEB (TYPESCRIPT + VITE)');

  // Paso 1: Verificación de tipos estática
  logInfo('Ejecutando npx tsc --noEmit (verificación estricta de tipos TypeScript)...');
  await runCmdLive('npx', ['tsc', '--noEmit']);
  logSuccess('Verificación de tipos TypeScript completada sin ningún error.');

  // Paso 2: Compilación de producción con Vite
  logInfo('Ejecutando npx vite build (empaquetado para producción)...');
  await runCmdLive('npx', ['vite', 'build']);
  logSuccess('Artefactos web compilados exitosamente en dist-web.');

  // Paso 3: Sincronización en la carpeta dist/ de la raíz
  logInfo('Sincronizando artefactos web en la carpeta dist/ del root...');
  copiarCarpetaRecursivo(DIST_WEB_DIR, DIST_DIR);
  logSuccess('Artefactos web sincronizados en ambas carpetas de distribución.');

  console.log(`\n  ${colors.bright}Ubicaciones de archivos web generados:${colors.reset}`);
  console.log(`    📁 ${DIST_DIR}`);
  console.log(`    📁 ${DIST_WEB_DIR}\n`);

  return { distWeb: DIST_WEB_DIR, dist: DIST_DIR };
}

// ============================================================================
// SECCIÓN 7: COMPILACIÓN Y GENERACIÓN EN LA CARPETA ÚNICA "instalables/"
// ============================================================================

export interface OpcionesCompilacion {
  compilarInstaladores?: boolean;
  compilarStandalone?: boolean;
}

/**
 * Orquesta la compilación de ejecutables nativos y organiza el directorio único `instalables/`.
 *
 * EXPLICACIÓN PEDAGÓGICA:
 * En lugar de dejar instaladores esparcidos en carpetas internas como
 * `src-tauri/target/release/bundle/nsis`, este proceso:
 * 1. Garantiza que exista la carpeta única `instalables/` en el root del proyecto.
 * 2. Compila el frontend actualizado.
 * 3. Ejecuta `tauri build` para generar los instaladores de Windows:
 *    - Instalador ejecutable estándar NSIS (`Sephent-Transcriptor-<version>-Setup.exe`)
 *    - Instalador corporativo MSI (`Sephent-Transcriptor-<version>.msi`)
 * 4. Copia el binario standalone compilado (`.exe` directo) para uso portable sin instalación.
 * 5. Empaqueta un archivo `.zip` portable autocontenido con las dependencias Python (`tools/`)
 *    y la librería `WebView2Loader.dll`.
 * 6. Genera un manifiesto criptográfico `SHA256SUMS.txt` para auditoría y verificación.
 */
export async function compilarEjecutables(opciones: OpcionesCompilacion = {}): Promise<string[]> {
  const { compilarInstaladores = true, compilarStandalone = true } = opciones;
  const version = obtenerVersionActual();
  const artefactosGenerados: string[] = [];

  logHeader(`COMPILACIÓN DE INSTALABLES Y PORTABLE PARA WINDOWS (v${version})`);
  logInfo(`Carpeta destino única en el root: ${colors.bright}${INSTALABLES_DIR}${colors.reset}`);

  // Asegurar la existencia de la carpeta única en el root
  if (!fs.existsSync(INSTALABLES_DIR)) {
    fs.mkdirSync(INSTALABLES_DIR, { recursive: true });
  }

  // Paso 1: Compilar el frontend web
  await compilarFrontend();

  // Paso 2: Compilación nativa con Tauri / Cargo
  if (compilarInstaladores) {
    logInfo('Compilando paquete Tauri (Instalador NSIS .exe e instalador MSI)...');
    await runCmdLive('npx', ['tauri', 'build']);
    logSuccess('Compilación de paquetes e instaladores Tauri completada.');
  } else if (compilarStandalone) {
    logInfo('Compilando binario standalone en modo release con Rust Cargo...');
    await runCmdLive('cargo', ['build', '--release'], path.join(ROOT_DIR, 'src-tauri'));
    logSuccess('Compilación de binario standalone completada.');
  }

  // Paso 3: Identificar y organizar artefactos en la carpeta "instalables/"
  const targetReleaseDir = path.join(ROOT_DIR, 'src-tauri', 'target', 'release');
  const bundleNsisDir = path.join(targetReleaseDir, 'bundle', 'nsis');
  const bundleMsiDir = path.join(targetReleaseDir, 'bundle', 'msi');

  // 3.1 Binario Standalone (Sephent Transcriptor.exe)
  const exeStandaloneCandidates = [
    path.join(targetReleaseDir, 'Sephent Transcriptor.exe'),
    path.join(targetReleaseDir, 'app.exe'),
  ];
  let standaloneExePath: string | null = null;
  for (const c of exeStandaloneCandidates) {
    if (fs.existsSync(c)) {
      standaloneExePath = c;
      break;
    }
  }

  if (standaloneExePath) {
    // A) Ejecutable portable con versión en el nombre dentro de instalables/
    const destVersionedPortable = path.join(INSTALABLES_DIR, `Sephent-Transcriptor-${version}-Portable.exe`);
    fs.copyFileSync(standaloneExePath, destVersionedPortable);
    artefactosGenerados.push(destVersionedPortable);
    logSuccess(`Ejecutable Portable Nombrado: ${path.basename(destVersionedPortable)}`);

    // B) Ejecutable portable directo sin versión ("Sephent Transcriptor.exe") para doble clic inmediato
    const destDirectPortable = path.join(INSTALABLES_DIR, 'Sephent Transcriptor.exe');
    fs.copyFileSync(standaloneExePath, destDirectPortable);
    artefactosGenerados.push(destDirectPortable);
    logSuccess(`Ejecutable Portable Directo: ${path.basename(destDirectPortable)}`);

    // C) Sincronizar tools dentro de instalables/ para funcionamiento autónomo
    const toolsSrc = path.join(ROOT_DIR, 'tools');
    const toolsDst = path.join(INSTALABLES_DIR, 'tools');
    copiarCarpetaRecursivo(toolsSrc, toolsDst);

    // D) Sincronizar WebView2Loader.dll si existe
    const webviewSrc = path.join(ROOT_DIR, 'src-tauri', 'WebView2Loader.dll');
    if (fs.existsSync(webviewSrc)) {
      const webviewDst = path.join(INSTALABLES_DIR, 'WebView2Loader.dll');
      fs.copyFileSync(webviewSrc, webviewDst);
      artefactosGenerados.push(webviewDst);
    }
  }

  // 3.2 Instalador NSIS Setup (.exe) en instalables/
  if (fs.existsSync(bundleNsisDir)) {
    const nsisFiles = fs.readdirSync(bundleNsisDir).filter((f) => f.endsWith('.exe'));
    for (const f of nsisFiles) {
      if (f.includes(version)) {
        const src = path.join(bundleNsisDir, f);
        const dst = path.join(INSTALABLES_DIR, `Sephent-Transcriptor-${version}-Setup.exe`);
        fs.copyFileSync(src, dst);
        artefactosGenerados.push(dst);
        logSuccess(`Instalador NSIS Setup (.exe): ${path.basename(dst)}`);
      }
    }
  }

  // 3.3 Instalador MSI (.msi) en instalables/
  if (fs.existsSync(bundleMsiDir)) {
    const msiFiles = fs.readdirSync(bundleMsiDir).filter((f) => f.endsWith('.msi'));
    for (const f of msiFiles) {
      if (f.includes(version)) {
        const src = path.join(bundleMsiDir, f);
        const dst = path.join(INSTALABLES_DIR, `Sephent-Transcriptor-${version}.msi`);
        fs.copyFileSync(src, dst);
        artefactosGenerados.push(dst);
        logSuccess(`Instalador MSI (.msi): ${path.basename(dst)}`);
      }
    }
  }

  // 3.4 Creación del paquete ZIP portable listo para distribución
  try {
    const zipName = `Sephent-Transcriptor-${version}-Portable.zip`;
    const zipDst = path.join(INSTALABLES_DIR, zipName);
    if (fs.existsSync(zipDst)) fs.unlinkSync(zipDst);

    logInfo(`Empaquetando archivo ZIP portable listo para compartir (${zipName})...`);

    // Crear carpeta temporal staging para el ZIP
    const stagingDir = path.join(ROOT_DIR, 'temp_portable_staging');
    if (fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true, force: true });
    fs.mkdirSync(stagingDir, { recursive: true });

    if (standaloneExePath && fs.existsSync(standaloneExePath)) {
      fs.copyFileSync(standaloneExePath, path.join(stagingDir, 'Sephent Transcriptor.exe'));
    }
    const webviewSrc = path.join(ROOT_DIR, 'src-tauri', 'WebView2Loader.dll');
    if (fs.existsSync(webviewSrc)) {
      fs.copyFileSync(webviewSrc, path.join(stagingDir, 'WebView2Loader.dll'));
    }
    copiarCarpetaRecursivo(path.join(ROOT_DIR, 'tools'), path.join(stagingDir, 'tools'));
    sanitizarTimestamps(stagingDir);

    // Compresión nativa mediante PowerShell
    await runCmd(`powershell -Command "Compress-Archive -Path '${stagingDir}/*' -DestinationPath '${zipDst}' -Force"`);

    if (fs.existsSync(stagingDir)) {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    }

    if (fs.existsSync(zipDst)) {
      artefactosGenerados.push(zipDst);
      logSuccess(`Paquete ZIP Portable: ${zipName}`);
    }
  } catch (e: any) {
    logWarn(`No se pudo generar el archivo ZIP portable automático: ${e.message}`);
  }

  // Paso 4: Generación del manifiesto criptográfico SHA-256
  if (artefactosGenerados.length > 0) {
    const manifestPath = await generarManifiestoSHA256(INSTALABLES_DIR, artefactosGenerados);
    artefactosGenerados.push(manifestPath);
  }

  return artefactosGenerados;
}

/**
 * Copia un directorio de forma recursiva omitiendo cachés de Python (__pycache__, .pyc).
 */
export function copiarCarpetaRecursivo(origen: string, destino: string): void {
  if (!fs.existsSync(origen)) return;
  if (!fs.existsSync(destino)) {
    fs.mkdirSync(destino, { recursive: true });
  }

  const entradas = fs.readdirSync(origen, { withFileTypes: true });
  for (const entrada of entradas) {
    const rutaOrigen = path.join(origen, entrada.name);
    const rutaDestino = path.join(destino, entrada.name);

    // Ignorar cachés compilados de Python que no aportan valor a la distribución
    if (entrada.name === '__pycache__' || entrada.name.endsWith('.pyc')) {
      continue;
    }

    if (entrada.isDirectory()) {
      copiarCarpetaRecursivo(rutaOrigen, rutaDestino);
    } else {
      fs.copyFileSync(rutaOrigen, rutaDestino);
    }
  }
}

/**
 * Sanitiza las marcas temporales de los archivos para garantizar reproducibilidad.
 *
 * EXPLICACIÓN PEDAGÓGICA (Reproducible Builds):
 * Si empaquetamos un archivo ZIP dos veces consecutivas, el hash SHA-256 del ZIP
 * cambiaría si las fechas de modificación de los archivos difieren por segundos.
 * Al fijar una fecha determinista (2024-01-01), logramos empaquetados reproducibles.
 */
export function sanitizarTimestamps(dir: string): void {
  if (!fs.existsSync(dir)) return;
  const entradas = fs.readdirSync(dir, { withFileTypes: true });
  const fechaSegura = new Date('2024-01-01T00:00:00Z');
  for (const entrada of entradas) {
    const rutaCompleta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      sanitizarTimestamps(rutaCompleta);
    } else {
      try {
        fs.utimesSync(rutaCompleta, fechaSegura, fechaSegura);
      } catch {}
    }
  }
}

/**
 * Genera el manifiesto de hashes criptográficos SHA-256 para integridad forense.
 *
 * EXPLICACIÓN PEDAGÓGICA:
 * Un hash SHA-256 es una huella digital única de 256 bits (64 caracteres hexadecimales).
 * En el ámbito forense y judicial, calcular el hash de los instaladores asegura:
 * 1. Integridad: Demuestra que el ejecutable no se corrompió durante la descarga.
 * 2. Autenticidad: Confirma que ningún tercero modificó el binario con código malicioso.
 * 3. Trazabilidad: Permite contrastar el hash contra el repositorio oficial.
 */
export async function generarManifiestoSHA256(carpetaSalida: string, archivos: string[]): Promise<string> {
  logInfo('Calculando firmas criptográficas SHA-256 para integridad forense...');
  const lineas: string[] = [
    `# ==============================================================================`,
    `# Sephent Transcriptor — Manifiesto de Integridad Criptográfica SHA-256`,
    `# Ubicación de archivos: ${carpetaSalida}`,
    `# Fecha de generación: ${new Date().toISOString()}`,
    `# ==============================================================================`,
    ``,
  ];

  for (const archivo of archivos) {
    if (archivo.endsWith('SHA256SUMS.txt') || !fs.existsSync(archivo)) continue;
    const stats = fs.statSync(archivo);
    if (stats.isDirectory()) continue;

    const buffer = fs.readFileSync(archivo);
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const nombre = path.basename(archivo);
    const tamanoMB = (buffer.length / (1024 * 1024)).toFixed(2);
    lineas.push(`${hash}  ${nombre}  (${tamanoMB} MB)`);
    log(`  🔒 ${colors.cyan}${nombre}${colors.reset} -> ${colors.yellow}${hash}${colors.reset}`);
  }

  const manifestPath = path.join(carpetaSalida, 'SHA256SUMS.txt');
  fs.writeFileSync(manifestPath, lineas.join('\n') + '\n', 'utf8');
  logSuccess(`Manifiesto de firmas guardado en: ${manifestPath}`);
  return manifestPath;
}

// ============================================================================
// SECCIÓN 8: REPORTE FINAL DE UBICACIÓN DE ARTEFACTOS
// ============================================================================

/**
 * Muestra el reporte final formateado, detallando la ubicación exacta de cada archivo.
 *
 * EXPLICACIÓN PEDAGÓGICA:
 * El usuario no debe adivinar dónde quedaron los instalables. Esta función
 * imprime las rutas absolutas completas, tamaños en megabytes y etiquetas
 * descriptivas para cada artefacto en la carpeta `instalables/`.
 */
export function mostrarReporteInstalables(version: string, artefactos: string[]): string {
  logHeader('📦 REPORTE FINAL: UBICACIÓN DE INSTALABLES Y PORTABLE');
  console.log(`  ${colors.bright}Versión compilada:${colors.reset} ${colors.green}v${version}${colors.reset}`);
  console.log(`  ${colors.bright}Carpeta única en el ROOT del proyecto:${colors.reset}`);
  console.log(`  ${colors.bright}${colors.yellow}📁 ${INSTALABLES_DIR}${colors.reset}\n`);

  console.log(`  ${colors.bright}Todos los artefactos fueron generados en:${colors.reset}`);
  console.log(`  ${colors.cyan}${'─'.repeat(70)}${colors.reset}`);

  if (artefactos.length === 0) {
    console.log(`  ${colors.yellow}⚠ No se encontraron artefactos empaquetados en la carpeta instalables/.${colors.reset}`);
  } else {
    // Filtrar duplicados y directorios
    const unicos = Array.from(new Set(artefactos)).filter((a) => fs.existsSync(a) && !fs.statSync(a).isDirectory());

    for (const art of unicos) {
      const nombre = path.basename(art);
      let etiqueta = '📄 Archivo';
      if (nombre.endsWith('-Setup.exe')) etiqueta = '📦 Instalador NSIS Setup (.exe)';
      else if (nombre.endsWith('.msi')) etiqueta = '📦 Instalador Administrativo MSI (.msi)';
      else if (nombre.endsWith('-Portable.exe')) etiqueta = '⚡ Ejecutable Portable Nombrado (.exe)';
      else if (nombre === 'Sephent Transcriptor.exe') etiqueta = '⚡ Ejecutable Portable Directo (.exe listo para usar)';
      else if (nombre.endsWith('-Portable.zip')) etiqueta = '🗜️ Paquete ZIP Portable (.zip listo para compartir)';
      else if (nombre === 'WebView2Loader.dll') etiqueta = '🔧 Librería Nativa Requerida (DLL)';
      else if (nombre.endsWith('SHA256SUMS.txt')) etiqueta = '🛡️ Manifiesto Criptográfico SHA-256';

      let tamanoStr = '';
      if (fs.existsSync(art)) {
        const stats = fs.statSync(art);
        const mb = (stats.size / (1024 * 1024)).toFixed(2);
        tamanoStr = `(${mb} MB)`;
      }

      console.log(`\n  ${colors.bright}${colors.white}${etiqueta}${colors.reset}`);
      console.log(`    ${colors.green}• Ruta:${colors.reset}   ${art}`);
      if (tamanoStr) {
        console.log(`    ${colors.cyan}• Tamaño:${colors.reset} ${tamanoStr}`);
      }
    }
  }

  const toolsEnInstalables = path.join(INSTALABLES_DIR, 'tools');
  if (fs.existsSync(toolsEnInstalables)) {
    console.log(`\n  ${colors.bright}${colors.white}📂 Subsistema de Herramientas Acoplado:${colors.reset}`);
    console.log(`    ${colors.green}• Ruta:${colors.reset}   ${toolsEnInstalables}`);
    console.log(`    ${colors.cyan}• Estado:${colors.reset} whisper_runner.py y diarización listos para ejecución autónoma.`);
  }

  console.log(`\n  ${colors.cyan}${'─'.repeat(70)}${colors.reset}\n`);
  return INSTALABLES_DIR;
}

// ============================================================================
// SECCIÓN 9: CONTROL DE CAMBIOS GIT (ADD, COMMIT, PUSH)
// ============================================================================

/**
 * Consulta la rama Git activa en el repositorio local.
 */
export async function obtenerRamaGitActual(): Promise<string> {
  try {
    const rama = (await runCmd('git rev-parse --abbrev-ref HEAD')).trim();
    return rama || 'principal';
  } catch {
    return 'principal';
  }
}

/**
 * Verifica si existen cambios pendientes en el árbol de trabajo (working tree).
 */
export async function obtenerEstadoGit(): Promise<{ cambiosPendientes: boolean; resumen: string }> {
  try {
    const status = (await runCmd('git status -s')).trim();
    return {
      cambiosPendientes: status.length > 0,
      resumen: status,
    };
  } catch (err: any) {
    return {
      cambiosPendientes: false,
      resumen: `Error obteniendo estado git: ${err.message}`,
    };
  }
}

/**
 * Añade todos los cambios al área de preparación de Git (`git add .`).
 */
export async function ejecutarGitAdd(): Promise<void> {
  logInfo('Ejecutando git add . ...');
  await runCmdLive('git', ['add', '.']);
  logSuccess('Todos los cambios fueron agregados al área de preparación (git add .).');
}

/**
 * Registra un nuevo commit en el repositorio local con el mensaje especificado.
 */
export async function ejecutarGitCommit(mensaje: string): Promise<void> {
  logInfo(`Ejecutando git commit con mensaje: "${mensaje}"...`);
  await runCmdLive('git', ['commit', '-m', `"${mensaje}"`]);
  logSuccess('Commit creado exitosamente en el repositorio local.');
}

/**
 * Envía los commits registrados localmente hacia el repositorio remoto (`git push`).
 */
export async function ejecutarGitPush(rama?: string): Promise<void> {
  const ramaDestino = rama || (await obtenerRamaGitActual());
  logHeader(`SUBIENDO CAMBIOS AL REPOSITORIO REMOTO (GIT PUSH ORIGIN ${ramaDestino.toUpperCase()})`);
  logInfo(`Ejecutando git push origin ${ramaDestino}...`);
  await runCmdLive('git', ['push', 'origin', ramaDestino]);
  logSuccess(`Cambios enviados exitosamente al repositorio remoto en la rama "${ramaDestino}".`);
}

/**
 * Ejecuta el flujo interactivo guiado de Git solicitando confirmación al desarrollador.
 *
 * EXPLICACIÓN PEDAGÓGICA:
 * Siguiendo las directrices de seguridad y buenas prácticas, NUNCA se debe ejecutar
 * un `git push` no solicitado. Este flujo muestra los archivos modificados, permite
 * personalizar el mensaje de commit y solicita confirmación expresa antes de enviar
 * código al servidor remoto.
 */
export async function ejecutarFlujoGitInteractivo(mensajeSugerido?: string): Promise<void> {
  logHeader('CONTROL DE VERSIONES GIT: ADD, COMMIT Y PUSH');

  const { cambiosPendientes, resumen } = await obtenerEstadoGit();
  const rama = await obtenerRamaGitActual();

  console.log(`  ${colors.bright}Rama Git activa:${colors.reset} ${colors.green}${rama}${colors.reset}\n`);

  if (!cambiosPendientes) {
    logInfo('No hay cambios pendientes en el directorio de trabajo (working tree limpio).');
    const empujar = (await preguntar(`¿Deseas ejecutar git push origin ${rama} para enviar commits locales pendientes? (s/n) [s]: `)).trim().toLowerCase();
    if (empujar !== 'n' && empujar !== 'no') {
      try {
        await ejecutarGitPush(rama);
      } catch (e: any) {
        logError(`Error en git push: ${e.message}`);
      }
    } else {
      logWarn('Operación git push omitida.');
    }
    return;
  }

  console.log(`  ${colors.bright}Archivos con cambios detectados:${colors.reset}\n`);
  for (const line of resumen.split('\n')) {
    console.log(`    ${colors.yellow}${line}${colors.reset}`);
  }
  console.log('');

  const confirmarAdd = (await preguntar(`¿Deseas agregar todos los cambios (git add .) y registrar commit? (s/n) [s]: `)).trim().toLowerCase();
  if (confirmarAdd !== 'n' && confirmarAdd !== 'no') {
    await ejecutarGitAdd();

    const versionActual = obtenerVersionActual();
    const defaultMsg = mensajeSugerido || `release: v${versionActual}`;
    const msgInput = (await preguntar(`Mensaje para el commit [Enter para "${defaultMsg}"]: `)).trim();
    const finalMsg = msgInput || defaultMsg;

    await ejecutarGitCommit(finalMsg);

    const confirmarPush = (await preguntar(`\n¿Deseas subir los cambios al repositorio remoto ahora (git push origin ${rama})? (s/n) [s]: `)).trim().toLowerCase();
    if (confirmarPush !== 'n' && confirmarPush !== 'no') {
      try {
        await ejecutarGitPush(rama);
      } catch (e: any) {
        logError(`Error en git push: ${e.message}`);
      }
    } else {
      logInfo('El commit fue registrado localmente. Puedes hacer git push cuando lo desees.');
    }
  } else {
    logWarn('Operación git cancelada por el usuario.');
  }
}

// ============================================================================
// SECCIÓN 10: PIPELINE INTEGRAL TODO-EN-UNO (DEVOPS COMPLETO)
// ============================================================================

/**
 * Ejecuta el ciclo completo de liberación en un solo flujo automático:
 * 1. Verificación de herramientas del entorno.
 * 2. Ejecución estricta de las 13 pruebas unitarias forenses.
 * 3. Incremento y sincronización de versión SemVer.
 * 4. Compilación del frontend web y sincronización de carpetas dist.
 * 5. Compilación de instaladores y portables en `instalables/`.
 * 6. Reporte detallado de ubicación de los instalables.
 * 7. Git add, commit y push al repositorio remoto.
 */
export async function ejecutarPipelineCompleto(
  tipoBump: 'patch' | 'minor' | 'major' | 'mantener',
  opciones: { omitirPruebas?: boolean; hacerPush?: boolean } = {}
): Promise<void> {
  const versionActual = obtenerVersionActual();
  const siguienteVersion = tipoBump === 'mantener'
    ? versionActual
    : calcularSiguienteVersion(versionActual, tipoBump);

  logHeader(`PIPELINE COMPLETO DE LIBERACIÓN: v${versionActual} → v${siguienteVersion}`);

  // 1. Verificación del entorno
  const entornoOk = await verificarEntorno();
  if (!entornoOk) {
    throw new Error('El entorno no cuenta con todas las herramientas necesarias.');
  }

  // 2. Pruebas Unitarias
  if (!opciones.omitirPruebas) {
    const pruebasOk = await ejecutarPruebas();
    if (!pruebasOk) {
      throw new Error('La suite de pruebas unitarias falló. Se aborta la liberación para proteger la integridad del software.');
    }
  } else {
    logWarn('Pruebas unitarias omitidas por bandera explícita.');
  }

  // 3. Sincronizar versión si hubo incremento
  if (tipoBump !== 'mantener') {
    sincronizarVersionEnArchivos(siguienteVersion);
  }

  // 4. Compilar Ejecutables e Instaladores directamente en instalables/
  const artefactos = await compilarEjecutables({ compilarInstaladores: true, compilarStandalone: true });

  // 5. Reportar ubicación de instalables
  const carpeta = mostrarReporteInstalables(siguienteVersion, artefactos);

  // 6. Flujo Git si fue solicitado
  if (opciones.hacerPush) {
    await ejecutarGitAdd();
    await ejecutarGitCommit(`release: v${siguienteVersion}`);
    await ejecutarGitPush();
  }

  logHeader('LIBERACIÓN FINALIZADA CON ÉXITO');
  logSuccess(`Versión v${siguienteVersion} generada, empaquetada y documentada satisfactoriamente.`);
  logInfo(`Carpeta única de instalables en root: ${carpeta}`);
}

// ============================================================================
// SECCIÓN 11: INTERFAZ INTERACTIVA GUIADA POR MENÚ
// ============================================================================

/**
 * Función auxiliar para solicitar una respuesta al usuario desde la consola.
 */
function preguntar(pregunta: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(pregunta, (respuesta) => {
      rl.close();
      resolve(respuesta);
    });
  });
}

/**
 * Inicia el menú interactivo guiado.
 *
 * EXPLICACIÓN PEDAGÓGICA (UX LIMPIA CON LIMPIEZA DE PANTALLA):
 * - Al comenzar cada iteración del bucle `while (!salir)`, se ejecuta `limpiarPantalla()`.
 *   Esto asegura que el menú SIEMPRE aparezca en la parte superior, limpio y centrado.
 * - Tras seleccionar y ejecutar cualquiera de las opciones (1 a 10), el usuario
 *   puede ver cómodamente todos los registros y reportes generados.
 * - Al terminar la opción, se llama a `pausarParaContinuar()` ("Presiona Enter para volver...").
 * - Cuando el usuario pulsa Enter, el bucle repite su ciclo, invoca `limpiarPantalla()`
 *   y vuelve a dibujar el menú completamente limpio con los datos actualizados.
 */
export async function iniciarModoInteractivo(): Promise<void> {
  let salir = false;

  while (!salir) {
    // Limpieza de pantalla para garantizar que el menú principal siempre esté impecable
    limpiarPantalla();

    const actual = obtenerVersionActual();
    const patchNext = calcularSiguienteVersion(actual, 'patch');
    const minorNext = calcularSiguienteVersion(actual, 'minor');
    const majorNext = calcularSiguienteVersion(actual, 'major');
    const ramaActual = await obtenerRamaGitActual();

    logHeader('SEPHENT TRANSCRIPTOR — GESTOR DE VERSIONES Y GENERACIÓN DE INSTALABLES');
    console.log(`  ${colors.bright}Versión actual:${colors.reset}    ${colors.green}v${actual}${colors.reset}`);
    console.log(`  ${colors.bright}Carpeta de salida:${colors.reset} ${colors.yellow}instalables/${colors.reset} (carpeta única en el root)`);
    console.log(`  ${colors.bright}Rama Git activa:${colors.reset}   ${colors.cyan}${ramaActual}${colors.reset}\n`);

    console.log(`  ${colors.cyan}[1]${colors.reset}  Subir versión ${colors.bright}PATCH${colors.reset}  (${actual} → ${colors.yellow}${patchNext}${colors.reset}) y sincronizar manifiestos`);
    console.log(`  ${colors.cyan}[2]${colors.reset}  Subir versión ${colors.bright}MINOR${colors.reset}  (${actual} → ${colors.yellow}${minorNext}${colors.reset}) y sincronizar manifiestos`);
    console.log(`  ${colors.cyan}[3]${colors.reset}  Subir versión ${colors.bright}MAJOR${colors.reset}  (${actual} → ${colors.yellow}${majorNext}${colors.reset}) y sincronizar manifiestos`);
    console.log(`  ${colors.cyan}[4]${colors.reset}  Ingresar versión personalizada manual`);
    console.log(`  ${colors.cyan}[5]${colors.reset}  ${colors.bright}Generar archivos en dist${colors.reset} (dist/ y dist-web/)`);
    console.log(`  ${colors.cyan}[6]${colors.reset}  ${colors.bright}${colors.green}GENERAR TODOS LOS INSTALABLES Y EL PORTABLE EN "instalables/"${colors.reset}`);
    console.log(`  ${colors.cyan}[7]${colors.reset}  ${colors.bright}Control de cambios Git${colors.reset}: git add, git commit y git push`);
    console.log(`  ${colors.cyan}[8]${colors.reset}  ${colors.bright}${colors.yellow}PIPELINE COMPLETO TODO-EN-UNO${colors.reset} (Bump + Tests + Dist + Instalables + Git)`);
    console.log(`  ${colors.cyan}[9]${colors.reset}  Ejecutar batería de 13 pruebas unitarias forenses`);
    console.log(`  ${colors.cyan}[10]${colors.reset} Comprobar salud y dependencias del entorno`);
    console.log(`  ${colors.cyan}[0]${colors.reset}  Salir\n`);

    const opcion = (await preguntar(`${colors.bright}Selecciona una opción [0-10]: ${colors.reset}`)).trim();

    try {
      switch (opcion) {
        case '1': {
          sincronizarVersionEnArchivos(patchNext);
          logSuccess(`Versión actualizada exitosamente a ${patchNext}`);
          break;
        }
        case '2': {
          sincronizarVersionEnArchivos(minorNext);
          logSuccess(`Versión actualizada exitosamente a ${minorNext}`);
          break;
        }
        case '3': {
          sincronizarVersionEnArchivos(majorNext);
          logSuccess(`Versión actualizada exitosamente a ${majorNext}`);
          break;
        }
        case '4': {
          const personalizada = (await preguntar(`Ingresa la nueva versión (SemVer X.Y.Z): `)).trim();
          sincronizarVersionEnArchivos(personalizada);
          logSuccess(`Versión actualizada exitosamente a ${personalizada}`);
          break;
        }
        case '5': {
          const rutas = await compilarFrontend();
          console.log(`\n  ${colors.bright}Archivos generados exitosamente en:${colors.reset}`);
          console.log(`    📁 ${rutas.dist}`);
          console.log(`    📁 ${rutas.distWeb}\n`);
          break;
        }
        case '6': {
          logHeader(`GENERANDO TODOS LOS INSTALABLES Y EL PORTABLE EN instalables/ (v${actual})`);
          const artefactos = await compilarEjecutables({ compilarInstaladores: true, compilarStandalone: true });
          const carpeta = mostrarReporteInstalables(actual, artefactos);

          const abrir = (await preguntar(`¿Deseas abrir la carpeta "instalables" en el Explorador de Windows? (s/n) [s]: `)).trim().toLowerCase();
          if (abrir !== 'n' && abrir !== 'no') {
            abrirCarpetaEnExplorador(carpeta);
          }
          break;
        }
        case '7': {
          await ejecutarFlujoGitInteractivo();
          break;
        }
        case '8': {
          console.log(`\n¿Qué tipo de incremento deseas aplicar para el release?`);
          console.log(`  [1] PATCH (${actual} → ${patchNext})`);
          console.log(`  [2] MINOR (${actual} → ${minorNext})`);
          console.log(`  [3] MAJOR (${actual} → ${majorNext})`);
          console.log(`  [4] MANTENER versión actual (${actual})`);
          const sub = (await preguntar(`Elige incremento [1-4] [1]: `)).trim();
          let tipo: 'patch' | 'minor' | 'major' | 'mantener' = 'patch';
          if (sub === '2') tipo = 'minor';
          else if (sub === '3') tipo = 'major';
          else if (sub === '4') tipo = 'mantener';

          const verFinal = tipo === 'mantener' ? actual : calcularSiguienteVersion(actual, tipo);

          // 1. Pruebas unitarias
          const pruebasOk = await ejecutarPruebas();
          if (!pruebasOk) {
            logError('Pruebas unitarias fallaron. Se cancela el pipeline.');
            break;
          }

          // 2. Sincronizar versión si hubo incremento
          if (tipo !== 'mantener') {
            sincronizarVersionEnArchivos(verFinal);
          }

          // 3. Compilar frontend e instalables en instalables/
          const artefactos = await compilarEjecutables({ compilarInstaladores: true, compilarStandalone: true });

          // 4. Reporte detallado de dónde se generaron los instalables
          const carpeta = mostrarReporteInstalables(verFinal, artefactos);

          // 5. Preguntar si se desea registrar y subir a Git
          const hacerGit = (await preguntar(`\n¿Deseas ejecutar git add, commit y git push para v${verFinal}? (s/n) [s]: `)).trim().toLowerCase();
          if (hacerGit !== 'n' && hacerGit !== 'no') {
            await ejecutarFlujoGitInteractivo(`release: v${verFinal}`);
          }

          // 6. Preguntar si se desea abrir la carpeta en el explorador
          const abrir = (await preguntar(`¿Deseas abrir la carpeta "instalables" en el Explorador de Windows? (s/n) [s]: `)).trim().toLowerCase();
          if (abrir !== 'n' && abrir !== 'no') {
            abrirCarpetaEnExplorador(carpeta);
          }
          break;
        }
        case '9': {
          await ejecutarPruebas();
          break;
        }
        case '10': {
          await verificarEntorno();
          break;
        }
        case '0': {
          salir = true;
          limpiarPantalla();
          logHeader('SESIÓN FINALIZADA');
          logSuccess('Has salido exitosamente del gestor maestro de Sephent Transcriptor.');
          logInfo('¡Hasta pronto!\n');
          break;
        }
        default:
          logWarn('Opción no reconocida. Ingresa un número del 0 al 10.');
      }
    } catch (err: any) {
      logError(`Error durante la operación: ${err.message}`);
    }

    // Si el usuario no seleccionó salir, pausamos para que pueda leer la salida
    // y al presionar Enter, el bucle repetirá y limpiará la pantalla automáticamente
    if (!salir) {
      await pausarParaContinuar();
    }
  }
}

// ============================================================================
// SECCIÓN 12: MANEJO DE ARGUMENTOS CLI (MODO DIRECTO / AUTOMATIZADO)
// ============================================================================

/**
 * Punto de entrada principal para procesar argumentos de la línea de comandos.
 *
 * EXPLICACIÓN PEDAGÓGICA:
 * Si el usuario ejecuta `release.ts` sin ningún argumento adicional, se abre
 * el menú interactivo guiado. Si se proporcionan argumentos como `--help`, `--patch`,
 * `--dist-only` o `--installers-only`, el script opera en modo directo desatendido.
 */
export async function main() {
  const args = process.argv.slice(2);

  // Despliegue de la ayuda
  if (args.includes('--help') || args.includes('-h')) {
    limpiarPantalla();
    console.log(`
${colors.bright}Sephent Transcriptor — Gestor Maestro de Versiones, Dist e Instalables${colors.reset}

${colors.cyan}Uso:${colors.reset}
  npx tsx release.ts [opciones]
  npm run release.ts
  npm run release

${colors.cyan}Opciones:${colors.reset}
  --patch              Incrementa la versión PATCH (ej. 1.5.1 -> 1.5.2)
  --minor              Incrementa la versión MINOR (ej. 1.5.1 -> 1.6.0)
  --major              Incrementa la versión MAJOR (ej. 1.5.1 -> 2.0.0)
  --version <v>        Establece una versión específica (ej. 1.6.0)
  --dist-only          Compila únicamente el frontend web en dist/ y dist-web/
  --installers-only    Compila instaladores y portable en instalables/ reportando ubicación
  --build              Compila frontend e instaladores en instalables/ tras el incremento
  --quick              Compila solo el binario standalone sin paquetes NSIS/MSI
  --git, --push        Ejecuta git add, commit y git push
  --skip-tests         Omite las 13 pruebas unitarias forenses
  --test-only          Ejecuta únicamente la batería de pruebas unitarias
  --check              Verifica la salud del entorno (Node, Cargo, Tauri, Git, Python)
  --open               Abre la carpeta instalables/ en el explorador de Windows
  --help, -h           Muestra este mensaje de ayuda

${colors.cyan}Ejemplos:${colors.reset}
  npm run release.ts                      # Abre el menú interactivo guiado
  npx tsx release.ts --dist-only          # Compila y genera los archivos en dist/
  npx tsx release.ts --installers-only    # Compila instaladores en instalables/ y reporta
  npx tsx release.ts --patch --build --git# Pipeline automático completo
`);
    return;
  }

  // Si no se pasaron argumentos, lanzar el menú interactivo guiado
  if (args.length === 0) {
    await iniciarModoInteractivo();
    return;
  }

  const versionActual = obtenerVersionActual();
  const skipTests = args.includes('--skip-tests');
  const quick = args.includes('--quick');
  const distOnly = args.includes('--dist-only');
  const installersOnly = args.includes('--installers-only') || args.includes('--build-only');
  const buildRequested = args.includes('--build');
  const gitRequested = args.includes('--git') || args.includes('--push');
  const testOnly = args.includes('--test-only');
  const checkOnly = args.includes('--check');
  const openFolder = args.includes('--open');

  if (checkOnly) {
    await verificarEntorno();
    return;
  }

  if (testOnly) {
    const ok = await ejecutarPruebas();
    process.exit(ok ? 0 : 1);
  }

  if (distOnly) {
    await compilarFrontend();
    return;
  }

  let nuevaVersion: string | null = null;
  if (args.includes('--patch')) {
    nuevaVersion = calcularSiguienteVersion(versionActual, 'patch');
  } else if (args.includes('--minor')) {
    nuevaVersion = calcularSiguienteVersion(versionActual, 'minor');
  } else if (args.includes('--major')) {
    nuevaVersion = calcularSiguienteVersion(versionActual, 'major');
  } else {
    const vIndex = args.indexOf('--version');
    if (vIndex !== -1 && args[vIndex + 1]) {
      nuevaVersion = args[vIndex + 1];
    }
  }

  if (nuevaVersion) {
    if (!skipTests) {
      const ok = await ejecutarPruebas();
      if (!ok) {
        logError('Pruebas unitarias fallaron. Se cancela el cambio de versión.');
        process.exit(1);
      }
    }
    sincronizarVersionEnArchivos(nuevaVersion);
    logSuccess(`Versión actualizada a: ${nuevaVersion}`);
  }

  const versionFinal = nuevaVersion || versionActual;

  if (installersOnly || buildRequested) {
    if (!skipTests && !nuevaVersion) {
      const ok = await ejecutarPruebas();
      if (!ok) {
        logError('Pruebas unitarias fallaron. Se cancela la compilación.');
        process.exit(1);
      }
    }

    const artefactos = await compilarEjecutables({
      compilarInstaladores: !quick,
      compilarStandalone: true,
    });

    const carpeta = mostrarReporteInstalables(versionFinal, artefactos);
    if (openFolder) {
      abrirCarpetaEnExplorador(carpeta);
    }
  }

  if (gitRequested) {
    await ejecutarGitAdd();
    await ejecutarGitCommit(`release: v${versionFinal}`);
    await ejecutarGitPush();
  }
}

// Invocación del punto de entrada si el archivo se ejecuta como script
if (require.main === module || process.argv[1]?.endsWith('release.ts') || process.argv[1]?.endsWith('deploy.ts')) {
  main().catch((err) => {
    logError(`Fallo crítico en el gestor: ${err.message}`);
    process.exit(1);
  });
}
