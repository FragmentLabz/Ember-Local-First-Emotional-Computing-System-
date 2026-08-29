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

// Decay rendering utilities

export function getDecayProgress(entry) {
  const { createdAt, decay } = entry;
  if (!decay) return { progress: 0, fullyDecayed: false };
  const elapsed = Date.now() - createdAt;
  const total   = decay.durationDays * 86400000;
  const progress = Math.min(1, elapsed / total);
  return { progress, fullyDecayed: progress >= 1 };
}

export function renderDecayBody(entry) {
  const { progress, fullyDecayed } = getDecayProgress(entry);
  if (fullyDecayed) {
    return { html: '', tombstone: entry.decay.tombstone || null, fullyDecayed: true };
  }

  const rawBody = entry.body || '';
  if (entry.decay.mode === 'burn') {
    const opacity = 1 - progress * 0.85;
    // Rich entries keep their formatting while fading; plain entries get escaped
    const inner = entry.rich ? rawBody : escHtml(rawBody);
    return {
      html: `<span style="opacity:${opacity.toFixed(3)}">${inner}</span>`,
      tombstone: null,
      fullyDecayed: false,
      progress
    };
  }

  // Word redaction works on plain text, so flatten rich HTML first
  const body = entry.rich ? htmlToText(rawBody) : rawBody;
  if (entry.decay.mode === 'words') {
    const words = body.split(/(\s+)/);
    const nonSpace = words.filter(w => !/^\s+$/.test(w));
    const redactCount = Math.floor(progress * nonSpace.length);
    // Redact from the END
    const toRedact = new Set();
    for (let i = nonSpace.length - redactCount; i < nonSpace.length; i++) toRedact.add(i);
    let nsIdx = 0;
    const html = words.map(w => {
      if (/^\s+$/.test(w)) return w;
      const i = nsIdx++;
      if (toRedact.has(i)) {
        return `<span class="decay-redacted">${'█'.repeat(w.length)}</span>`;
      }
      return escHtml(w);
    }).join('');
    return { html, tombstone: null, fullyDecayed: false, progress };
  }

  return { html: escHtml(body), tombstone: null, fullyDecayed: false };
}

function escHtml(s) {
  return s
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}

function htmlToText(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || '';
}
