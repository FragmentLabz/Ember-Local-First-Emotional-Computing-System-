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

// Talks to Ember's two backend services: the validation engine (time-lock
// enforcement, entry-shape checks) and the reflective-modules service
// (emotional decay).
//
// Running locally -- the desktop app, or `npm run dev` -- both services are
// separate processes on 127.0.0.1, and nothing ever leaves this machine.
//
// On a hosted deployment there is no .NET runtime, so one Python service
// answers both sets of requests behind /api. See vercel.json.

const LOCAL_VALIDATION_URL = 'http://127.0.0.1:8901';
const LOCAL_REFLECTIVE_URL = 'http://127.0.0.1:8902';
const HOSTED_URL = '/api';
const TIMEOUT_MS = 4000;

// True when the page is the desktop app (a file:// page, so no hostname) or is
// being served from this machine.
function isRunningLocally() {
  const host = window.location.hostname;
  return host === '' || host === 'localhost' || host === '127.0.0.1';
}

let VALIDATION_URL;
let REFLECTIVE_URL;

if (isRunningLocally()) {
  VALIDATION_URL = LOCAL_VALIDATION_URL;
  REFLECTIVE_URL = LOCAL_REFLECTIVE_URL;
} else {
  VALIDATION_URL = HOSTED_URL;
  REFLECTIVE_URL = HOSTED_URL;
}

// Sends a POST with a JSON body and gives back the parsed JSON reply.
// If the service does not answer within TIMEOUT_MS the request is cancelled.
async function postJSON(baseUrl, path, body) {
  const controller = new AbortController();
  const timer = setTimeout(function () {
    controller.abort();
  }, TIMEOUT_MS);

  try {
    const response = await fetch(baseUrl + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(path + ' responded ' + response.status);
    }
    return await response.json();
  } finally {
    // Always clear the timer, whether the request worked or failed.
    clearTimeout(timer);
  }
}

// Asks a service if it is running. Returns true or false, never throws.
async function isHealthy(baseUrl) {
  const controller = new AbortController();
  const timer = setTimeout(function () {
    controller.abort();
  }, TIMEOUT_MS);

  try {
    const response = await fetch(baseUrl + '/health', { signal: controller.signal });
    return response.ok;
  } catch (err) {
    // Not running, or took too long to answer.
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkServices() {
  const validation = await isHealthy(VALIDATION_URL);
  const reflective = await isHealthy(REFLECTIVE_URL);
  return {
    validation: validation,
    reflective: reflective,
    ok: validation && reflective
  };
}

export function validateEntry(entry) {
  const payload = { type: entry.type };

  if (entry.capsule) {
    payload.capsule = { unlockAt: entry.capsule.unlockAt };
  }
  if (entry.decay) {
    payload.decay = {
      durationDays: entry.decay.durationDays,
      mode: entry.decay.mode
    };
  }

  return postJSON(VALIDATION_URL, '/validate/entry', payload);
}

export async function checkCanModify(entry) {
  // Capsules also need their unlock date checked; other types do not.
  let capsuleUnlockAt = null;
  if (entry.type === 'capsule' && entry.capsule && entry.capsule.unlockAt !== undefined) {
    capsuleUnlockAt = entry.capsule.unlockAt;
  }

  const reply = await postJSON(VALIDATION_URL, '/validate/can-modify', {
    type: entry.type,
    priorRevisit: entry._priorRevisit ? true : false,
    capsuleUnlockAt: capsuleUnlockAt
  });

  return reply.allowed;
}

export async function fetchDecayBatch(decayingEntries) {
  // Send only the fields the service needs, not the whole entry.
  const list = [];
  for (let i = 0; i < decayingEntries.length; i++) {
    const entry = decayingEntries[i];
    list.push({
      id: entry.id,
      createdAt: entry.createdAt,
      decay: { durationDays: entry.decay.durationDays }
    });
  }

  const reply = await postJSON(REFLECTIVE_URL, '/reflect/decay/batch', { entries: list });
  return reply.results;
}

export function renderDecayEntry(entry) {
  return postJSON(REFLECTIVE_URL, '/reflect/decay/render', {
    createdAt: entry.createdAt,
    decay: entry.decay,
    body: entry.body || '',
    rich: entry.rich ? true : false
  });
}
