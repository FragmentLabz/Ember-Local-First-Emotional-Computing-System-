// Builds both local services into standalone executables, so an installed
// Ember does not need .NET or Python on the user's machine.
//
//   node scripts/build-services.mjs
//
// Output goes to build/services/, which electron-builder copies into the
// packaged app's resources/services/.
//
// Needs the .NET SDK and Python with PyInstaller -- but only on the machine
// doing the build, which is the whole point.

import { execFileSync } from 'child_process';
import { mkdirSync, existsSync, rmSync, copyFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'build', 'services');
const isWindows = process.platform === 'win32';
const exe = isWindows ? '.exe' : '';

function run(command, args, cwd) {
  console.log('  $ ' + command + ' ' + args.join(' '));
  execFileSync(command, args, { cwd: cwd || root, stdio: 'inherit' });
}

function buildValidationEngine() {
  console.log('\n[1/2] Validation engine (C#)');

  const publishDir = join(root, 'build', 'tmp-validation');
  rmSync(publishDir, { recursive: true, force: true });

  // Self-contained means the .NET runtime travels with the binary.
  run('dotnet', [
    'publish', 'services/validation-engine',
    '-c', 'Release',
    '--self-contained', 'true',
    '-p:PublishSingleFile=true',
    '-o', publishDir
  ]);

  const built = join(publishDir, 'ValidationEngine' + exe);
  if (!existsSync(built)) {
    throw new Error('dotnet publish did not produce ' + built);
  }
  copyFileSync(built, join(outDir, 'ValidationEngine' + exe));

  // A self-contained build also emits native libraries that must sit beside it.
  for (const file of readdirSync(publishDir)) {
    if (file.endsWith('.so') || file.endsWith('.dylib') || file.endsWith('.dll')) {
      copyFileSync(join(publishDir, file), join(outDir, file));
    }
  }
}

function buildReflectiveModules() {
  console.log('\n[2/2] Reflective modules (Python)');

  const serviceDir = join(root, 'services', 'reflective-modules');
  const workDir = join(root, 'build', 'tmp-reflective');

  run('python3', [
    '-m', 'PyInstaller',
    '--onefile',
    '--name', 'reflective-modules',
    '--distpath', outDir,
    '--workpath', workDir,
    '--specpath', workDir,
    '--noconfirm',
    // Imported by name at runtime, so PyInstaller cannot see them itself.
    '--hidden-import', 'uvicorn.logging',
    '--hidden-import', 'uvicorn.loops.auto',
    '--hidden-import', 'uvicorn.protocols.http.auto',
    '--hidden-import', 'uvicorn.protocols.websockets.auto',
    '--hidden-import', 'uvicorn.lifespan.on',
    'app.py'
  ], serviceDir);

  const built = join(outDir, 'reflective-modules' + exe);
  if (!existsSync(built)) {
    throw new Error('PyInstaller did not produce ' + built);
  }
}

console.log('Building Ember services into ' + outDir);
mkdirSync(outDir, { recursive: true });

const only = process.argv[2];
if (only !== '--python-only') {
  buildValidationEngine();
}
if (only !== '--dotnet-only') {
  buildReflectiveModules();
}

console.log('\nDone. Contents of build/services:');
for (const file of readdirSync(outDir)) {
  console.log('  ' + file);
}
