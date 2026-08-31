// Starts the reflective-modules service with whichever Python this machine
// has. Linux and macOS usually provide python3; Windows usually provides
// python. Hardcoding either one breaks on the other.

import { spawn, execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function findPython() {
  for (const name of ['python3', 'python']) {
    try {
      execFileSync(name, ['--version'], { stdio: 'ignore' });
      return name;
    } catch {
      // Not this one.
    }
  }
  console.error('Could not find python3 or python on PATH. Install Python 3.11+.');
  process.exit(1);
}

const python = findPython();
const child = spawn(python, [join('services', 'reflective-modules', 'app.py')], {
  cwd: root,
  stdio: 'inherit'
});

child.on('exit', code => process.exit(code ?? 0));
