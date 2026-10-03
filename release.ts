#!/usr/bin/env node
/**
 * ============================================================================
 * Sephent Transcriptor — Gestor Maestro de Versiones, Dist e Instalables
 * ============================================================================
 * Script canónico en el ROOT del proyecto que permite:
 * 1. Menú interactivo guiado para administración SemVer (PATCH, MINOR, MAJOR, manual).
 * 2. Compilar y sincronizar artefactos en carpetas dist/ y dist-web/.
 * 3. Compilar instaladores nativos para Windows (.exe Setup NSIS, .msi, Portable .exe y .zip).
 * 4. Reportar con máxima claridad las rutas absolutas donde se generaron los instalables.
 * 5. Flujo Git integrado: git add, git commit y git push a la rama remota.
 * 6. Pipeline completo automatizado todo-en-uno.
 *
 * Formas de ejecución:
 *   npx tsx release.ts                  # Modo menú interactivo
 *   npm run release                     # Alias npm del menú interactivo
 *   npx tsx deploy.ts                   # Alias directo
 *   npx tsx release.ts --dist-only      # Solo compilar frontend en dist/ y dist-web/
 *   npx tsx release.ts --installers-only# Solo compilar instaladores y mostrar rutas
 *   npx tsx release.ts --git            # Flujo interactivo de git add, commit y push
 *   npx tsx release.ts --patch --build  # Incrementar patch y compilar instaladores
 *   npx tsx release.ts --help           # Ayuda y documentación
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
const DIST_WEB_DIR = path.join(ROOT_DIR, 'dist-web');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
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
  const line = '═'.repeat(70);
  console.log(`\n${colors.bright}${colors.cyan}${line}${colors.reset}`);
  console.log(`${colors.bright}${colors.white}  ${title}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}${line}${colors.reset}\n`);
}

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

  logInfo(`Sincronizando versión ${colors.bright}${nuevaVersion}${colors.reset} en todos los manifiestos del proyecto...`);

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

  // Git
  try {
    const gitV = (await runCmd('git --version')).trim();
    logSuccess(`Git: ${gitV}`);
  } catch {
    logWarn('Git no detectado en PATH.');
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
// 4. Compilación del Frontend (Vite) y Generación de dist/ y dist-web/
// ============================================================================
export async function compilarFrontend(): Promise<{ distWeb: string; dist: string }> {
  logHeader('COMPILANDO FRONTEND WEB (VITE)');
  logInfo('Ejecutando npx tsc --noEmit (verificación de tipos)...');
  await runCmdLive('npx', ['tsc', '--noEmit']);
  logSuccess('Verificación de tipos TypeScript completada sin errores.');

  logInfo('Ejecutando npx vite build (empaquetado dist-web)...');
  await runCmdLive('npx', ['vite', 'build']);
  logSuccess('Artefactos web compilados exitosamente en dist-web.');

  // Sincronizar también en la carpeta dist/ en el root
  copiarCarpetaRecursivo(DIST_WEB_DIR, DIST_DIR);
  logSuccess('Artefactos sincronizados en ambas carpetas de distribución web.');

  console.log(`\n  ${colors.bright}Ubicación de archivos web generados:${colors.reset}`);
  console.log(`    📁 ${DIST_DIR}`);
  console.log(`    📁 ${DIST_WEB_DIR}\n`);

  return { distWeb: DIST_WEB_DIR, dist: DIST_DIR };
}

// ============================================================================
// 5. Compilación y Generación de Instalables (.EXE / Setup / .MSI / Portable)
// ============================================================================
export interface OpcionesCompilacion {
  compilarInstaladores?: boolean;
  compilarStandalone?: boolean;
}

export async function compilarEjecutables(opciones: OpcionesCompilacion = {}): Promise<string[]> {
  const { compilarInstaladores = true, compilarStandalone = true } = opciones;
  const version = obtenerVersionActual();
  const artefactosGenerados: string[] = [];

  logHeader(`COMPILANDO EJECUTABLES E INSTALABLES PARA WINDOWS (VERSIÓN ${version})`);

  // Paso 1: Compilar frontend y asegurar dist/ y dist-web/
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
    const manifestPath = await generarManifiestoSHA256(releaseVersionDir, artefactosGenerados);
    artefactosGenerados.push(manifestPath);
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
        fs.utimesSync(rutaCompleta, fechaSegura, fechaSegura);
      } catch {}
    }
  }
}

export async function generarManifiestoSHA256(carpetaSalida: string, archivos: string[]): Promise<string> {
  logInfo('Calculando firmas criptográficas SHA-256 para integridad forense...');
  const lineas: string[] = [
    `# ==============================================================================`,
    `# Sephent Transcriptor — Manifiesto de Integridad Criptográfica SHA-256`,
    `# Fecha de generación: ${new Date().toISOString()}`,
    `# ==============================================================================`,
    ``,
  ];

  for (const archivo of archivos) {
    if (archivo.endsWith('SHA256SUMS.txt')) continue;
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

/**
 * Muestra el reporte formateado de dónde se generaron exactamente los instalables
 */
