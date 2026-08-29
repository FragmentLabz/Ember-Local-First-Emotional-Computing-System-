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

import { saveEntry, loadEntries, deleteEntry, generateId } from './storage.js';
import { encrypt, decrypt, encryptBytes, decryptBytes } from './crypto.js';
import { checkServices, validateEntry, checkCanModify, fetchDecayBatch, renderDecayEntry } from './services.js';
import { startAuth, exchangeCode, getNowPlaying, getAudioFeatures, isConnected, disconnect } from './spotify.js';
import { version as pkgVersion } from '../package.json';

// ─── App metadata ─────────────────────────────────────────────────────────────
const APP_VERSION = pkgVersion;
const APP_AUTHOR  = 'Jeremiah Ayeni';
const APP_GITHUB  = 'https://github.com/Jeremy-1011';
const APP_SOURCE  = 'https://github.com/Jeremy-1011/Journal-App-Ember';

// ─── State ────────────────────────────────────────────────────────────────────
let entries = [];
let currentEntry = null;
let currentView  = 'list';
let currentType  = 'regular';
let nowPlaying   = null;
let spotifyPollTimer = null;
let decayStatus  = {}; // entry id -> { progress, fullyDecayed }, from the reflective-modules service
let writeMode    = 'new';
let editingId    = null;
let pendingAttachments = []; // { id, name, type, size, blob } while writing

// Slash command menu state
let slashActive   = false;
let slashIndex    = 0;
let slashMatchLen = 0;
let slashFiltered = [];

let dpYear, dpMonth, dpSelected;

// ─── Heat ─────────────────────────────────────────────────────────────────────
function heatOf(createdAt) {
  const age = Date.now() - createdAt;
  const d = 86400000;
  if (age < d)      return 1.0;
  if (age < 7*d)    return 0.75;
  if (age < 30*d)   return 0.45;
  if (age < 90*d)   return 0.2;
  return 0.08;
}
function heatColor(h) {
  const r = Math.round(74  + 166*h);
  const g = Math.round(48  +  34*h);
  const b = Math.round(32  -   8*h);
  return `rgb(${r},${g},${b})`;
}

const $  = id => document.getElementById(id);
const $q = s  => document.querySelector(s);

// ─── Ember Particle Canvas ─────────────────────────────────────────────────────
function initEmberCanvas() {
  const canvas = document.getElementById('embers');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const COLORS = ['#f05218', '#ff8c42', '#ffb347', '#e88020', '#ff6b35'];

  function mkParticle() {
    return {
      x:       Math.random() * window.innerWidth,
      y:       window.innerHeight + Math.random() * 60,
      size:    1 + Math.random() * 3,
      speedY:  0.4 + Math.random() * 0.7,
      driftX:  (Math.random() - 0.5) * 0.5,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.04,
      color:   COLORS[Math.floor(Math.random() * COLORS.length)],
      life:    0,
      maxLife: 180 + Math.random() * 120,
    };
  }

  const COUNT = 35;
  const particles = Array.from({ length: COUNT }, mkParticle);
  particles.forEach(p => {
    p.y    = Math.random() * window.innerHeight;
    p.life = Math.random() * p.maxLife;
  });

  function drawParticle(p) {
    const progress = p.life / p.maxLife;
    let alpha;
    if (progress < 0.2)       alpha = progress / 0.2;
    else if (progress > 0.7)  alpha = (1 - progress) / 0.3;
    else                      alpha = 1;
    alpha *= 0.55;

    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2.5);
    grad.addColorStop(0, p.color);
    grad.addColorStop(1, 'transparent');

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  }

  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) {
      p.life++;
      p.y -= p.speedY;
      p.x += p.driftX;
      p.rotation += p.rotSpeed;
      if (p.life >= p.maxLife) Object.assign(p, mkParticle());
      drawParticle(p);
    }
    requestAnimationFrame(tick);
  }
  tick();
}

