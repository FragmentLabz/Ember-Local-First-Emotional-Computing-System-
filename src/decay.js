// Copyright (c) 2026 Jeremiah Ayeni <https://github.com/Jeremy-1011>
// This source code is licensed under the MIT license found in the
// LICENSE file in the root directory of this source tree.

// Decay rendering utilities

export function getDecayProgress(entry) {
  const { createdAt, decay } = entry;
  if (!decay) return { progress: 0, fullyDecayed: false };
  const elapsed = Date.now() - createdAt;
  const total   = decay.durationDays * 86400000;
  const progress = Math.min(1, elapsed / total);
  return { progress, fullyDecayed: progress >= 1 };
}

export function applyDecay(body, decay, progress) {
  if (progress <= 0) return body;

  if (decay.mode === 'burn') {
    // Fade opacity handled via CSS; return body as-is
    return body;
  }

  if (decay.mode === 'words') {
    const words = body.split(/(\s+)/);
    const visible = words.filter(w => !/^\s+$/.test(w));
    const redactCount = Math.floor(progress * visible.length);
    let redacted = 0;
    return words.map(w => {
      if (/^\s+$/.test(w)) return w;
      // Redact from the end
      const idx = visible.indexOf(w, visible.length - redactCount - 1 + redacted);
      if (redacted < redactCount) {
        redacted++;
        return '█'.repeat(w.length);
      }
      return w;
    }).join('');
  }

  return body;
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