export function mostrarReporteInstalables(version: string, artefactos: string[]): string {
  const releaseVersionDir = path.join(DIST_RELEASE_DIR, `v${version}`);

  logHeader('📦 REPORTE FINAL: UBICACIÓN DE INSTALABLES Y EJECUTABLES');
  console.log(`  ${colors.bright}Versión compilada:${colors.reset} ${colors.green}v${version}${colors.reset}`);
  console.log(`  ${colors.bright}Directorio Principal de Distribución:${colors.reset}`);
  console.log(`  ${colors.bright}${colors.yellow}📁 ${releaseVersionDir}${colors.reset}\n`);

  console.log(`  ${colors.bright}Artefactos generados listos para distribución e instalación:${colors.reset}`);
  console.log(`  ${colors.cyan}${'─'.repeat(68)}${colors.reset}`);

  if (artefactos.length === 0) {
    console.log(`  ${colors.yellow}⚠ No se encontraron artefactos empaquetados en la carpeta destino.${colors.reset}`);
  } else {
    for (const art of artefactos) {
      const nombre = path.basename(art);
      let etiqueta = '📄 Archivo';
      if (nombre.endsWith('-Setup.exe')) etiqueta = '📦 Instalador NSIS Setup (.exe)';
      else if (nombre.endsWith('.msi')) etiqueta = '📦 Instalador Administrativo MSI (.msi)';
      else if (nombre.endsWith('-Portable.exe')) etiqueta = '⚡ Ejecutable Standalone Portable (.exe)';
      else if (nombre.endsWith('-Portable.zip')) etiqueta = '🗜️ Paquete ZIP Portable (.zip)';
      else if (nombre.endsWith('SHA256SUMS.txt')) etiqueta = '🛡️ Manifiesto Criptográfico SHA-256';

      let tamanoStr = '';
      if (fs.existsSync(art)) {
        const stats = fs.statSync(art);
        const mb = (stats.size / (1024 * 1024)).toFixed(2);
        tamanoStr = `(${mb} MB)`;
      }

      console.log(`\n  ${colors.bright}${colors.white}${etiqueta}${colors.reset}`);
      console.log(`    ${colors.green}• Ruta absoluta:${colors.reset} ${art}`);
      if (tamanoStr) {
        console.log(`    ${colors.cyan}• Tamaño:${colors.reset}        ${tamanoStr}`);
      }
    }
  }

  // Verificar carpeta portable
  const portableExe = path.join(DIST_PORTABLE_DIR, 'Sephent Transcriptor.exe');
  if (fs.existsSync(portableExe)) {
    console.log(`\n  ${colors.bright}${colors.white}⚡ Carpeta Portable de Trabajo Inmediato:${colors.reset}`);
    console.log(`    ${colors.green}• Directorio:${colors.reset}    ${DIST_PORTABLE_DIR}`);
    console.log(`    ${colors.green}• Ejecutable:${colors.reset}    ${portableExe}`);
  }

  console.log(`\n  ${colors.cyan}${'─'.repeat(68)}${colors.reset}\n`);
  return releaseVersionDir;
}

// ============================================================================
// 6. Funciones de Control de Versiones Git (Add, Commit, Push)
// ============================================================================
export async function obtenerRamaGitActual(): Promise<string> {
  try {
    const rama = (await runCmd('git rev-parse --abbrev-ref HEAD')).trim();
    return rama || 'principal';
  } catch {
    return 'principal';
  }
}

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

export async function ejecutarGitAdd(): Promise<void> {
  logInfo('Ejecutando git add . ...');
  await runCmdLive('git', ['add', '.']);
  logSuccess('Todos los cambios fueron agregados al área de preparación (git add .).');
}