// ─── Render ───────────────────────────────────────────────────────────────────
function render() {
  document.getElementById('app').innerHTML = `
    <canvas id="embers"></canvas>

    <div id="header">
      <div id="logo" role="button" aria-label="Back to journal">
        <span class="spark">&#10022;</span> ember
      </div>
      <div id="header-right">
        <button id="about-btn" title="About ember" aria-label="About ember">i</button>
        <button id="spotify-btn" class="${isConnected() ? 'connected' : ''}">&#9835;</button>
        <button id="new-btn" title="New entry">+</button>
      </div>
    </div>

    <div id="list-view" class="view ${currentView === 'list' ? 'active' : ''}">
      ${renderList()}
    </div>

    <div id="write-view" class="view ${currentView === 'write' ? 'active' : ''}">
      ${renderWrite()}
    </div>

    <div id="read-view" class="view ${currentView === 'read' ? 'active' : ''}">
      ${renderRead()}
    </div>

    <div class="modal-overlay" id="spotify-modal">
      <div class="modal">
        <h2>${isConnected() ? 'Spotify connected' : 'Connect Spotify'}</h2>
        <p>${isConnected()
          ? 'Your Spotify account is linked. Now-playing is tracked while you write.'
          : 'Link your Spotify account to save the track playing while you write each entry.'}</p>
        <div class="modal-actions">
          ${isConnected()
            ? `<button class="btn-ghost" id="spotify-disconnect">Disconnect</button>
               <button class="btn-ghost" id="spotify-modal-close">Close</button>`
            : `<button class="btn-ghost" id="spotify-modal-close">Cancel</button>
               <button class="btn-green" id="spotify-connect-btn">Connect</button>`
          }
        </div>
      </div>
    </div>

    <div class="modal-overlay" id="about-modal">
      <div class="modal about-modal">
        <div class="about-spark">&#10022;</div>
        <h2>ember</h2>
        <p class="about-tagline">A local-first encrypted journaling app.</p>
        <dl class="about-meta">
          <dt>Version</dt><dd>${APP_VERSION}</dd>
          <dt>Created by</dt><dd><strong>${APP_AUTHOR}</strong></dd>
          <dt>Source</dt><dd><a href="${APP_SOURCE}" target="_blank" rel="noopener noreferrer">Get the source code</a></dd>
          <dt>Built with</dt><dd>Electron &middot; Vite &middot; Web Crypto</dd>
        </dl>
        <p class="about-license">Copyright &copy; 2026 <a href="${APP_GITHUB}" target="_blank" rel="noopener noreferrer">${APP_AUTHOR}</a>.<br>
          Licensed under the <strong>GNU Affero General Public License v3</strong> or later.
          This program comes with absolutely no warranty. You are free to redistribute
          it and modify it under those terms &mdash; including over a network, in which
          case you must offer your users the corresponding source.</p>
        <div class="modal-actions">
          <button class="btn-ghost" id="about-modal-close">Close</button>
        </div>
      </div>
    </div>

    <div class="datepicker-overlay" id="dp-overlay">
      <div class="datepicker-popup" id="dp-popup">
        ${renderDatePicker()}
      </div>
    </div>

    <div class="slash-menu" id="slash-menu"></div>
  `;

  bindEvents();
  initEmberCanvas();

  const listView = document.getElementById('list-view');
  const header   = document.getElementById('header');
  if (listView && header) {
    listView.addEventListener('scroll', () => {
      header.classList.toggle('scrolled', listView.scrollTop > 50);
    });
  }
}

