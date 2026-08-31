// ember - a local-first encrypted journaling app.
// Copyright (C) 2026 Jeremiah Ayeni <https://github.com/Jeremy-1011>
//
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// This program is free software: you can redistribute it and/or modify it
// under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or (at your
// option) any later version.
//
// This program is distributed in the hope that it will be useful, but
// WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero
// General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

// Starts and stops Ember's two local services.
//
// In a packaged app they are bundled executables next to the app's resources,
// so nothing needs to be installed. When running from a checkout those
// binaries do not exist, so the source is run directly instead -- which needs
// .NET and Python, as the README says.

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const HOST = '127.0.0.1';
const STARTUP_TIMEOUT_MS = 30000;
const POLL_INTERVAL_MS = 250;

const SERVICES = [
  {
    name: 'validation-engine',
    port: 8901,
    binary: 'ValidationEngine',
    devCommand: 'dotnet',
    devArgs: ['run', '--project', 'services/validation-engine']
  },
  {
    name: 'reflective-modules',
    port: 8902,
    binary: 'reflective-modules',
    devCommand: 'python3',
    devArgs: [path.join('services', 'reflective-modules', 'app.py')]
  }
];

// Processes we started, so they can be stopped again on quit.
const running = [];

// Where the bundled executables live inside a packaged app.
function bundledPath(service) {
  let name = service.binary;
  if (process.platform === 'win32') {
    name = name + '.exe';
  }
  return path.join(process.resourcesPath || '', 'services', name);
}

// Asks a service's /health endpoint whether it is up yet.
function checkHealth(port) {
  return new Promise(function (resolve) {
    const req = http.get(
      { host: HOST, port: port, path: '/health', timeout: 1500 },
      function (res) {
        res.resume();
        resolve(res.statusCode === 200);
      }
    );
    req.on('error', function () {
      resolve(false);
    });
    req.on('timeout', function () {
      req.destroy();
      resolve(false);
    });
  });
}

function wait(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

// Polls until the service answers, or gives up after STARTUP_TIMEOUT_MS.
async function waitForHealth(service) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const ok = await checkHealth(service.port);
    if (ok) {
      return true;
    }
    await wait(POLL_INTERVAL_MS);
  }

  return false;
}

// Starts one service, unless something is already answering on its port --
// which happens when a developer is running `npm run services` alongside.
async function startService(service, projectRoot) {
  const alreadyUp = await checkHealth(service.port);
  if (alreadyUp) {
    return { started: false, reason: 'already running' };
  }

  const bundled = bundledPath(service);
  let child;

  if (fs.existsSync(bundled)) {
    child = spawn(bundled, [], { cwd: path.dirname(bundled), stdio: 'ignore' });
  } else {
    // Running from a checkout. Needs the toolchains installed.
    child = spawn(service.devCommand, service.devArgs, {
      cwd: projectRoot,
      stdio: 'ignore',
      shell: process.platform === 'win32'
    });
  }

  child.on('error', function (err) {
    console.error('[' + service.name + '] failed to start:', err.message);
  });

  running.push(child);
  return { started: true, child: child };
}

// Starts both services and waits for them to answer. Returns the names of any
// that never came up, so the caller can say which one is missing.
async function startAll(projectRoot) {
  const failed = [];

  for (let i = 0; i < SERVICES.length; i++) {
    const service = SERVICES[i];
    await startService(service, projectRoot);
  }

  for (let i = 0; i < SERVICES.length; i++) {
    const service = SERVICES[i];
    const healthy = await waitForHealth(service);
    if (!healthy) {
      failed.push(service.name);
    }
  }

  return failed;
}

// Stops everything we started. Called when the app quits, so services do not
// outlive the window that needed them.
function stopAll() {
  for (let i = 0; i < running.length; i++) {
    const child = running[i];
    if (child && !child.killed) {
      child.kill();
    }
  }
  running.length = 0;
}

module.exports = { startAll: startAll, stopAll: stopAll, SERVICES: SERVICES };
