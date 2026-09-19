import * as readline from 'readline';
import { exec } from 'child_process';
import * as path from 'path';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  console.log('\n=== Sephent Transcriptor – Deployment Manager ===\n');
  let exit = false;
  while (!exit) {
    console.log('Seleccione una acción:');
    console.log('  1) Verificar dependencias');
    console.log('  2) Compilar (vite build)');
    console.log('  3) Empaquetar con Tauri (tauri build)');
    console.log('  4) Incrementar versión y actualizar package.json');
    console.log('  5) Publicar artefactos en ./dist');
    console.log('  6) Mostrar logs detallados');
    console.log('  0) Salir');
    const choice = await ask('Opción: ');
    switch (choice.trim()) {
      case '1':
        await runCommand('npm install');
        break;
      case '2':
        await runCommand('npm run build');
        break;
      case '3':
        await runCommand('npx tauri build');
        break;
      case '4':
        await bumpVersion();
        break;
      case '5':
        console.log('Los artefactos ya se encuentran en ./dist después de la compilación/empacado.');
        break;
      case '6':
        await showLog();
        break;
      case '0':
        exit = true;
        break;
      default:
        console.log('Opción no válida.');
    }
    console.log('');
  }
  rl.close();
  console.log('Deployment Manager finalizado.');
}

function runCommand(cmd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`Ejecutando: ${cmd}`);
    const proc = exec(cmd, { cwd: process.cwd(), windowsHide: true });
    proc.stdout?.pipe(process.stdout);
    proc.stderr?.pipe(process.stderr);
    proc.on('close', (code) => {
      if (code === 0) {
        console.log('Comando completado con éxito.');
        resolve();
      } else {
        console.error(`Comando falló con código ${code}.`);
        reject(new Error(`Exit code ${code}`));
      }
    });
  });
}

async function bumpVersion() {
  const pkgPath = path.resolve(process.cwd(), 'package.json');
  const pkg = await import(pkgPath);
  const current = pkg.default.version as string;
  const parts = current.split('.').map(Number);
  parts[2] = (parts[2] ?? 0) + 1; // incrementar patch
  const newVersion = parts.join('.');
  console.log(`Versión actual: ${current} → Nueva versión: ${newVersion}`);
  const confirm = await ask('Confirmar actualización de versión? (s/n): ');
  if (confirm.toLowerCase().startsWith('s')) {
    const fs = await import('fs');
    const data = { ...pkg.default, version: newVersion };
    fs.writeFileSync(pkgPath, JSON.stringify(data, null, 2));
    console.log('package.json actualizado.');
  } else {
    console.log('Actualización de versión abortada.');
  }
}

async function showLog() {
  const logPath = path.resolve(process.cwd(), 'docs', 'general-log.md');
  try {
    const fs = await import('fs');
    const content = fs.readFileSync(logPath, 'utf-8');
    console.log('\n--- general-log.md ---');
    console.log(content);
    console.log('--- fin del log ---\n');
  } catch (e) {
    console.error('No se encontró docs/general-log.md.');
  }
}

main().catch((err) => {
  console.error('Error inesperado:', err);
  rl.close();
});