export async function ejecutarGitCommit(mensaje: string): Promise<void> {
  logInfo(`Ejecutando git commit con mensaje: "${mensaje}"...`);
  await runCmdLive('git', ['commit', '-m', `"${mensaje}"`]);
  logSuccess('Commit creado exitosamente.');
}

export async function ejecutarGitPush(rama?: string): Promise<void> {
  const ramaDestino = rama || (await obtenerRamaGitActual());
  logHeader(`SUBIENDO CAMBIOS AL REPOSITORIO REMOTO (GIT PUSH ORIGIN ${ramaDestino.toUpperCase()})`);
  logInfo(`Ejecutando git push origin ${ramaDestino}...`);
  await runCmdLive('git', ['push', 'origin', ramaDestino]);
  logSuccess(`Cambios enviados exitosamente al repositorio remoto en la rama "${ramaDestino}".`);
}

export async function ejecutarFlujoGitInteractivo(mensajeSugerido?: string): Promise<void> {
  logHeader('CONTROL DE VERSIONES GIT: ADD, COMMIT Y PUSH');

  const { cambiosPendientes, resumen } = await obtenerEstadoGit();
  const rama = await obtenerRamaGitActual();

  console.log(`  ${colors.bright}Rama Git activa:${colors.reset} ${colors.green}${rama}${colors.reset}\n`);

  if (!cambiosPendientes) {
    logInfo('No hay cambios pendientes de preparación en el directorio de trabajo (working tree limpio).');
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
// 7. Pipeline Completo: Bump + Tests + Dist + Instalables + Git + Reporte
// ============================================================================
export async function ejecutarPipelineCompleto(
  tipoBump: 'patch' | 'minor' | 'major' | 'mantener',
  opciones: { omitirPruebas?: boolean; hacerPush?: boolean } = {}
): Promise<void> {
  const versionActual = obtenerVersionActual();
  const siguienteVersion = tipoBump === 'mantener'
    ? versionActual
    : calcularSiguienteVersion(versionActual, tipoBump);

  logHeader(`PIPELINE COMPLETO DE LIBERACIÓN: v${versionActual} → v${siguienteVersion}`);

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

  // 3. Sincronizar Versiones si hubo incremento
  if (tipoBump !== 'mantener') {
    sincronizarVersionEnArchivos(siguienteVersion);
  }

  // 4. Compilar Ejecutables e Instaladores
  const artefactos = await compilarEjecutables({ compilarInstaladores: true, compilarStandalone: true });

  // 5. Reportar ubicación de instalables
  const carpeta = mostrarReporteInstalables(siguienteVersion, artefactos);

  // 6. Git Add, Commit y Push si fue solicitado o interactivamente
  if (opciones.hacerPush) {
    await ejecutarGitAdd();
    await ejecutarGitCommit(`release: v${siguienteVersion}`);
    await ejecutarGitPush();
  }

  logHeader('LIBERACIÓN FINALIZADA CON ÉXITO');
  logSuccess(`Versión v${siguienteVersion} generada, empaquetada y documentada satisfactoriamente.`);
  logInfo(`Carpeta de instalables: ${carpeta}`);
}

// ============================================================================
// 8. Interfaz Interactiva de Línea de Comandos (CLI)
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
    const ramaActual = await obtenerRamaGitActual();

    logHeader('SEPHENT TRANSCRIPTOR — GESTOR DE VERSIONES Y DISTRIBUCIÓN');
    console.log(`  ${colors.bright}Versión actual:${colors.reset} ${colors.green}v${actual}${colors.reset}`);
    console.log(`  ${colors.bright}Rama Git activa:${colors.reset} ${colors.cyan}${ramaActual}${colors.reset}\n`);

    console.log(`  ${colors.cyan}[1]${colors.reset}  Subir versión ${colors.bright}PATCH${colors.reset}  (${actual} → ${colors.yellow}${patchNext}${colors.reset}) y sincronizar archivos`);
    console.log(`  ${colors.cyan}[2]${colors.reset}  Subir versión ${colors.bright}MINOR${colors.reset}  (${actual} → ${colors.yellow}${minorNext}${colors.reset}) y sincronizar archivos`);
    console.log(`  ${colors.cyan}[3]${colors.reset}  Subir versión ${colors.bright}MAJOR${colors.reset}  (${actual} → ${colors.yellow}${majorNext}${colors.reset}) y sincronizar archivos`);
    console.log(`  ${colors.cyan}[4]${colors.reset}  Ingresar versión personalizada manual`);
    console.log(`  ${colors.cyan}[5]${colors.reset}  ${colors.bright}Generar archivos en dist${colors.reset} (dist/ y dist-web/)`);
    console.log(`  ${colors.cyan}[6]${colors.reset}  ${colors.bright}${colors.green}GENERAR INSTALABLES de Windows (.exe Setup / .msi / Portable / Hashes)${colors.reset}`);
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
          logHeader(`GENERANDO INSTALABLES PARA WINDOWS (VERSIÓN ${actual})`);
          const artefactos = await compilarEjecutables({ compilarInstaladores: true, compilarStandalone: true });
          const carpeta = mostrarReporteInstalables(actual, artefactos);

          const abrir = (await preguntar(`¿Deseas abrir la carpeta de los instalables en el Explorador de Windows? (s/n) [s]: `)).trim().toLowerCase();
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

          // 1. Pruebas
          const pruebasOk = await ejecutarPruebas();
          if (!pruebasOk) {
            logError('Pruebas unitarias fallaron. Se cancela el pipeline.');
            break;
          }

          // 2. Sincronizar versión
          if (tipo !== 'mantener') {
            sincronizarVersionEnArchivos(verFinal);
          }

          // 3. Compilar frontend y ejecutables
          const artefactos = await compilarEjecutables({ compilarInstaladores: true, compilarStandalone: true });

          // 4. Reporte detallado de dónde se generaron los instalables
          const carpeta = mostrarReporteInstalables(verFinal, artefactos);

          // 5. Preguntar Git add + push
          const hacerGit = (await preguntar(`\n¿Deseas ejecutar git add, commit y git push para v${verFinal}? (s/n) [s]: `)).trim().toLowerCase();
          if (hacerGit !== 'n' && hacerGit !== 'no') {
            await ejecutarFlujoGitInteractivo(`release: v${verFinal}`);
          }

          // 6. Preguntar abrir carpeta
          const abrir = (await preguntar(`¿Deseas abrir la carpeta de instalables en el Explorador de Windows? (s/n) [s]: `)).trim().toLowerCase();
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
          logInfo('Sesión del gestor finalizada.');
          break;
        }
        default:
          logWarn('Opción no reconocida. Ingresa un número del 0 al 10.');
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
// 9. Manejo de Argumentos CLI (Modo Directo / No Interactivo)
// ============================================================================
export async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
${colors.bright}Sephent Transcriptor — Gestor Maestro de Versiones, Dist e Instalables${colors.reset}

${colors.cyan}Uso:${colors.reset}
  npx tsx release.ts [opciones]
  npm run release

${colors.cyan}Opciones:${colors.reset}
  --patch              Incrementa la versión PATCH (ej. 1.5.1 -> 1.5.2)
  --minor              Incrementa la versión MINOR (ej. 1.5.1 -> 1.6.0)
  --major              Incrementa la versión MAJOR (ej. 1.5.1 -> 2.0.0)
  --version <v>        Establece una versión específica (ej. 1.6.0)
  --dist-only          Compila únicamente el frontend web en dist/ y dist-web/
  --installers-only    Compila instaladores y ejecutables mostrando su ubicación
  --build              Compila frontend e instaladores tras el incremento
  --quick              Compila solo el binario standalone sin paquetes NSIS/MSI
  --git, --push        Ejecuta git add, commit y git push
  --skip-tests         Omite las 13 pruebas unitarias forenses
  --test-only          Ejecuta únicamente la batería de pruebas unitarias
  --check              Verifica la salud del entorno (Node, Cargo, Tauri, Git, Python)
  --open               Abre la carpeta de instalables en el explorador de Windows
  --help, -h           Muestra este mensaje de ayuda

${colors.cyan}Ejemplos:${colors.reset}
  npx tsx release.ts                      # Abre el menú interactivo guiado
  npx tsx release.ts --dist-only          # Compila y genera los archivos en dist/
  npx tsx release.ts --installers-only    # Compila instaladores y reporta su ubicación
  npx tsx release.ts --patch --build --git# Pipeline automático completo
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

// Ejecutar si es el módulo principal
if (require.main === module || process.argv[1]?.endsWith('release.ts') || process.argv[1]?.endsWith('deploy.ts')) {
  main().catch((err) => {
    logError(`Fallo crítico: ${err.message}`);
    process.exit(1);
  });
}
