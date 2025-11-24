import { execFile } from 'node:child_process';
import path from 'node:path';

const banks = [
  'banco-de-chile', 'bancoestado', 'santander', 'bci', 'itau', 'scotiabank',
  'falabella-cmr', 'bice', 'ripley', 'cencosud-scotiabank', 'security', 'edwards',
  'consorcio', 'internacional'
];

function runBank(slug) {
  return new Promise((resolve) => {
    const script = path.join('src', 'index.js');
    const proc = execFile(process.execPath, [script, '--bank', slug, '--maxRequests=80', '--headless', '--navTimeout=90'], {
      cwd: process.cwd(),
    });
    proc.stdout?.pipe(process.stdout);
    proc.stderr?.pipe(process.stderr);
    proc.on('exit', () => resolve());
  });
}

async function runAll() {
  for (const b of banks) {
    console.log(`\n>>> Running ${b}`);
    await runBank(b);
  }
  console.log('\n>>> Consolidating');
  await new Promise((resolve) => {
    const proc = execFile(process.execPath, [path.join('src', 'consolidate.js')], { cwd: process.cwd() });
    proc.stdout?.pipe(process.stdout);
    proc.stderr?.pipe(process.stderr);
    proc.on('exit', () => resolve());
  });
}

runAll();


