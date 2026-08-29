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

// Client for Ember's two local-only backend services: the C# validation
// engine (time-lock enforcement, entry-shape validation) and the Python
// reflective-modules service (emotional decay). Both are 127.0.0.1-only —
// nothing here ever reaches the network beyond this machine.

const VALIDATION_URL = 'http://127.0.0.1:8901';
const REFLECTIVE_URL = 'http://127.0.0.1:8902';
const TIMEOUT_MS = 4000;

async function withTimeout(fn) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function postJSON(base, path, body) {
  return withTimeout(async signal => {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw new Error(`${path} responded ${res.status}`);
    return res.json();
  });
}

async function isHealthy(base) {
  try {
    return await withTimeout(async signal => {
      const res = await fetch(`${base}/health`, { signal });
      return res.ok;
    });
  } catch {
    return false;
  }
}

export async function checkServices() {
  const [validation, reflective] = await Promise.all([
    isHealthy(VALIDATION_URL),
    isHealthy(REFLECTIVE_URL),
  ]);
  return { validation, reflective, ok: validation && reflective };
}

export function validateEntry(entry) {
  const payload = { type: entry.type };
  if (entry.capsule) payload.capsule = { unlockAt: entry.capsule.unlockAt };
  if (entry.decay) payload.decay = { durationDays: entry.decay.durationDays, mode: entry.decay.mode };
  return postJSON(VALIDATION_URL, '/validate/entry', payload);
}

export async function checkCanModify(entry) {
  const { allowed } = await postJSON(VALIDATION_URL, '/validate/can-modify', {
    type: entry.type,
    priorRevisit: !!entry._priorRevisit,
    capsuleUnlockAt: entry.type === 'capsule' ? (entry.capsule?.unlockAt ?? null) : null,
  });
  return allowed;
}

export async function fetchDecayBatch(decayingEntries) {
  const payload = {
    entries: decayingEntries.map(e => ({
      id: e.id,
      createdAt: e.createdAt,
      decay: { durationDays: e.decay.durationDays },
    })),
  };
  const { results } = await postJSON(REFLECTIVE_URL, '/reflect/decay/batch', payload);
  return results;
}

export function renderDecayEntry(entry) {
  return postJSON(REFLECTIVE_URL, '/reflect/decay/render', {
    createdAt: entry.createdAt,
    decay: entry.decay,
    body: entry.body || '',
    rich: !!entry.rich,
  });
}