// ─── List ─────────────────────────────────────────────────────────────────────
function renderList() {
  if (!entries.length) {
    return `<div class="empty-state">
      <div class="big-spark">&#10022;</div>
      <p>Your journal is empty.</p>
      <small>Press + to write your first entry.</small>
    </div>`;
  }

  const rows = entries.map((e, i) => {
    const h  = heatOf(e.createdAt);
    const hc = heatColor(h);
    const side = i % 2 === 0 ? 'left' : 'right';

    const typeLabel = e.type === 'capsule' ? '<span class="node-badge cap">capsule</span>'
                    : e.type === 'decay'   ? '<span class="node-badge dec">decaying</span>'
                    : '';

    let preview = '';
    if (e.type === 'capsule') {
      const canOpen = Date.now() >= e.capsule.unlockAt;
      preview = canOpen ? 'Ready to open' : `Sealed until ${formatDate(e.capsule.unlockAt)}`;
    } else if (e.type === 'decay') {
      const fullyDecayed = decayStatus[e.id]?.fullyDecayed ?? false;
      preview = fullyDecayed ? '[fully decayed]'
              : (e.rich ? stripTags(e.body || '') : (e.body || '')).slice(0, 140);
    } else {
      preview = (e.rich ? stripTags(e.body || '') : (e.body || '')).slice(0, 140);
    }

    const spotifyBar = e.spotify
      ? `<div class="node-spotify">&#9835; ${escHtml(e.spotify.trackName || '')}</div>` : '';

    const isCapsule = e.type === 'capsule';
    const isDecay   = e.type === 'decay';
    const orbClass  = isCapsule ? 'node-orb orb-capsule'
                    : isDecay   ? 'node-orb orb-decay'
                    : 'node-orb';

    const card = `
      <article class="entry-node" style="--heat-color:${hc}">
        <div class="node-header">
          <div class="node-title">${escHtml(e.title || 'Untitled')}</div>
          ${typeLabel}
        </div>
        <p class="node-preview">${escHtml(preview)}</p>
        <div class="node-foot">
          <span class="node-date">${formatDate(e.createdAt)}</span>
          ${e.attachments?.length ? `<span class="node-attach">&#128206; ${e.attachments.length}</span>` : ''}
          ${spotifyBar}
        </div>
      </article>`;

    const orb  = `<div class="${orbClass}" style="--heat-color:${hc}"></div>`;
    const conn = `<div class="node-connector" style="--heat-color:${hc}"></div>`;

    const inner = side === 'left'
      ? `${card}${conn}${orb}`
      : `${orb}${conn}${card}`;

    return `<div class="timeline-row ${side}" data-id="${e.id}" style="animation-delay:${i * 0.06}s">${inner}</div>`;
  }).join('');

  return `<div class="timeline">
    <div class="timeline-spine"></div>
    ${rows}
  </div>`;
}

// Batches every decaying entry's progress/fullyDecayed status through the
// reflective-modules service in one call. Call after any change to `entries`.
async function refreshDecayStatus() {
  const decaying = entries.filter(e => e.type === 'decay');
  if (!decaying.length) { decayStatus = {}; return; }
  try {
    decayStatus = await fetchDecayBatch(decaying);
  } catch {
    // Reflective service unreachable mid-session — boot() already gates
    // startup on checkServices(), so keep showing the last known status.
  }
}

// ─── Write ────────────────────────────────────────────────────────────────────
function renderWrite() {
  const entry = currentEntry || {};
  return `
    <div class="write-inner">
      <input id="write-title" type="text" placeholder="title&#8230;" value="${escAttr(entry.title || '')}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
      <div id="write-body" class="write-editor" contenteditable="true" data-placeholder="write anything, or press / for blocks" spellcheck="false"></div>
      <span class="honesty-hint">honesty constraint &#8212; paste is disabled, this has to be in your own words</span>
      <div id="write-errors" class="write-errors"></div>
      <div class="type-options">
        ${currentType === 'capsule' ? renderCapsuleOptions(entry) : ''}
        ${currentType === 'decay'   ? renderDecayOptions(entry)   : ''}
      </div>
      <div class="attach-zone">
        <input type="file" id="attach-input" multiple hidden>
        <button type="button" id="attach-btn" class="attach-btn">&#128206; attach files</button>
        ${currentType === 'capsule' ? '<span class="attach-hint">files will be sealed &amp; encrypted too</span>' : ''}
        <div class="attach-list" id="attach-list">${renderAttachList()}</div>
      </div>
    </div>
    <div class="write-footer">
      <div class="type-tabs">
        <button class="type-tab ${currentType === 'regular' ? 'active' : ''}" data-type="regular">regular</button>
        <button class="type-tab ${currentType === 'capsule' ? 'active' : ''}" data-type="capsule">time capsule</button>
        <button class="type-tab ${currentType === 'decay'   ? 'active' : ''}" data-type="decay">decaying</button>
      </div>
      <div class="write-actions">
        <div id="now-playing-bar" class="${nowPlaying ? 'visible' : ''}">
          ${nowPlaying ? `&#9835; ${escHtml(nowPlaying.trackName || '')}` : ''}
        </div>
        <button id="cancel-btn">cancel</button>
        <button id="seal-btn"><span>${writeMode === 'edit' ? 'save changes' : 'seal it'}</span></button>
      </div>
    </div>`;
}

function renderCapsuleOptions(entry) {
  const unlockVal = entry.capsule ? formatDateInput(entry.capsule.unlockAt) : '';
  return `<div class="capsule-options">
    <div>
      <label>Unlock date</label>
      <input type="text" id="capsule-date" placeholder="click to pick a date" readonly value="${escAttr(unlockVal)}" style="cursor:pointer">
    </div>
    <div>
      <label>Passphrase (optional override)</label>
      <input type="text" id="capsule-pass" placeholder="leave blank to use date as key">
    </div>
  </div>`;
}

function renderDecayOptions(entry) {
  const days = entry.decay?.durationDays || 30;
  const mode = entry.decay?.mode || 'words';
  const tomb = entry.decay?.tombstone || '';
  return `<div class="decay-options">
    <div>
      <label>Duration (days)</label>
      <input type="number" id="decay-days" value="${days}" min="1" max="3650">
    </div>
    <div>
      <label>Decay mode</label>
      <select id="decay-mode">
        <option value="words" ${mode === 'words' ? 'selected' : ''}>words &#8212; redact from end</option>
        <option value="burn"  ${mode === 'burn'  ? 'selected' : ''}>burn &#8212; fade opacity</option>
      </select>
    </div>
    <div>
      <label>Tombstone (shown when fully decayed)</label>
      <input type="text" id="decay-tombstone" placeholder="optional final message&#8230;" value="${escAttr(tomb)}">
    </div>
  </div>`;
}

// ─── Attachments (write view) ───────────────────────────────────────────────
function renderAttachList() {
  return pendingAttachments.map(a => `
    <div class="attach-chip" data-id="${a.id}">
      ${a.type.startsWith('image/')
        ? `<img class="chip-thumb" src="${URL.createObjectURL(a.blob)}" alt="">`
        : `<span class="chip-icon">${fileLabel(a)}</span>`}
      <span class="chip-name">${escHtml(a.name)}</span>
      <span class="chip-size">${humanSize(a.size)}</span>
      <button type="button" class="chip-remove" data-id="${a.id}" title="Remove">&times;</button>
    </div>`).join('');
}

function addFiles(fileList) {
  for (const f of fileList) {
    pendingAttachments.push({
      id:   generateId(),
      name: f.name,
      type: f.type || 'application/octet-stream',
      size: f.size,
      blob: f,
    });
  }
  refreshAttachList();
}

function refreshAttachList() {
  const list = document.getElementById('attach-list');
  if (!list) return;
  list.innerHTML = renderAttachList();
  bindAttachRemove();
}

function bindAttachRemove() {
  document.querySelectorAll('.chip-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      pendingAttachments = pendingAttachments.filter(a => a.id !== btn.dataset.id);
      refreshAttachList();
    });
  });
}

function fileLabel(a) {
  if (a.type === 'application/pdf') return 'PDF';
  const ext = (a.name.split('.').pop() || 'FILE').slice(0, 4).toUpperCase();
  return ext;
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// ─── Attachments (read view) ─────────────────────────────────────────────────
function attachmentItemHTML(a, url) {
  if (a.type.startsWith('image/')) {
    return `<a class="att att-img" href="${url}" target="_blank" rel="noopener">
      <img src="${url}" alt="${escAttr(a.name)}">
    </a>`;
  }
  const isPdf = a.type === 'application/pdf';
  return `<a class="att att-file ${isPdf ? 'is-pdf' : ''}" href="${url}" ${isPdf ? 'target="_blank" rel="noopener"' : `download="${escAttr(a.name)}"`}>
    <span class="att-icon">${fileLabel(a)}</span>
    <span class="att-info">
      <span class="att-name">${escHtml(a.name)}</span>
      <span class="att-size">${humanSize(a.size)}${isPdf ? ' &middot; open' : ' &middot; download'}</span>
    </span>
  </a>`;
}

function renderAttachmentsHTML(list) {
  if (!list || !list.length) return '';
  const items = list.map(a => attachmentItemHTML(a, URL.createObjectURL(a.blob))).join('');
  return `<div class="read-attachments">
    <div class="attach-grid">${items}</div>
  </div>`;
}

// ─── Read ─────────────────────────────────────────────────────────────────────
// Time-Lock Revisitation: the first time an entry is reopened after writing it
// only records that it happened — edit/delete stay locked. They unlock on a
// later, separate visit, so you can't write something and immediately erase it.
function markRevisited(entry) {
  if (!entry || entry.revisitedAt) return;
  entry.revisitedAt = Date.now();
  saveEntry(entry).catch(() => {});
}

// Time-lock enforcement now lives in the C# validation engine (checkCanModify,
// src/services.js) — actions render disabled/pending here and get patched
// once that check resolves (refreshReadActions, below).
function renderReadActions(e) {
  const editBtn = e.type !== 'capsule'
    ? `<button class="read-action" id="read-edit-btn" disabled title="Checking…">&#9998; edit</button>`
    : '';
  return `<div class="read-actions">
    ${editBtn}
    <button class="read-action read-action-danger" id="read-delete-btn" disabled title="Checking…">&#128465; delete</button>
  </div>`;
}

async function refreshReadActions(e) {
  const lockTitle = e._priorRevisit
    ? 'Sealed entries can only be deleted after they unlock.'
    : 'This is the first time you’ve opened this entry since writing it — come back and revisit it again before you can edit or delete it.';
  let unlocked = false;
  let title = lockTitle;
  try {
    unlocked = await checkCanModify(e);
  } catch {
    title = 'Could not reach the validation engine — staying locked.';
  }
  const editBtn = document.getElementById('read-edit-btn');
  if (editBtn) {
    editBtn.disabled = !unlocked;
    editBtn.title = unlocked ? 'Edit this entry' : title;
  }
  const deleteBtn = document.getElementById('read-delete-btn');
  if (deleteBtn) {
    deleteBtn.disabled = !unlocked;
    deleteBtn.title = unlocked ? 'Delete this entry' : title;
  }
}

function bindReadActions() {
  document.getElementById('read-back')?.addEventListener('click', () => showView('list'));

  document.getElementById('read-edit-btn')?.addEventListener('click', () => {
    const e = currentEntry;
    if (!e) return;
    editingId    = e.id;
    currentEntry = e;
    currentType  = e.type;
    writeMode    = 'edit';
    // Existing (non-encrypted) attachments become pending files so the editor
    // shows them and re-saves them unless the user removes or replaces them.
    pendingAttachments = (e.attachments || []).map(a => ({
      id: a.id, name: a.name, type: a.type, size: a.size, blob: a.blob,
    }));
    render();
    showView('write');
  });

  document.getElementById('read-delete-btn')?.addEventListener('click', async () => {
    const e = currentEntry;
    if (!e) return;
    if (!confirm(`Delete "${e.title || 'Untitled'}"? This cannot be undone.`)) return;
    await deleteEntry(e.id);
    entries = await loadEntries();
    await refreshDecayStatus();
    currentEntry = null;
    showView('list');
    render();
  });
}

function renderRead() {
  if (!currentEntry) return '';
  const e = currentEntry;
  const dateStr = formatDate(e.createdAt);

  let bodyHtml = '';
  let tombHtml = '';

  if (e.type === 'capsule') {
    const canOpen = Date.now() >= e.capsule?.unlockAt;
    if (!canOpen) {
      bodyHtml = `<div class="capsule-locked">
        <div class="capsule-icon">&#128274;</div>
        <h3>Time-sealed</h3>
        <p>This entry unlocks on ${formatDate(e.capsule.unlockAt)}.</p>
      </div>`;
    } else {
      bodyHtml = `<div class="read-body" id="capsule-body-placeholder">
        <em style="color:var(--text-faint)">Decrypting&#8230;</em>
      </div>`;
    }
  } else if (e.type === 'decay') {
    // Rendered by the Python reflective-modules service — see showDecayedBody().
    bodyHtml = `<div class="read-body" id="decay-body-placeholder"><em style="color:var(--text-faint)">Reflecting&#8230;</em></div>`;
  } else {
    bodyHtml = e.rich
      ? `<div class="read-body rich">${sanitizeHtml(e.body || '')}</div>`
      : `<div class="read-body">${escHtml(e.body || '').replace(/\n/g,'<br>')}</div>`;
  }

  const spotifyHtml = e.spotify ? `
    <div class="read-spotify">
      ${e.spotify.albumArt ? `<img src="${escAttr(e.spotify.albumArt)}" alt="album art">` : ''}
      <div class="read-spotify-info">
        <div class="read-spotify-track">${escHtml(e.spotify.trackName || '')}</div>
        <div class="read-spotify-artist">${escHtml(e.spotify.artistName || '')}</div>
      </div>
      <div class="read-spotify-note">playing when written</div>
    </div>` : '';

  // Attachments: plain entries render now; capsules fill in after unlock/decrypt
  let attachHtml = '';
  if (e.type === 'capsule') {
    const canOpen = Date.now() >= e.capsule?.unlockAt;
    attachHtml = canOpen ? '<div id="read-attachments-slot"></div>' : '';
  } else {
    attachHtml = renderAttachmentsHTML(e.attachments);
  }

  return `<div class="read-inner">
    <button class="read-back" id="read-back">&#8592; back</button>
    <div class="read-header">
      <h1 class="read-title">${escHtml(e.title || 'Untitled')}</h1>
      <div class="read-meta">
        <span>${dateStr}</span>
        ${e.type !== 'regular' ? `<span class="read-type-badge">${e.type}</span>` : ''}
      </div>
      ${renderReadActions(e)}
    </div>
    ${bodyHtml}
    ${tombHtml}
    ${attachHtml}
    ${spotifyHtml}
  </div>`;
}

// ─── Date picker ──────────────────────────────────────────────────────────────
function initDP() {
  const now = new Date();
  dpYear  = now.getFullYear();
  dpMonth = now.getMonth();
  dpSelected = null;
}

function renderDatePicker() {
  const DAYS   = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const today    = new Date();
  const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  const first    = new Date(dpYear, dpMonth, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(dpYear, dpMonth+1, 0).getDate();

  const dayNames = DAYS.map(d => `<div class="dp-day-name">${d}</div>`).join('');
  let cells = '';
  for (let i = 0; i < startDow; i++) cells += `<div class="dp-day empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const date   = new Date(dpYear, dpMonth, d);
    const isPast = date < new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const isToday = `${dpYear}-${dpMonth}-${d}` === todayStr;
    const selStr  = dpSelected ? `${dpSelected.getFullYear()}-${dpSelected.getMonth()}-${dpSelected.getDate()}` : '';
    const isSelected = selStr === `${dpYear}-${dpMonth}-${d}`;
    const cls = ['dp-day', isPast?'past':'', isToday?'today':'', isSelected?'selected':''].filter(Boolean).join(' ');
    cells += `<div class="${cls}" data-year="${dpYear}" data-month="${dpMonth}" data-day="${d}">${d}</div>`;
  }

  return `<div class="dp-header">
    <button class="dp-nav" id="dp-prev">&#8249;</button>
    <span class="dp-month-label">${MONTHS[dpMonth]} ${dpYear}</span>
    <button class="dp-nav" id="dp-next">&#8250;</button>
  </div>
  <div class="dp-grid">${dayNames}${cells}</div>`;
}

function positionDP(inputEl) {
  const popup = document.getElementById('dp-popup');
  const rect  = inputEl.getBoundingClientRect();
  popup.style.top  = `${rect.bottom + 6}px`;
  popup.style.left = `${rect.left}px`;
}

// ─── Event binding ────────────────────────────────────────────────────────────
function bindEvents() {
  document.getElementById('logo').addEventListener('click', () => showView('list'));

  document.getElementById('new-btn').addEventListener('click', () => {
    currentEntry = null;
    currentType  = 'regular';
    writeMode    = 'new';
    editingId    = null;
    pendingAttachments = [];
    showView('write');
    startSpotifyPoll();
  });

  document.getElementById('spotify-btn').addEventListener('click', () => {
    document.getElementById('spotify-modal').classList.add('open');
  });

  const modalClose = document.getElementById('spotify-modal-close');
  if (modalClose) modalClose.addEventListener('click', () => {
    document.getElementById('spotify-modal').classList.remove('open');
  });

  const spotifyConnect = document.getElementById('spotify-connect-btn');
  if (spotifyConnect) spotifyConnect.addEventListener('click', handleSpotifyConnect);

  const spotifyDisconnect = document.getElementById('spotify-disconnect');
  if (spotifyDisconnect) spotifyDisconnect.addEventListener('click', () => {
    disconnect();
    document.getElementById('spotify-modal').classList.remove('open');
    render();
  });

  document.getElementById('spotify-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
  });

  document.getElementById('about-btn')?.addEventListener('click', () => {
    document.getElementById('about-modal').classList.add('open');
  });

  document.getElementById('about-modal-close')?.addEventListener('click', () => {
    document.getElementById('about-modal').classList.remove('open');
  });

  document.getElementById('about-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
  });

  document.querySelectorAll('.timeline-row').forEach(row => {
    row.addEventListener('click', () => {
      const id = row.dataset.id;
      currentEntry = entries.find(e => e.id === id);
      // The revisit that unlocks edit/delete must be a *separate* visit from
      // the one that first records it — so capture the prior state before
      // markRevisited() sets it, and gate this view's controls on that.
      currentEntry._priorRevisit = !!currentEntry?.revisitedAt;
      markRevisited(currentEntry);
      // Re-render the read view content before showing it
      document.getElementById('read-view').innerHTML = renderRead();
      bindReadActions();
      showView('read');
      refreshReadActions(currentEntry);
      if (currentEntry?.type === 'capsule' && Date.now() >= currentEntry.capsule?.unlockAt) {
        decryptAndShowCapsule(currentEntry);
      }
      if (currentEntry?.type === 'decay') {
        showDecayedBody(currentEntry);
      }
    });
  });

  document.querySelectorAll('.type-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      currentType = btn.dataset.type;
      const title = document.getElementById('write-title')?.value || '';
      const body  = document.getElementById('write-body')?.innerHTML || '';
      currentEntry = { ...(currentEntry || {}), title, body };
      render();
      showView('write');
      document.getElementById('write-title').value = title;
    });
  });

  const writeBody = document.getElementById('write-body');
  if (writeBody) {
    // Restore content (preserved across tab switches / re-renders)
    writeBody.innerHTML = currentEntry?.body || '';
    writeBody.addEventListener('input', () => {
      const wv = document.getElementById('write-view');
      if (wv) wv.classList.toggle('typing', writeBody.textContent.trim().length > 0);
      handleSlashInput(writeBody);
    });
    writeBody.addEventListener('keydown', handleSlashKeydown);
    // Honesty Constraint: pasted text would let you filter/pre-edit a thought
    // before it ever reaches the page, so composition only accepts typing.
    writeBody.addEventListener('paste', e => e.preventDefault());
    writeBody.addEventListener('drop', e => {
      if (e.dataTransfer?.types?.includes('text/plain')) e.preventDefault();
    });
  }

  document.getElementById('cancel-btn')?.addEventListener('click', () => {
    stopSpotifyPoll();
    editingId = null;
    writeMode = 'new';
    pendingAttachments = [];
    showView('list');
  });

  document.getElementById('seal-btn')?.addEventListener('click', handleSeal);

  const capsuleDate = document.getElementById('capsule-date');
  if (capsuleDate) {
    capsuleDate.addEventListener('click', () => {
      initDP();
      document.getElementById('dp-overlay').classList.add('open');
      positionDP(capsuleDate);
      bindDPEvents();
    });
  }

  // Attachments
  const attachBtn   = document.getElementById('attach-btn');
  const attachInput = document.getElementById('attach-input');
  if (attachBtn && attachInput) {
    attachBtn.addEventListener('click', () => attachInput.click());
    attachInput.addEventListener('change', () => {
      addFiles(attachInput.files);
      attachInput.value = '';
    });
  }
  const writeInner = document.querySelector('.write-inner');
  if (writeInner) {
    writeInner.addEventListener('dragover', e => {
      e.preventDefault();
      writeInner.classList.add('drag-over');
    });
    writeInner.addEventListener('dragleave', e => {
      if (e.target === writeInner) writeInner.classList.remove('drag-over');
    });
    writeInner.addEventListener('drop', e => {
      e.preventDefault();
      writeInner.classList.remove('drag-over');
      if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
    });
  }
  bindAttachRemove();

  const readBack = document.getElementById('read-back');
  if (readBack) readBack.addEventListener('click', () => showView('list'));
}

// ─── Slash command editor (Notion-style blocks) ─────────────────────────────
const SLASH_BLOCKS = [
  { key: 'h1',      label: 'Heading 1',     hint: 'Large heading',    icon: 'H1', run: () => format('formatBlock', 'H1') },
  { key: 'h2',      label: 'Heading 2',     hint: 'Medium heading',   icon: 'H2', run: () => format('formatBlock', 'H2') },
  { key: 'h3',      label: 'Heading 3',     hint: 'Small heading',    icon: 'H3', run: () => format('formatBlock', 'H3') },
  { key: 'text',    label: 'Text',          hint: 'Plain paragraph',  icon: '&#182;', run: () => format('formatBlock', 'P') },
  { key: 'quote',   label: 'Quote',         hint: 'Capture a quote',  icon: '&#8220;', run: () => format('formatBlock', 'BLOCKQUOTE') },
  { key: 'bullet',  label: 'Bulleted list', hint: 'Unordered list',   icon: '&bull;', run: () => format('insertUnorderedList') },
  { key: 'number',  label: 'Numbered list', hint: 'Ordered list',     icon: '1.', run: () => format('insertOrderedList') },
  { key: 'divider', label: 'Divider',       hint: 'Visual separator', icon: '&mdash;', run: () => format('insertHorizontalRule') },
  { key: 'link',    label: 'Link',          hint: 'Insert a hyperlink', icon: '&#128279;', run: insertLink },
];

function format(cmd, arg) {
  document.execCommand(cmd, false, arg);
}

function insertLink() {
  const url = prompt('Link URL:');
  if (!url) return;
  const sel = window.getSelection();
  if (sel && sel.toString()) {
    document.execCommand('createLink', false, url);
  } else {
    // No selection — insert the URL itself as a link
    document.execCommand('insertHTML', false,
      `<a href="${escAttr(url)}" target="_blank" rel="noopener">${escHtml(url)}</a>&nbsp;`);
  }
}

// Read the text of the current line up to the caret
function caretLineQuery() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  const node  = range.endContainer;
  if (node.nodeType !== Node.TEXT_NODE) return null;
  const textBefore = node.textContent.slice(0, range.endOffset);
  const m = textBefore.match(/\/([a-zA-Z0-9]*)$/);
  if (!m) return null;
  return { query: m[1], len: m[0].length };
}

function handleSlashInput(editor) {
  const info = caretLineQuery();
  if (!info) { hideSlashMenu(); return; }
  const q = info.query.toLowerCase();
  slashFiltered = SLASH_BLOCKS.filter(b =>
    b.key.includes(q) || b.label.toLowerCase().includes(q));
  if (!slashFiltered.length) { hideSlashMenu(); return; }
  slashMatchLen = info.len;
  slashIndex = 0;
  showSlashMenu();
}

function showSlashMenu() {
  const menu = document.getElementById('slash-menu');
  if (!menu) return;
  slashActive = true;
  menu.innerHTML = slashFiltered.map((b, i) => `
    <div class="slash-item ${i === slashIndex ? 'active' : ''}" data-i="${i}">
      <span class="slash-icon">${b.icon}</span>
      <span class="slash-text"><span class="slash-label">${b.label}</span><span class="slash-hint">${b.hint}</span></span>
    </div>`).join('');

  // Position near the caret
  const sel = window.getSelection();
  if (sel && sel.rangeCount) {
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const top  = (rect.bottom || rect.top) + 6;
    menu.style.top  = `${Math.min(top, window.innerHeight - 320)}px`;
    menu.style.left = `${Math.min(rect.left, window.innerWidth - 260)}px`;
  }
  menu.classList.add('open');

  menu.querySelectorAll('.slash-item').forEach(el => {
    el.addEventListener('mousedown', e => {
      e.preventDefault();
      slashIndex = parseInt(el.dataset.i);
      applySlash();
    });
  });
}

function hideSlashMenu() {
  slashActive = false;
  const menu = document.getElementById('slash-menu');
  if (menu) menu.classList.remove('open');
}

function applySlash() {
  const block = slashFiltered[slashIndex];
  if (!block) { hideSlashMenu(); return; }

  // Delete the typed "/query" before the caret
  const sel = window.getSelection();
  if (sel && sel.rangeCount && slashMatchLen > 0) {
    const range = sel.getRangeAt(0);
    try {
      range.setStart(range.endContainer, range.endOffset - slashMatchLen);
      range.deleteContents();
    } catch {}
  }
  hideSlashMenu();
  block.run();
}

function handleSlashKeydown(e) {
  if (!slashActive) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    slashIndex = (slashIndex + 1) % slashFiltered.length;
    showSlashMenu();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    slashIndex = (slashIndex - 1 + slashFiltered.length) % slashFiltered.length;
    showSlashMenu();
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault();
    applySlash();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    hideSlashMenu();
  }
}

function bindDPEvents() {
  const overlay = document.getElementById('dp-overlay');
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
  document.getElementById('dp-prev')?.addEventListener('click', () => {
    dpMonth--;
    if (dpMonth < 0) { dpMonth = 11; dpYear--; }
    document.getElementById('dp-popup').innerHTML = renderDatePicker();
    bindDPEvents();
  });
  document.getElementById('dp-next')?.addEventListener('click', () => {
    dpMonth++;
    if (dpMonth > 11) { dpMonth = 0; dpYear++; }
    document.getElementById('dp-popup').innerHTML = renderDatePicker();
    bindDPEvents();
  });
  document.querySelectorAll('.dp-day:not(.past):not(.empty)').forEach(cell => {
    cell.addEventListener('click', () => {
      dpSelected = new Date(
        parseInt(cell.dataset.year),
        parseInt(cell.dataset.month),
        parseInt(cell.dataset.day),
        23, 59, 59
      );
      const input = document.getElementById('capsule-date');
      if (input) input.value = formatDateInput(dpSelected.getTime());
      overlay.classList.remove('open');
      document.getElementById('dp-popup').innerHTML = renderDatePicker();
    });
  });
}

// ─── View transitions ─────────────────────────────────────────────────────────
function showView(name) {
  currentView = name;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById(`${name}-view`);
  if (el) requestAnimationFrame(() => el.classList.add('active'));
}

// ─── Spotify ──────────────────────────────────────────────────────────────────
async function handleSpotifyConnect() {
  document.getElementById('spotify-modal').classList.remove('open');
  const authUrl = await startAuth();
  let code = null;
  if (window.emberAPI?.isElectron) {
    code = await window.emberAPI.spotifyAuth(authUrl);
  } else {
    window.location.href = authUrl;
    return;
  }
  if (code) {
    try {
      await exchangeCode(code);
      render();
    } catch (e) {
      console.error('Spotify auth failed:', e);
    }
  }
}

function startSpotifyPoll() {
  if (!isConnected()) return;
  stopSpotifyPoll();
  const poll = async () => {
    nowPlaying = await getNowPlaying();
    const bar = document.getElementById('now-playing-bar');
    if (bar) {
      bar.className = 'now-playing-bar' + (nowPlaying ? ' visible' : '');
      bar.textContent = nowPlaying ? `♫ ${nowPlaying.trackName}` : '';
    }
  };
  poll();
  spotifyPollTimer = setInterval(poll, 5000);
}

function stopSpotifyPoll() {
  if (spotifyPollTimer) { clearInterval(spotifyPollTimer); spotifyPollTimer = null; }
}

// ─── Seal ─────────────────────────────────────────────────────────────────────
async function handleSeal() {
  const title  = document.getElementById('write-title')?.value.trim() || '';
  const editor = document.getElementById('write-body');
  const body   = editor?.innerHTML || '';
  const hasText = (editor?.textContent || '').trim().length > 0;
  if (!title && !hasText) return;

  const original = editingId ? entries.find(e => e.id === editingId) : null;
  const id = editingId || generateId();
  const createdAt = original?.createdAt || Date.now();

  let entry = { id, createdAt, title, type: currentType, rich: true };
  // Editing doesn't reset the revisitation gate — it was already earned to get here.
  if (original?.revisitedAt) entry.revisitedAt = original.revisitedAt;

  if (currentType === 'regular') entry.body = body;

  let capsulePass = null;
  if (currentType === 'capsule') {
    const dateInput  = document.getElementById('capsule-date')?.value;
    const passInput  = document.getElementById('capsule-pass')?.value || '';
    const unlockAt   = dpSelected ? dpSelected.getTime() : (dateInput ? new Date(dateInput).getTime() : Date.now() + 86400000);
    const passphrase = passInput || formatDateInput(unlockAt);
    capsulePass      = passphrase;
    const encrypted  = await encrypt(body, passphrase);
    entry.capsule    = { unlockAt, encrypted };
  }

  if (currentType === 'decay') {
    const durationDays = parseInt(document.getElementById('decay-days')?.value) || 30;
    const mode         = document.getElementById('decay-mode')?.value || 'words';
    const tombstone    = document.getElementById('decay-tombstone')?.value || '';
    entry.body  = body;
    entry.decay = { durationDays, mode, tombstone };
  }

  // Attachments — encrypted for capsules, stored as blobs otherwise
  if (pendingAttachments.length) {
    if (currentType === 'capsule') {
      entry.attachmentsEncrypted = true;
      entry.attachments = [];
      for (const a of pendingAttachments) {
        const bytes = new Uint8Array(await a.blob.arrayBuffer());
        const enc   = await encryptBytes(bytes, capsulePass);
        entry.attachments.push({ id: a.id, name: a.name, type: a.type, size: a.size, enc });
      }
    } else {
      entry.attachments = pendingAttachments.map(a => ({
        id: a.id, name: a.name, type: a.type, size: a.size, blob: a.blob,
      }));
    }
  }

  if (nowPlaying) {
    entry.spotify = { ...nowPlaying };
    try {
      const features = await getAudioFeatures(nowPlaying.trackId);
      if (features) entry.spotify = { ...entry.spotify, ...features };
    } catch {}
  } else if (original?.spotify) {
    entry.spotify = original.spotify;
  }

  const validation = await validateEntry(entry);
  if (!validation.valid) {
    showSealErrors(validation.errors);
    return;
  }

  stopSpotifyPoll();
  await saveEntry(entry);
  entries = await loadEntries();
  await refreshDecayStatus();
  pendingAttachments = [];
  currentEntry = entry;
  editingId    = null;
  writeMode    = 'new';
  showView('list');
  render();
}

function showSealErrors(errors) {
  const box = document.getElementById('write-errors');
  if (!box) return;
  box.innerHTML = errors.map(msg => `<div>${escHtml(msg)}</div>`).join('');
}

// ─── Capsule decryption ───────────────────────────────────────────────────────
async function decryptAndShowCapsule(entry) {
  await new Promise(r => setTimeout(r, 50));
  const placeholder = document.getElementById('capsule-body-placeholder');
  if (!placeholder) return;
  try {
    const passphrase = formatDateInput(entry.capsule.unlockAt);
    const text = await decrypt(entry.capsule.encrypted, passphrase);
    placeholder.outerHTML = entry.rich
      ? `<div class="read-body rich">${sanitizeHtml(text)}</div>`
      : `<div class="read-body">${escHtml(text).replace(/\n/g,'<br>')}</div>`;

    // Decrypt sealed attachments, if any
    const slot = document.getElementById('read-attachments-slot');
    if (slot && entry.attachments?.length) {
      const decrypted = [];
      for (const a of entry.attachments) {
        const bytes = await decryptBytes(a.enc, passphrase);
        const blob  = new Blob([bytes], { type: a.type });
        decrypted.push({ ...a, blob });
      }
      slot.outerHTML = renderAttachmentsHTML(decrypted);
    }
  } catch {
    placeholder.innerHTML = `<em style="color:var(--dec-color)">Could not decrypt &#8212; passphrase may differ.</em>`;
  }
}

// ─── Decay rendering (reflective-modules service) ─────────────────────────────
async function showDecayedBody(entry) {
  const placeholder = document.getElementById('decay-body-placeholder');
  if (!placeholder) return;
  try {
    const result = await renderDecayEntry(entry);
    if (result.fullyDecayed) {
      placeholder.outerHTML = `<div class="read-body" style="color:var(--text-faint);font-style:italic">[This entry has fully decayed]</div>`;
      if (result.tombstone) {
        document.querySelector('#read-view .read-body')
          ?.insertAdjacentHTML('afterend', `<div class="decay-tombstone">${escHtml(result.tombstone)}</div>`);
      }
    } else {
      placeholder.outerHTML = `<div class="read-body">${result.html}</div>`;
    }
  } catch {
    placeholder.innerHTML = `<em style="color:var(--dec-color)">Could not reach the reflective-modules service &#8212; try again shortly.</em>`;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(ts) {
  return new Date(ts).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}
function formatDateInput(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(s) {
  return String(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// Light sanitizer for rich entry HTML: strip dangerous tags/attrs before display
const ALLOWED_TAGS = new Set(['P','BR','H1','H2','H3','BLOCKQUOTE','UL','OL','LI','HR','A','B','STRONG','I','EM','U','DIV','SPAN']);
function sanitizeHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const walk = node => {
    [...node.childNodes].forEach(child => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        if (!ALLOWED_TAGS.has(child.tagName)) {
          child.replaceWith(...child.childNodes);
          return;
        }
        [...child.attributes].forEach(attr => {
          const name = attr.name.toLowerCase();
          const val  = attr.value.toLowerCase();
          if (name.startsWith('on') || (name === 'href' && val.startsWith('javascript:')) || name === 'style') {
            child.removeAttribute(attr.name);
          }
        });
        if (child.tagName === 'A') {
          child.setAttribute('target', '_blank');
          child.setAttribute('rel', 'noopener');
        }
        walk(child);
      }
    });
  };
  walk(tmp);
  return tmp.innerHTML;
}

function stripTags(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.textContent || '').replace(/\s+/g, ' ').trim();
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
function renderServiceError(status) {
  const missing = [];
  if (!status.validation) missing.push('the validation engine (C#, http://127.0.0.1:8901)');
  if (!status.reflective) missing.push('the reflective-modules service (Python, http://127.0.0.1:8902)');
  document.getElementById('app').innerHTML = `
    <div class="empty-state" style="height:100vh;">
      <div class="big-spark" style="color:var(--dec-color);animation:none;">&#10022;</div>
      <p>Ember can't reach ${missing.join(' and ')}.</p>
      <small>Run <span style="font-family:monospace">npm run services</span> (or <span style="font-family:monospace">npm run dev</span>, which starts them too), then reload.</small>
    </div>`;
}

async function boot() {
  const status = await checkServices();
  if (!status.ok) {
    renderServiceError(status);
    return;
  }
  entries = await loadEntries();
  await refreshDecayStatus();
  initDP();
  render();
  requestAnimationFrame(() => {
    const el = document.getElementById('list-view');
    if (el) el.classList.add('active');
  });
}

boot();
