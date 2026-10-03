#!/usr/bin/env node
/**
 * ============================================================================
 * Sephent Transcriptor — Gestor Maestro de Versiones y Compilación de EXEs
 * ============================================================================
 * Script canónico en el ROOT del proyecto encargado de:
 * 1. Administración SemVer: incremento atómico de versiones PATCH, MINOR y MAJOR.
 * 2. Sincronización multi-archivo (package.json, Cargo.toml, tauri.conf.json).
 * 3. Ejecución de pruebas unitarias forenses (13 suites automatizadas).
 * 4. Compilación del frontend web optimizado (Vite).
 * 5. Compilación y generación de ejecutables nativos Windows:
 *    - Instalador ejecutable NSIS Setup (.exe)
 *    - Instalador administrativo MSI (.msi)
 *    - Binario ejecutable standalone portable (.exe)
 *    - Paquete de distribución ZIP portable (.zip)
 * 6. Generación de manifiesto criptográfico SHA-256 (SHA256SUMS.txt).
 *
 * Uso:
 *   npx tsx release.ts                  # Modo menú interactivo
 *   npx tsx release.ts --patch --build  # Sube patch y compila todos los EXEs
 *   npx tsx release.ts --minor --build  # Sube minor y compila todos los EXEs
 *   npx tsx release.ts --major --build  # Sube major y compila todos los EXEs
 *   npx tsx release.ts --build-only     # Compila EXEs de la versión actual
 *   npx tsx release.ts --help           # Muestra opciones y comandos
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as readline from 'readline';
import { exec, spawn } from 'child_process';

const ROOT_DIR = process.cwd();
const PKG_PATH = path.join(ROOT_DIR, 'package.json');
const CARGO_PATH = path.join(ROOT_DIR, 'src-tauri', 'Cargo.toml');
const TAURI_CONF_PATH = path.join(ROOT_DIR, 'src-tauri', 'tauri.conf.json');
const DIST_PORTABLE_DIR = path.join(ROOT_DIR, 'dist-portable');
const DIST_RELEASE_DIR = path.join(ROOT_DIR, 'dist-release');

// ============================================================================
// Utilidades de Consola y Formato
// ============================================================================
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

function log(msg: string) {
  console.log(msg);
}

function logInfo(msg: string) {
  console.log(`${colors.cyan}ℹ ${msg}${colors.reset}`);
}

function logSuccess(msg: string) {
  console.log(`${colors.green}✔ ${msg}${colors.reset}`);
}

function logWarn(msg: string) {
  console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`);
}

function logError(msg: string) {
  console.log(`${colors.red}✖ ${msg}${colors.reset}`);
}

function logHeader(title: string) {
  const line = '═'.repeat(68);
  console.log(`\n${colors.bright}${colors.cyan}${line}${colors.reset}`);
  console.log(`${colors.bright}${colors.white}  ${title}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}${line}${colors.reset}\n`);
}

function runCmd(cmd: string, cwd = ROOT_DIR): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, { cwd, windowsHide: true, maxBuffer: 1024 * 1024 * 16 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`Comando falló (${cmd}): ${stderr || err.message}`));
      } else {
        resolve((stdout || '').toString());
      }
    });
  });
}

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

// ============================================================================
// 1. Gestión SemVer y Sincronización de Versiones
// ============================================================================
export interface VersionInfo {
  version: string;
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

export function parseSemVer(v: string): VersionInfo {
  const clean = v.trim().replace(/^v/, '');
  const match = clean.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) {
    throw new Error(`Cadena de versión no válida según SemVer: "${v}". Formato esperado: X.Y.Z`);
  }
  return {
    version: clean,
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4],
  };
}

export function obtenerVersionActual(): string {
  if (!fs.existsSync(PKG_PATH)) {
    throw new Error(`No se encontró package.json en ${PKG_PATH}`);
  }
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
  return pkg.version || '1.0.0';
}

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

export function sincronizarVersionEnArchivos(nuevaVersion: string): void {
  parseSemVer(nuevaVersion); // Valida formato antes de escribir

  logInfo(`Sincronizando versión ${colors.bright}${nuevaVersion}${colors.reset} en todos los archivos del proyecto...`);

  // 1. package.json
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
  pkg.version = nuevaVersion;
  fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  logSuccess(`package.json actualizado a ${nuevaVersion}`);

  // 2. src-tauri/Cargo.toml
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

  // 3. src-tauri/tauri.conf.json
  if (fs.existsSync(TAURI_CONF_PATH)) {
    const tauriConf = JSON.parse(fs.readFileSync(TAURI_CONF_PATH, 'utf8'));
    if (tauriConf.package) {
      tauriConf.package.version = nuevaVersion;
    }
    fs.writeFileSync(TAURI_CONF_PATH, JSON.stringify(tauriConf, null, 2) + '\n', 'utf8');
    logSuccess(`src-tauri/tauri.conf.json actualizado a ${nuevaVersion}`);
  }
}

// ============================================================================
// 2. Comprobaciones de Entorno (Pre-flight Checks)
// ============================================================================
export async function verificarEntorno(): Promise<boolean> {
  logInfo('Verificando herramientas del sistema...');
  let todoListo = true;

  // Node
  try {
    const nodeV = (await runCmd('node -v')).trim();
    logSuccess(`Node.js: ${nodeV}`);
  } catch {
    logError('Node.js no está disponible en PATH.');
    todoListo = false;
  }

  // Rust / Cargo
  try {
    const cargoV = (await runCmd('cargo --version')).trim();
    logSuccess(`Cargo: ${cargoV}`);
  } catch {
    logError('Cargo no está disponible en PATH (necesario para compilar el backend Tauri).');
    todoListo = false;
  }

  // Tauri CLI
  try {
    const tauriV = (await runCmd('npx tauri --version')).trim();
    logSuccess(`Tauri CLI: ${tauriV}`);
  } catch {
    logError('Tauri CLI no está disponible mediante npx.');
    todoListo = false;
  }

  // Python
  try {
    const pyV = (await runCmd('python --version')).trim();
    logSuccess(`Python: ${pyV}`);
  } catch {
    logWarn('Python no detectado directamente con comando "python" (se usará detección dinámica en runtime).');
  }

  return todoListo;
}

// ============================================================================
// 3. Batería de Pruebas Unitarias Automatizadas
// ============================================================================
export const TEST_SUITES = [
  'tests/antiTruncation.test.ts',
  'tests/audioTranscriptionEngine.test.ts',
  'tests/diContainer.test.ts',
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

export async function ejecutarPruebas(): Promise<boolean> {
  logHeader('EJECUTANDO BATERÍA DE PRUEBAS UNITARIAS (13 SUITES)');
  let exitosas = 0;

  for (const testFile of TEST_SUITES) {
    process.stdout.write(`  ⏳ Probando ${testFile}... `);
    try {
      await runCmd(`npx tsx "${testFile}"`);
      process.stdout.write(`${colors.green}✔ PASÓ${colors.reset}\n`);
      exitosas++;
    } catch (err: any) {
      process.stdout.write(`${colors.red}✖ FALLÓ${colors.reset}\n`);
      logError(`Detalle del fallo en ${testFile}:\n${err.message}`);
      return false;
    }
  }

  logSuccess(`Todas las pruebas pasaron satisfactoriamente (${exitosas}/${TEST_SUITES.length}).\n`);
  return true;
}

// ============================================================================
// 4. Compilación del Frontend (Vite)
// ============================================================================
export async function compilarFrontend(): Promise<void> {
  logHeader('COMPILANDO FRONTEND WEB (VITE)');
  logInfo('Ejecutando npx tsc --noEmit (verificación de tipos)...');
  await runCmdLive('npx', ['tsc', '--noEmit']);
  logSuccess('Verificación de tipos TypeScript completada sin errores.');

  logInfo('Ejecutando npx vite build (empaquetado dist-web)...');
  await runCmdLive('npx', ['vite', 'build']);
  logSuccess('Artefactos web compilados exitosamente en dist-web.');
}

// ============================================================================
// 5. Compilación y Generación de Ejecutables (.EXE / Instaladores / Portable)
// ============================================================================
export interface OpcionesCompilacion {
  compilarInstaladores?: boolean;
  compilarStandalone?: boolean;
}

export async function compilarEjecutables(opciones: OpcionesCompilacion = {}): Promise<string[]> {
  const { compilarInstaladores = true, compilarStandalone = true } = opciones;
  const version = obtenerVersionActual();
  const artefactosGenerados: string[] = [];

  logHeader(`COMPILANDO EJECUTABLES PARA WINDOWS (VERSIÓN ${version})`);

  // Paso 1: Asegurar que frontend esté al día
  await compilarFrontend();

  // Paso 2: Si se requieren instaladores (MSI y NSIS), usar tauri build
  if (compilarInstaladores) {
    logInfo('Compilando paquete Tauri (Instalador NSIS .exe e instalador MSI)...');
    await runCmdLive('npx', ['tauri', 'build']);
    logSuccess('Compilación de instaladores Tauri completada.');
  } else if (compilarStandalone) {
    // Si sólo queremos el binario standalone rápido
    logInfo('Compilando binario standalone en modo release con Cargo...');
    await runCmdLive('cargo', ['build', '--release'], path.join(ROOT_DIR, 'src-tauri'));
    logSuccess('Compilación de binario standalone completada.');
  }

  // Paso 3: Identificar y organizar ejecutables
  const targetReleaseDir = path.join(ROOT_DIR, 'src-tauri', 'target', 'release');
  const bundleNsisDir = path.join(targetReleaseDir, 'bundle', 'nsis');
  const bundleMsiDir = path.join(targetReleaseDir, 'bundle', 'msi');

  // Crear carpeta de distribución final: dist-release/v<version>
  const releaseVersionDir = path.join(DIST_RELEASE_DIR, `v${version}`);
  if (!fs.existsSync(releaseVersionDir)) {
    fs.mkdirSync(releaseVersionDir, { recursive: true });
  }

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
    const destStandalone = path.join(releaseVersionDir, `Sephent-Transcriptor-${version}-Portable.exe`);
    fs.copyFileSync(standaloneExePath, destStandalone);
    artefactosGenerados.push(destStandalone);
    logSuccess(`Binario Standalone: ${path.basename(destStandalone)}`);

    // Sincronizar también dist-portable
    if (!fs.existsSync(DIST_PORTABLE_DIR)) {
      fs.mkdirSync(DIST_PORTABLE_DIR, { recursive: true });
    }
    const destInPortable = path.join(DIST_PORTABLE_DIR, 'Sephent Transcriptor.exe');
    fs.copyFileSync(standaloneExePath, destInPortable);

    // Asegurar tools en dist-portable
    const toolsSrc = path.join(ROOT_DIR, 'tools');
    const toolsDst = path.join(DIST_PORTABLE_DIR, 'tools');
    copiarCarpetaRecursivo(toolsSrc, toolsDst);

    // Asegurar WebView2Loader.dll si existe
    const webviewSrc = path.join(ROOT_DIR, 'src-tauri', 'WebView2Loader.dll');
    if (fs.existsSync(webviewSrc)) {
      fs.copyFileSync(webviewSrc, path.join(DIST_PORTABLE_DIR, 'WebView2Loader.dll'));
    }
    logSuccess('Carpeta dist-portable/ sincronizada con éxito.');
  }

  // 3.2 Instalador NSIS (.exe)
  if (fs.existsSync(bundleNsisDir)) {
    const nsisFiles = fs.readdirSync(bundleNsisDir).filter((f) => f.endsWith('.exe'));
    for (const f of nsisFiles) {
      if (f.includes(version)) {
        const src = path.join(bundleNsisDir, f);
        const dst = path.join(releaseVersionDir, `Sephent-Transcriptor-${version}-Setup.exe`);
        fs.copyFileSync(src, dst);
        artefactosGenerados.push(dst);
        logSuccess(`Instalador NSIS Setup (.exe): ${path.basename(dst)}`);
      }
    }
  }

  // 3.3 Instalador MSI (.msi)
  if (fs.existsSync(bundleMsiDir)) {
    const msiFiles = fs.readdirSync(bundleMsiDir).filter((f) => f.endsWith('.msi'));
    for (const f of msiFiles) {
      if (f.includes(version)) {
        const src = path.join(bundleMsiDir, f);
        const dst = path.join(releaseVersionDir, `Sephent-Transcriptor-${version}.msi`);
        fs.copyFileSync(src, dst);
        artefactosGenerados.push(dst);
        logSuccess(`Instalador MSI (.msi): ${path.basename(dst)}`);
      }
    }
  }

  // 3.4 Crear ZIP de la versión portable
  try {
    const zipName = `Sephent-Transcriptor-${version}-Portable.zip`;
    const zipDst = path.join(releaseVersionDir, zipName);
    if (fs.existsSync(zipDst)) fs.unlinkSync(zipDst);

    logInfo(`Empaquetando archivo ZIP portable (${zipName})...`);
    sanitizarTimestamps(DIST_PORTABLE_DIR);
    await runCmd(`powershell -Command "Compress-Archive -Path '${DIST_PORTABLE_DIR}/*' -DestinationPath '${zipDst}' -Force"`);
    if (fs.existsSync(zipDst)) {
      artefactosGenerados.push(zipDst);
      logSuccess(`Paquete ZIP Portable: ${zipName}`);
    }
  } catch (e: any) {
    logWarn(`No se pudo crear el archivo ZIP automático: ${e.message}`);
  }

  // Paso 4: Generar manifiesto de hashes criptográficos SHA-256
  if (artefactosGenerados.length > 0) {
    await generarManifiestoSHA256(releaseVersionDir, artefactosGenerados);
  }

  return artefactosGenerados;
}

export function copiarCarpetaRecursivo(origen: string, destino: string): void {
  if (!fs.existsSync(origen)) return;
  if (!fs.existsSync(destino)) {
    fs.mkdirSync(destino, { recursive: true });
  }

  const entradas = fs.readdirSync(origen, { withFileTypes: true });
  for (const entrada of entradas) {
    const rutaOrigen = path.join(origen, entrada.name);
    const rutaDestino = path.join(destino, entrada.name);

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
        const stats = fs.statSync(rutaCompleta);
        if (stats.mtime.getFullYear() < 1980) {
          fs.utimesSync(rutaCompleta, fechaSegura, fechaSegura);
        }
      } catch {}
    }
  }
}

export async function generarManifiestoSHA256(carpetaSalida: string, archivos: string[]): Promise<void> {
  logInfo('Calculando firmas criptográficas SHA-256 para integridad forense...');
  const lineas: string[] = [
    `# ==============================================================================`,
    `# Sephent Transcriptor — Manifiesto de Integridad Criptográfica SHA-256`,
    `# Fecha de generación: ${new Date().toISOString()}`,
    `# ==============================================================================`,
    ``,
  ];

  for (const archivo of archivos) {
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
}

// ============================================================================
// 6. Pipeline Completo: Bump + Tests + Build + EXEs + Hashes
// ============================================================================
export async function ejecutarPipelineCompleto(
  tipoBump: 'patch' | 'minor' | 'major',
  opciones: { omitirPruebas?: boolean } = {}
): Promise<void> {
  const versionActual = obtenerVersionActual();
  const siguienteVersion = calcularSiguienteVersion(versionActual, tipoBump);

  logHeader(`PIPELINE COMPLETO: ${versionActual} → ${siguienteVersion} (${tipoBump.toUpperCase()})`);

  // 1. Entorno
  const entornoOk = await verificarEntorno();
  if (!entornoOk) {
    throw new Error('El entorno no cuenta con todas las herramientas necesarias.');
  }

  // 2. Pruebas Unitarias
  if (!opciones.omitirPruebas) {
    const pruebasOk = await ejecutarPruebas();
    if (!pruebasOk) {
      throw new Error('La suite de pruebas unitarias falló. Se aborta la liberación para proteger la integridad.');
    }
  } else {
    logWarn('Pruebas unitarias omitidas por bandera explícita.');
  }

  // 3. Sincronizar Versiones
  sincronizarVersionEnArchivos(siguienteVersion);

  // 4. Compilar Ejecutables e Instaladores
  const artefactos = await compilarEjecutables({ compilarInstaladores: true, compilarStandalone: true });

  // 5. Resumen Final
  logHeader('LIBERACIÓN COMPLETADA CON ÉXITO');
  logSuccess(`Versión ${siguienteVersion} generada y empaquetada satisfactoriamente.`);
  logInfo(`Ubicación de artefactos listos para distribución:`);
  log(`  📁 ${path.join(DIST_RELEASE_DIR, `v${siguienteVersion}`)}`);
  for (const art of artefactos) {
    log(`    • ${path.basename(art)}`);
  }
}

// ============================================================================
// 7. Interfaz Interactiva de Línea de Comandos (CLI)
// ============================================================================
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

export async function iniciarModoInteractivo(): Promise<void> {
  let salir = false;

  while (!salir) {
    const actual = obtenerVersionActual();
    const patchNext = calcularSiguienteVersion(actual, 'patch');
    const minorNext = calcularSiguienteVersion(actual, 'minor');
    const majorNext = calcularSiguienteVersion(actual, 'major');

    logHeader('SEPHENT TRANSCRIPTOR — GESTOR DE VERSIONES Y COMPILACIÓN DE EXEs');
    console.log(`  ${colors.bright}Versión actual:${colors.reset} ${colors.green}${actual}${colors.reset}\n`);
    console.log(`  ${colors.cyan}[1]${colors.reset} Subir versión ${colors.bright}PATCH${colors.reset}  (${actual} → ${colors.yellow}${patchNext}${colors.reset}) y sincronizar`);
    console.log(`  ${colors.cyan}[2]${colors.reset} Subir versión ${colors.bright}MINOR${colors.reset}  (${actual} → ${colors.yellow}${minorNext}${colors.reset}) y sincronizar`);
    console.log(`  ${colors.cyan}[3]${colors.reset} Subir versión ${colors.bright}MAJOR${colors.reset}  (${actual} → ${colors.yellow}${majorNext}${colors.reset}) y sincronizar`);
    console.log(`  ${colors.cyan}[4]${colors.reset} Ingresar versión personalizada manual`);
    console.log(`  ${colors.cyan}[5]${colors.reset} Compilar solo Frontend Web (npx vite build)`);
    console.log(`  ${colors.cyan}[6]${colors.reset} Compilar Ejecutables de la versión actual (.EXE / Setup / Portable)`);
    console.log(`  ${colors.cyan}[7]${colors.reset} Ejecutar batería de 13 pruebas unitarias forenses`);
    console.log(`  ${colors.cyan}[8]${colors.reset} ${colors.bright}${colors.green}PIPELINE COMPLETO AUTOMÁTICO${colors.reset} (Bump + Tests + Build + EXEs)`);
    console.log(`  ${colors.cyan}[9]${colors.reset} Comprobar herramientas y salud del entorno`);
    console.log(`  ${colors.cyan}[0]${colors.reset} Salir\n`);

    const opcion = (await preguntar(`${colors.bright}Selecciona una opción [0-9]: ${colors.reset}`)).trim();

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
          await compilarFrontend();
          break;
        }
        case '6': {
          await compilarEjecutables({ compilarInstaladores: true, compilarStandalone: true });
          break;
        }
        case '7': {
          await ejecutarPruebas();
          break;
        }
        case '8': {
          console.log(`\n¿Qué tipo de incremento deseas aplicar?`);
          console.log(`  [1] PATCH (${actual} → ${patchNext})`);
          console.log(`  [2] MINOR (${actual} → ${minorNext})`);
          console.log(`  [3] MAJOR (${actual} → ${majorNext})`);
          console.log(`  [4] MANTENER versión actual (${actual}) y solo compilar`);
          const sub = (await preguntar(`Elige incremento [1-4]: `)).trim();
          if (sub === '1') await ejecutarPipelineCompleto('patch');
          else if (sub === '2') await ejecutarPipelineCompleto('minor');
          else if (sub === '3') await ejecutarPipelineCompleto('major');
          else if (sub === '4') {
            await ejecutarPruebas();
            await compilarEjecutables({ compilarInstaladores: true, compilarStandalone: true });
          } else {
            logWarn('Opción cancelada.');
          }
          break;
        }
        case '9': {
          await verificarEntorno();
          break;
        }
        case '0': {
          salir = true;
          logInfo('Sesión del gestor de liberaciones finalizada.');
          break;
        }
        default:
          logWarn('Opción no reconocida. Ingresa un número del 0 al 9.');
      }
    } catch (err: any) {
      logError(`Error durante la operación: ${err.message}`);
    }

    if (!salir) {
      await preguntar(`\n${colors.dim}Presiona Enter para continuar...${colors.reset}`);
    }
  }
}

// ============================================================================
// 8. Manejo de Argumentos CLI (Modo No Interactivo)
// ============================================================================
export async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
${colors.bright}Sephent Transcriptor — Gestor Maestro de Versiones y Compilación${colors.reset}

${colors.cyan}Uso:${colors.reset}
  npx tsx release.ts [opciones]

${colors.cyan}Opciones:${colors.reset}
  --patch              Incrementa la versión PATCH (ej. 1.5.1 -> 1.5.2)
  --minor              Incrementa la versión MINOR (ej. 1.5.1 -> 1.6.0)
  --major              Incrementa la versión MAJOR (ej. 1.5.1 -> 2.0.0)
  --version <v>        Establece una versión específica (ej. 2.0.0-rc1)
  --build              Compila el frontend y los ejecutables tras el incremento
  --build-only         Compila los ejecutables de la versión actual sin cambiar versión
  --quick              Compila solo el ejecutable standalone sin empaquetar instaladores NSIS/MSI
  --skip-tests         Omite la ejecución de las 13 suites de pruebas unitarias
  --test-only          Ejecuta únicamente la batería de pruebas unitarias
  --check              Verifica la salud del entorno (Node, Cargo, Tauri, Python)
  --help, -h           Muestra este mensaje de ayuda

${colors.cyan}Ejemplos de comando:${colors.reset}
  npx tsx release.ts                    # Abre el menú interactivo guiado
  npx tsx release.ts --patch --build    # Genera una nueva versión patch y compila todos los EXEs
  npx tsx release.ts --minor --build    # Genera una nueva versión minor y compila todos los EXEs
  npx tsx release.ts --build-only       # Compila los EXEs de la versión actual
  npx tsx release.ts --quick            # Compila rápidamente el .exe standalone para pruebas
`);
    return;
  }

  // Si no se pasaron argumentos, lanzar el menú interactivo
  if (args.length === 0) {
    await iniciarModoInteractivo();
    return;
  }

  const versionActual = obtenerVersionActual();
  const skipTests = args.includes('--skip-tests');
  const quick = args.includes('--quick');
  const buildRequested = args.includes('--build');
  const buildOnly = args.includes('--build-only');
  const testOnly = args.includes('--test-only');
  const checkOnly = args.includes('--check');

  if (checkOnly) {
    await verificarEntorno();
    return;
  }

  if (testOnly) {
    const ok = await ejecutarPruebas();
    process.exit(ok ? 0 : 1);
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

  if (buildRequested || buildOnly) {
    if (!skipTests && !nuevaVersion) {
      const ok = await ejecutarPruebas();
      if (!ok) {
        logError('Pruebas unitarias fallaron. Se cancela la compilación de ejecutables.');
        process.exit(1);
      }
    }
    await compilarEjecutables({
      compilarInstaladores: !quick,
      compilarStandalone: true,
    });
    logSuccess('Compilación de ejecutables finalizada con éxito.');
  }
}

// Ejecutar si es el módulo principal
if (require.main === module || process.argv[1]?.endsWith('release.ts') || process.argv[1]?.endsWith('deploy.ts')) {
  main().catch((err) => {
    logError(`Fallo crítico: ${err.message}`);
    process.exit(1);
  });
}
