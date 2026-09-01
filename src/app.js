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
import { startAuth, exchangeCode, getNowPlaying, getAudioFeatures, isConnected, disconnect, getClientId, setClientId, hasClientId, hasDefaultClientId, usingOwnClientId, redirectUri, isLocalhostOrigin, loopbackUrl } from './spotify.js';
import { version as pkgVersion } from '../package.json';

// --- App metadata ----------------------------------------------------------
const APP_VERSION = pkgVersion;
const APP_AUTHOR = 'Jeremiah Ayeni';
const APP_GITHUB = 'https://github.com/Jeremy-1011';
const APP_SOURCE = 'https://github.com/Jeremy-1011/Journal-App-Ember';

const ONE_DAY_MS = 86400000;

// --- State -----------------------------------------------------------------
// These hold whatever the app is currently showing. Kept at the top so it is
// easy to see everything the screen depends on.
let entries = [];
let currentEntry = null;
let currentView = 'list';
let currentType = 'regular';
let nowPlaying = null;
let spotifyPollTimer = null;
let spotifyTickTimer = null;
let nowPlayingTrackId = null;
let decayStatus = {}; // entry id -> { progress, fullyDecayed }, from the reflective-modules service
let writeMode = 'new';
let editingId = null;
let pendingAttachments = []; // { id, name, type, size, blob } while writing

// Slash command menu state
let slashActive = false;
let slashIndex = 0;
let slashMatchLen = 0;
let slashFiltered = [];

// Date picker state
let dpYear;
let dpMonth;
let dpSelected;

// --- Heat ------------------------------------------------------------------
// Newer entries burn brighter. Older ones cool down towards ash.
function heatOf(createdAt) {
  const age = Date.now() - createdAt;
  if (age < ONE_DAY_MS) {
    return 1.0;
  }
  if (age < 7 * ONE_DAY_MS) {
    return 0.75;
  }
  if (age < 30 * ONE_DAY_MS) {
    return 0.45;
  }
  if (age < 90 * ONE_DAY_MS) {
    return 0.2;
  }
  return 0.08;
}

// Turns a heat value between 0 and 1 into an orange-to-ash colour.
function heatColor(heat) {
  const r = Math.round(74 + 166 * heat);
  const g = Math.round(48 + 34 * heat);
  const b = Math.round(32 - 8 * heat);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

// --- Ember particle canvas -------------------------------------------------
const EMBER_COLORS = ['#f05218', '#ff8c42', '#ffb347', '#e88020', '#ff6b35'];
const EMBER_COUNT = 35;

// Fills a particle with fresh random values. Used both when a particle is
// created and when it burns out and starts again from the bottom.
function resetParticle(p, width, height) {
  p.x = Math.random() * width;
  p.y = height + Math.random() * 60;
  p.size = 1 + Math.random() * 3;
  p.speedY = 0.4 + Math.random() * 0.7;
  p.driftX = (Math.random() - 0.5) * 0.5;
  p.rotation = Math.random() * Math.PI * 2;
  p.rotSpeed = (Math.random() - 0.5) * 0.04;
  p.color = EMBER_COLORS[Math.floor(Math.random() * EMBER_COLORS.length)];
  p.life = 0;
  p.maxLife = 180 + Math.random() * 120;
  return p;
}

function initEmberCanvas() {
  const canvas = document.getElementById('embers');
  if (!canvas) {
    return;
  }
  const ctx = canvas.getContext('2d');

  // Measure the canvas itself rather than the window. They are the same size
  // until the page is scaled up on a large display, and then they are not.
  function canvasSize() {
    const rect = canvas.getBoundingClientRect();
    return {
      width: Math.round(rect.width) || window.innerWidth,
      height: Math.round(rect.height) || window.innerHeight
    };
  }

  function resize() {
    const size = canvasSize();
    canvas.width = size.width;
    canvas.height = size.height;
  }
  resize();
  window.addEventListener('resize', resize);

  // Build the particles. They start scattered up the screen and part-way
  // through their life, so they are not all born at the bottom together.
  const particles = [];
  for (let i = 0; i < EMBER_COUNT; i++) {
    const size = canvasSize();
    const p = resetParticle({}, size.width, size.height);
    p.y = Math.random() * size.height;
    p.life = Math.random() * p.maxLife;
    particles.push(p);
  }

  function drawParticle(p) {
    const progress = p.life / p.maxLife;

    // Fade in over the first fifth of life, fade out over the last third.
    let alpha;
    if (progress < 0.2) {
      alpha = progress / 0.2;
    } else if (progress > 0.7) {
      alpha = (1 - progress) / 0.3;
    } else {
      alpha = 1;
    }
    alpha = alpha * 0.55;

    const radius = p.size * 2.5;
    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
    grad.addColorStop(0, p.color);
    grad.addColorStop(1, 'transparent');

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  }

  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.life++;
      p.y -= p.speedY;
      p.x += p.driftX;
      p.rotation += p.rotSpeed;
      if (p.life >= p.maxLife) {
        resetParticle(p, canvas.width, canvas.height);
      }
      drawParticle(p);
    }
    requestAnimationFrame(tick);
  }
  tick();
}

// --- Render ----------------------------------------------------------------
// Rebuilds the whole page, then re-attaches all the event handlers.
function render() {
  const spotifyClass = isConnected() ? 'connected' : '';
  const spotifyHeading = isConnected() ? 'Spotify connected' : 'Connect Spotify';

  let spotifyText;
  if (isConnected()) {
    spotifyText = 'Your Spotify account is linked. Now-playing is tracked while you write.';
  } else {
    spotifyText = 'Link your Spotify account to save the track playing while you write each entry.';
  }

  // When Ember ships its own Spotify app, signing in is one button and the
  // Client ID field is tucked away for people who want to use their own app.
  // With no app of its own, the field is the only way in, so it is shown.
  let clientIdField = '';
  if (!isConnected()) {
    const ownId = usingOwnClientId() ? localStorage.getItem('spotify_client_id') : '';
    const startOpen = !hasDefaultClientId() || usingOwnClientId();
    const advancedHidden = startOpen ? '' : 'hidden';

    let toggle = '';
    if (hasDefaultClientId()) {
      toggle = `<button type="button" class="modal-toggle" id="spotify-advanced-toggle">
                  Use your own Spotify app instead
                </button>`;
    }

    // Spotify rejects the login unless this exact string is registered on the
    // app, and it depends on where Ember is being run from -- so show it
    // rather than leaving people to work it out.
    let uriNotice;
    if (isLocalhostOrigin()) {
      // Nothing the user can register would make this work, so send them to
      // the address that does rather than letting Spotify reject the login.
      uriNotice = `
        <p class="modal-help redirect-notice redirect-warning">Spotify does not
          accept <code>localhost</code> addresses. Open Ember at
          <a href="${escAttr(loopbackUrl())}">${escHtml(loopbackUrl())}</a>
          and sign in from there.</p>`;
    } else {
      uriNotice = `
        <p class="modal-help redirect-notice">This app must have
          <code>${escHtml(redirectUri())}</code>
          registered as a Redirect URI in the Spotify dashboard.</p>`;
    }

    clientIdField = `
      ${uriNotice}
      ${toggle}
      <div id="spotify-advanced" ${advancedHidden}>
        <label class="modal-label" for="spotify-client-id">Spotify Client ID</label>
        <input type="text" id="spotify-client-id" class="modal-input" spellcheck="false"
               autocomplete="off" placeholder="paste the Client ID from your Spotify app"
               value="${escAttr(ownId)}">
        <p class="modal-help">Create an app at developer.spotify.com/dashboard and add
          <code>http://127.0.0.1:8888/callback</code> as a Redirect URI.</p>
      </div>`;
  }

  let spotifyButtons;
  if (isConnected()) {
    spotifyButtons =
      `<button class="btn-ghost" id="spotify-disconnect">Disconnect</button>
       <button class="btn-ghost" id="spotify-modal-close">Close</button>`;
  } else {
    const connectDisabled = (hasClientId() && !isLocalhostOrigin()) ? '' : 'disabled';
    // A recognisable sign-in button when Ember has its own app; otherwise the
    // plainer wording, because the user is wiring up their own.
    const connectLabel = hasDefaultClientId() && !usingOwnClientId()
      ? '<span class="spotify-mark">&#9835;</span> Sign in with Spotify'
      : 'Connect';
    spotifyButtons =
      `<button class="btn-ghost" id="spotify-modal-close">Cancel</button>
       <button class="btn-green" id="spotify-connect-btn" ${connectDisabled}>${connectLabel}</button>`;
  }

  document.getElementById('app').innerHTML = `
    <canvas id="embers"></canvas>

    <div id="header">
      <div id="logo" role="button" aria-label="Back to journal">
        <span class="spark">&#10022;</span> ember
      </div>
      <div id="header-right">
        <button id="about-btn" title="About ember" aria-label="About ember">i</button>
        <button id="spotify-btn" class="${spotifyClass}">&#9835;</button>
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
        <h2>${spotifyHeading}</h2>
        <p>${spotifyText}</p>
        ${clientIdField}
        <div class="modal-actions">
          ${spotifyButtons}
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

  // Shrink the header once the list is scrolled down a little.
  const listView = document.getElementById('list-view');
  const header = document.getElementById('header');
  if (listView && header) {
    listView.addEventListener('scroll', function () {
      header.classList.toggle('scrolled', listView.scrollTop > 50);
    });
  }
}

// --- List ------------------------------------------------------------------
function renderList() {
  if (entries.length === 0) {
    return `<div class="empty-state">
      <div class="big-spark">&#10022;</div>
      <p>Your journal is empty.</p>
      <small>Press + to write your first entry.</small>
    </div>`;
  }

  let rows = '';

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const hc = heatColor(heatOf(e.createdAt));

    // Cards alternate sides down the timeline spine.
    const side = i % 2 === 0 ? 'left' : 'right';

    let typeLabel = '';
    if (e.type === 'capsule') {
      typeLabel = '<span class="node-badge cap">capsule</span>';
    } else if (e.type === 'decay') {
      typeLabel = '<span class="node-badge dec">decaying</span>';
    }

    // What to show under the title depends on the entry type.
    let preview = '';
    if (e.type === 'capsule') {
      if (Date.now() >= e.capsule.unlockAt) {
        preview = 'Ready to open';
      } else {
        preview = 'Sealed until ' + formatDate(e.capsule.unlockAt);
      }
    } else if (e.type === 'decay') {
      const status = decayStatus[e.id];
      const fullyDecayed = status ? status.fullyDecayed === true : false;
      if (fullyDecayed) {
        preview = '[fully decayed]';
      } else {
        preview = previewText(e).slice(0, 140);
      }
    } else {
      preview = previewText(e).slice(0, 140);
    }

    let spotifyBar = '';
    if (e.spotify) {
      spotifyBar = '<div class="node-spotify">&#9835; ' + escHtml(e.spotify.trackName || '') + '</div>';
    }

    let orbClass = 'node-orb';
    if (e.type === 'capsule') {
      orbClass = 'node-orb orb-capsule';
    } else if (e.type === 'decay') {
      orbClass = 'node-orb orb-decay';
    }

    let attachCount = '';
    if (e.attachments && e.attachments.length) {
      attachCount = '<span class="node-attach">&#128206; ' + e.attachments.length + '</span>';
    }

    const card = `
      <article class="entry-node" style="--heat-color:${hc}">
        <div class="node-header">
          <div class="node-title">${escHtml(e.title || 'Untitled')}</div>
          ${typeLabel}
        </div>
        <p class="node-preview">${escHtml(preview)}</p>
        <div class="node-foot">
          <span class="node-date">${formatDate(e.createdAt)}</span>
          ${attachCount}
          ${spotifyBar}
        </div>
      </article>`;

    const orb = `<div class="${orbClass}" style="--heat-color:${hc}"></div>`;
    const conn = `<div class="node-connector" style="--heat-color:${hc}"></div>`;

    let inner;
    if (side === 'left') {
      inner = card + conn + orb;
    } else {
      inner = orb + conn + card;
    }

    rows += `<div class="timeline-row ${side}" data-id="${e.id}" style="animation-delay:${i * 0.06}s">${inner}</div>`;
  }

  return `<div class="timeline">
    <div class="timeline-spine"></div>
    ${rows}
  </div>`;
}

// Rich entries store HTML, so strip the tags before showing a plain preview.
function previewText(entry) {
  const body = entry.body || '';
  if (entry.rich) {
    return stripTags(body);
  }
  return body;
}

// Asks the reflective-modules service for every decaying entry's progress in
// one call. Call this after anything changes `entries`.
async function refreshDecayStatus() {
  const decaying = [];
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].type === 'decay') {
      decaying.push(entries[i]);
    }
  }

  if (decaying.length === 0) {
    decayStatus = {};
    return;
  }

  try {
    decayStatus = await fetchDecayBatch(decaying);
  } catch (err) {
    // The service went away mid-session. boot() already checks the services
    // are up at startup, so just keep showing the last status we had.
  }
}

// --- Write -----------------------------------------------------------------
function renderWrite() {
  const entry = currentEntry || {};

  let typeOptions = '';
  if (currentType === 'capsule') {
    typeOptions = renderCapsuleOptions(entry);
  } else if (currentType === 'decay') {
    typeOptions = renderDecayOptions(entry);
  }

  let attachHint = '';
  if (currentType === 'capsule') {
    attachHint = '<span class="attach-hint">files will be sealed &amp; encrypted too</span>';
  }

  const sealLabel = writeMode === 'edit' ? 'save changes' : 'seal it';


  return `
    <div class="write-inner">
      <input id="write-title" type="text" placeholder="title&#8230;" value="${escAttr(entry.title || '')}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
      <div id="write-body" class="write-editor" contenteditable="true" data-placeholder="write anything, or press / for blocks" spellcheck="false"></div>
      <span class="honesty-hint">honesty constraint &#8212; paste is disabled, this has to be in your own words</span>
      <div id="write-errors" class="write-errors"></div>
      <div class="type-options">
        ${typeOptions}
      </div>
      <div class="attach-zone">
        <input type="file" id="attach-input" multiple hidden>
        <button type="button" id="attach-btn" class="attach-btn">&#128206; attach files</button>
        ${attachHint}
        <div class="attach-list" id="attach-list">${renderAttachList()}</div>
      </div>
    </div>
    <div class="write-footer">
      <div class="type-tabs">
        <button class="type-tab ${currentType === 'regular' ? 'active' : ''}" data-type="regular">regular</button>
        <button class="type-tab ${currentType === 'capsule' ? 'active' : ''}" data-type="capsule">time capsule</button>
        <button class="type-tab ${currentType === 'decay' ? 'active' : ''}" data-type="decay">decaying</button>
      </div>
      <div class="write-actions">
        <div id="now-playing-bar" class="${nowPlaying ? 'visible' : ''}">${renderNowPlaying()}</div>
        <button id="cancel-btn">cancel</button>
        <button id="seal-btn"><span>${sealLabel}</span></button>
      </div>
    </div>`;
}

function renderCapsuleOptions(entry) {
  let unlockVal = '';
  if (entry.capsule) {
    unlockVal = formatDateInput(entry.capsule.unlockAt);
  }

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
  // Fall back to sensible defaults when this is a brand new entry.
  let days = 30;
  let mode = 'words';
  let tomb = '';
  if (entry.decay) {
    days = entry.decay.durationDays || 30;
    mode = entry.decay.mode || 'words';
    tomb = entry.decay.tombstone || '';
  }

  return `<div class="decay-options">
    <div>
      <label>Duration (days)</label>
      <input type="number" id="decay-days" value="${days}" min="1" max="3650">
    </div>
    <div>
      <label>Decay mode</label>
      <select id="decay-mode">
        <option value="words" ${mode === 'words' ? 'selected' : ''}>words &#8212; redact from end</option>
        <option value="burn" ${mode === 'burn' ? 'selected' : ''}>burn &#8212; fade opacity</option>
      </select>
    </div>
    <div>
      <label>Tombstone (shown when fully decayed)</label>
      <input type="text" id="decay-tombstone" placeholder="optional final message&#8230;" value="${escAttr(tomb)}">
    </div>
  </div>`;
}

// --- Attachments (write view) ----------------------------------------------
function renderAttachList() {
  let html = '';

  for (let i = 0; i < pendingAttachments.length; i++) {
    const a = pendingAttachments[i];

    let thumb;
    if (a.type.startsWith('image/')) {
      thumb = `<img class="chip-thumb" src="${URL.createObjectURL(a.blob)}" alt="">`;
    } else {
      thumb = `<span class="chip-icon">${fileLabel(a)}</span>`;
    }

    html += `
    <div class="attach-chip" data-id="${a.id}">
      ${thumb}
      <span class="chip-name">${escHtml(a.name)}</span>
      <span class="chip-size">${humanSize(a.size)}</span>
      <button type="button" class="chip-remove" data-id="${a.id}" title="Remove">&times;</button>
    </div>`;
  }

  return html;
}

function addFiles(fileList) {
  for (let i = 0; i < fileList.length; i++) {
    const f = fileList[i];
    pendingAttachments.push({
      id: generateId(),
      name: f.name,
      type: f.type || 'application/octet-stream',
      size: f.size,
      blob: f
    });
  }
  refreshAttachList();
}

function refreshAttachList() {
  const list = document.getElementById('attach-list');
  if (!list) {
    return;
  }
  list.innerHTML = renderAttachList();
  bindAttachRemove();
}

function bindAttachRemove() {
  const buttons = document.querySelectorAll('.chip-remove');

  for (let i = 0; i < buttons.length; i++) {
    const btn = buttons[i];
    btn.addEventListener('click', function () {
      // Rebuild the list without the one that was clicked.
      const kept = [];
      for (let j = 0; j < pendingAttachments.length; j++) {
        if (pendingAttachments[j].id !== btn.dataset.id) {
          kept.push(pendingAttachments[j]);
        }
      }
      pendingAttachments = kept;
      refreshAttachList();
    });
  }
}

// A short label for the file icon, e.g. "PDF" or "DOCX".
function fileLabel(a) {
  if (a.type === 'application/pdf') {
    return 'PDF';
  }
  const parts = a.name.split('.');
  const ext = parts[parts.length - 1] || 'FILE';
  return ext.slice(0, 4).toUpperCase();
}

function humanSize(bytes) {
  if (bytes < 1024) {
    return bytes + ' B';
  }
  if (bytes < 1048576) {
    return (bytes / 1024).toFixed(0) + ' KB';
  }
  return (bytes / 1048576).toFixed(1) + ' MB';
}

// --- Attachments (read view) -----------------------------------------------
function attachmentItemHTML(a, url) {
  if (a.type.startsWith('image/')) {
    return `<a class="att att-img" href="${url}" target="_blank" rel="noopener">
      <img src="${url}" alt="${escAttr(a.name)}">
    </a>`;
  }

  // PDFs open in a new tab; anything else downloads.
  const isPdf = a.type === 'application/pdf';
  const pdfClass = isPdf ? 'is-pdf' : '';
  const linkAttrs = isPdf ? 'target="_blank" rel="noopener"' : `download="${escAttr(a.name)}"`;
  const action = isPdf ? ' &middot; open' : ' &middot; download';

  return `<a class="att att-file ${pdfClass}" href="${url}" ${linkAttrs}>
    <span class="att-icon">${fileLabel(a)}</span>
    <span class="att-info">
      <span class="att-name">${escHtml(a.name)}</span>
      <span class="att-size">${humanSize(a.size)}${action}</span>
    </span>
  </a>`;
}

function renderAttachmentsHTML(list) {
  if (!list || list.length === 0) {
    return '';
  }

  let items = '';
  for (let i = 0; i < list.length; i++) {
    const url = URL.createObjectURL(list[i].blob);
    items += attachmentItemHTML(list[i], url);
  }

  return `<div class="read-attachments">
    <div class="attach-grid">${items}</div>
  </div>`;
}

// --- Read ------------------------------------------------------------------
// Time-Lock Revisitation: the first time an entry is reopened after writing it
// only records that it happened -- edit and delete stay locked. They unlock on
// a later, separate visit, so you cannot write something and instantly erase it.
function markRevisited(entry) {
  if (!entry || entry.revisitedAt) {
    return;
  }
  entry.revisitedAt = Date.now();
  saveEntry(entry).catch(function () {
    // Nothing useful to do if this one write fails.
  });
}

// The real time-lock decision is made by the C# validation engine
// (checkCanModify in services.js). The buttons start disabled and are turned
// on by refreshReadActions() once that answer comes back.
function renderReadActions(e) {
  let editBtn = '';
  if (e.type !== 'capsule') {
    editBtn = '<button class="read-action" id="read-edit-btn" disabled title="Checking&#8230;">&#9998; edit</button>';
  }

  return `<div class="read-actions">
    ${editBtn}
    <button class="read-action read-action-danger" id="read-delete-btn" disabled title="Checking&#8230;">&#128465; delete</button>
  </div>`;
}

async function refreshReadActions(e) {
  let title;
  if (e._priorRevisit) {
    title = 'Sealed entries can only be deleted after they unlock.';
  } else {
    title = 'This is the first time you’ve opened this entry since writing it — come back and revisit it again before you can edit or delete it.';
  }

  let unlocked = false;
  try {
    unlocked = await checkCanModify(e);
  } catch (err) {
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
  const backBtn = document.getElementById('read-back');
  if (backBtn) {
    backBtn.addEventListener('click', function () {
      showView('list');
    });
  }

  const editBtn = document.getElementById('read-edit-btn');
  if (editBtn) {
    editBtn.addEventListener('click', function () {
      const e = currentEntry;
      if (!e) {
        return;
      }
      editingId = e.id;
      currentEntry = e;
      currentType = e.type;
      writeMode = 'edit';

      // Existing (unencrypted) attachments become pending files, so the editor
      // shows them and saves them again unless they are removed.
      pendingAttachments = [];
      const existing = e.attachments || [];
      for (let i = 0; i < existing.length; i++) {
        const a = existing[i];
        pendingAttachments.push({
          id: a.id,
          name: a.name,
          type: a.type,
          size: a.size,
          blob: a.blob
        });
      }

      render();
      showView('write');
    });
  }

  const deleteBtn = document.getElementById('read-delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async function () {
      const e = currentEntry;
      if (!e) {
        return;
      }
      const name = e.title || 'Untitled';
      if (!confirm('Delete "' + name + '"? This cannot be undone.')) {
        return;
      }
      await deleteEntry(e.id);
      entries = await loadEntries();
      await refreshDecayStatus();
      currentEntry = null;
      showView('list');
      render();
    });
  }
}

function renderRead() {
  if (!currentEntry) {
    return '';
  }

  const e = currentEntry;
  const dateStr = formatDate(e.createdAt);

  // Capsules and decaying entries are filled in later, once the services
  // answer, so they start as a placeholder.
  let bodyHtml = '';
  if (e.type === 'capsule') {
    if (capsuleIsOpen(e)) {
      bodyHtml = `<div class="read-body" id="capsule-body-placeholder">
        <em style="color:var(--text-faint)">Decrypting&#8230;</em>
      </div>`;
    } else {
      bodyHtml = `<div class="capsule-locked">
        <div class="capsule-icon">&#128274;</div>
        <h3>Time-sealed</h3>
        <p>This entry unlocks on ${formatDate(e.capsule.unlockAt)}.</p>
      </div>`;
    }
  } else if (e.type === 'decay') {
    bodyHtml = '<div class="read-body" id="decay-body-placeholder"><em style="color:var(--text-faint)">Reflecting&#8230;</em></div>';
  } else if (e.rich) {
    bodyHtml = '<div class="read-body rich">' + sanitizeHtml(e.body || '') + '</div>';
  } else {
    bodyHtml = '<div class="read-body">' + escHtml(e.body || '').replace(/\n/g, '<br>') + '</div>';
  }

  let spotifyHtml = '';
  if (e.spotify) {
    let art = '';
    if (e.spotify.albumArt) {
      art = `<img src="${escAttr(e.spotify.albumArt)}" alt="album art">`;
    }
    spotifyHtml = `
    <div class="read-spotify">
      ${art}
      <div class="read-spotify-info">
        <div class="read-spotify-track">${escHtml(e.spotify.trackName || '')}</div>
        <div class="read-spotify-artist">${escHtml(e.spotify.artistName || '')}</div>
      </div>
      <div class="read-spotify-note">playing when written</div>
    </div>`;
  }

  // Plain entries show attachments now. Capsules leave an empty slot that is
  // filled in after the body is decrypted.
  let attachHtml = '';
  if (e.type === 'capsule') {
    if (capsuleIsOpen(e)) {
      attachHtml = '<div id="read-attachments-slot"></div>';
    }
  } else {
    attachHtml = renderAttachmentsHTML(e.attachments);
  }

  let typeBadge = '';
  if (e.type !== 'regular') {
    typeBadge = '<span class="read-type-badge">' + e.type + '</span>';
  }

  return `<div class="read-inner">
    <button class="read-back" id="read-back">&#8592; back</button>
    <div class="read-header">
      <h1 class="read-title">${escHtml(e.title || 'Untitled')}</h1>
      <div class="read-meta">
        <span>${dateStr}</span>
        ${typeBadge}
      </div>
      ${renderReadActions(e)}
    </div>
    ${bodyHtml}
    ${attachHtml}
    ${spotifyHtml}
  </div>`;
}

// True once a capsule's unlock date has passed.
function capsuleIsOpen(entry) {
  if (!entry.capsule) {
    return false;
  }
  return Date.now() >= entry.capsule.unlockAt;
}

// --- Date picker -----------------------------------------------------------
function initDP() {
  const now = new Date();
  dpYear = now.getFullYear();
  dpMonth = now.getMonth();
  dpSelected = null;
}

// Builds a "year-month-day" key so two dates can be compared easily.
function dayKey(year, month, day) {
  return year + '-' + month + '-' + day;
}

function renderDatePicker() {
  const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];

  const today = new Date();
  const todayKey = dayKey(today.getFullYear(), today.getMonth(), today.getDate());
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  // What weekday the 1st lands on, and how many days the month has.
  const startDow = new Date(dpYear, dpMonth, 1).getDay();
  const daysInMonth = new Date(dpYear, dpMonth + 1, 0).getDate();

  let selectedKey = '';
  if (dpSelected) {
    selectedKey = dayKey(dpSelected.getFullYear(), dpSelected.getMonth(), dpSelected.getDate());
  }

  let dayNames = '';
  for (let i = 0; i < DAYS.length; i++) {
    dayNames += '<div class="dp-day-name">' + DAYS[i] + '</div>';
  }

  let cells = '';

  // Blank squares so the 1st starts under the right weekday.
  for (let i = 0; i < startDow; i++) {
    cells += '<div class="dp-day empty"></div>';
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const thisKey = dayKey(dpYear, dpMonth, d);
    const isPast = new Date(dpYear, dpMonth, d) < todayMidnight;

    let cls = 'dp-day';
    if (isPast) {
      cls += ' past';
    }
    if (thisKey === todayKey) {
      cls += ' today';
    }
    if (thisKey === selectedKey) {
      cls += ' selected';
    }

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
  const rect = inputEl.getBoundingClientRect();
  popup.style.top = (rect.bottom + 6) + 'px';
  popup.style.left = rect.left + 'px';
}

// --- Event binding ---------------------------------------------------------
// Called after every render(), because render() replaces all the HTML and
// throws away the old handlers with it.
function bindEvents() {
  document.getElementById('logo').addEventListener('click', function () {
    showView('list');
  });

  document.getElementById('new-btn').addEventListener('click', function () {
    currentEntry = null;
    currentType = 'regular';
    writeMode = 'new';
    editingId = null;
    pendingAttachments = [];
    showView('write');
    startSpotifyPoll();
  });

  document.getElementById('spotify-btn').addEventListener('click', function () {
    document.getElementById('spotify-modal').classList.add('open');
  });

  const modalClose = document.getElementById('spotify-modal-close');
  if (modalClose) {
    modalClose.addEventListener('click', function () {
      document.getElementById('spotify-modal').classList.remove('open');
    });
  }

  const clientIdInput = document.getElementById('spotify-client-id');
  const spotifyConnect = document.getElementById('spotify-connect-btn');

  const advancedToggle = document.getElementById('spotify-advanced-toggle');
  if (advancedToggle) {
    advancedToggle.addEventListener('click', function () {
      const panel = document.getElementById('spotify-advanced');
      if (panel) {
        panel.hidden = !panel.hidden;
      }
    });
  }

  if (clientIdInput) {
    clientIdInput.addEventListener('input', function () {
      setClientId(clientIdInput.value);
      if (spotifyConnect) {
        spotifyConnect.disabled = !hasClientId();
      }
    });

    // Clearing the field goes back to Ember's own app, if there is one.
    clientIdInput.addEventListener('change', function () {
      if (!clientIdInput.value.trim() && hasDefaultClientId()) {
        render();
        document.getElementById('spotify-modal').classList.add('open');
      }
    });
  }

  if (spotifyConnect) {
    spotifyConnect.addEventListener('click', handleSpotifyConnect);
  }

  const spotifyDisconnect = document.getElementById('spotify-disconnect');
  if (spotifyDisconnect) {
    spotifyDisconnect.addEventListener('click', function () {
      disconnect();
      document.getElementById('spotify-modal').classList.remove('open');
      render();
    });
  }

  // Clicking the dark area outside a modal closes it.
  document.getElementById('spotify-modal').addEventListener('click', function (e) {
    if (e.target === e.currentTarget) {
      e.currentTarget.classList.remove('open');
    }
  });

  const aboutBtn = document.getElementById('about-btn');
  if (aboutBtn) {
    aboutBtn.addEventListener('click', function () {
      document.getElementById('about-modal').classList.add('open');
    });
  }

  const aboutClose = document.getElementById('about-modal-close');
  if (aboutClose) {
    aboutClose.addEventListener('click', function () {
      document.getElementById('about-modal').classList.remove('open');
    });
  }

  document.getElementById('about-modal').addEventListener('click', function (e) {
    if (e.target === e.currentTarget) {
      e.currentTarget.classList.remove('open');
    }
  });

  bindTimelineRows();
  bindTypeTabs();
  bindWriteEditor();

  const cancelBtn = document.getElementById('cancel-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', function () {
      stopSpotifyPoll();
      editingId = null;
      writeMode = 'new';
      pendingAttachments = [];
      showView('list');
    });
  }

  const sealBtn = document.getElementById('seal-btn');
  if (sealBtn) {
    sealBtn.addEventListener('click', handleSeal);
  }

  const capsuleDate = document.getElementById('capsule-date');
  if (capsuleDate) {
    capsuleDate.addEventListener('click', function () {
      initDP();
      document.getElementById('dp-overlay').classList.add('open');
      positionDP(capsuleDate);
      bindDPEvents();
    });
  }

  bindAttachInputs();
  bindAttachRemove();

  const readBack = document.getElementById('read-back');
  if (readBack) {
    readBack.addEventListener('click', function () {
      showView('list');
    });
  }
}

function bindTimelineRows() {
  const rows = document.querySelectorAll('.timeline-row');

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    row.addEventListener('click', function () {
      const id = row.dataset.id;
      let found = null;
      for (let j = 0; j < entries.length; j++) {
        if (entries[j].id === id) {
          found = entries[j];
          break;
        }
      }
      if (!found) {
        return;
      }
      currentEntry = found;

      // The revisit that unlocks edit and delete has to be a *different* visit
      // from the one that first records it. So remember whether this entry had
      // already been revisited before markRevisited() stamps it.
      currentEntry._priorRevisit = currentEntry.revisitedAt ? true : false;
      markRevisited(currentEntry);

      // Rebuild the read view before showing it.
      document.getElementById('read-view').innerHTML = renderRead();
      bindReadActions();
      showView('read');
      refreshReadActions(currentEntry);

      if (currentEntry.type === 'capsule' && capsuleIsOpen(currentEntry)) {
        decryptAndShowCapsule(currentEntry);
      }
      if (currentEntry.type === 'decay') {
        showDecayedBody(currentEntry);
      }
    });
  }
}

function bindTypeTabs() {
  const tabs = document.querySelectorAll('.type-tab');

  for (let i = 0; i < tabs.length; i++) {
    const btn = tabs[i];
    btn.addEventListener('click', function () {
      currentType = btn.dataset.type;

      // Keep whatever has been typed so far when switching tabs.
      const titleEl = document.getElementById('write-title');
      const bodyEl = document.getElementById('write-body');
      const title = titleEl ? titleEl.value : '';
      const body = bodyEl ? bodyEl.innerHTML : '';

      // Copy rather than edit in place, so a saved entry being edited is not
      // changed until the user actually saves.
      const kept = shallowCopy(currentEntry || {});
      kept.title = title;
      kept.body = body;
      currentEntry = kept;

      render();
      showView('write');
      document.getElementById('write-title').value = title;
    });
  }
}

function bindWriteEditor() {
  const writeBody = document.getElementById('write-body');
  if (!writeBody) {
    return;
  }

  // Put back whatever was written before the last re-render.
  writeBody.innerHTML = currentEntry ? (currentEntry.body || '') : '';

  writeBody.addEventListener('input', function () {
    const wv = document.getElementById('write-view');
    if (wv) {
      wv.classList.toggle('typing', writeBody.textContent.trim().length > 0);
    }
    handleSlashInput(writeBody);
  });

  writeBody.addEventListener('keydown', handleSlashKeydown);

  // Honesty Constraint: pasting would let you filter or pre-edit a thought
  // before it ever reaches the page, so only typing is accepted.
  writeBody.addEventListener('paste', function (e) {
    e.preventDefault();
  });

  writeBody.addEventListener('drop', function (e) {
    if (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes('text/plain')) {
      e.preventDefault();
    }
  });
}

function bindAttachInputs() {
  const attachBtn = document.getElementById('attach-btn');
  const attachInput = document.getElementById('attach-input');

  if (attachBtn && attachInput) {
    attachBtn.addEventListener('click', function () {
      attachInput.click();
    });
    attachInput.addEventListener('change', function () {
      addFiles(attachInput.files);
      attachInput.value = '';
    });
  }

  // Dragging files onto the writing area attaches them too.
  const writeInner = document.querySelector('.write-inner');
  if (!writeInner) {
    return;
  }

  writeInner.addEventListener('dragover', function (e) {
    e.preventDefault();
    writeInner.classList.add('drag-over');
  });

  writeInner.addEventListener('dragleave', function (e) {
    if (e.target === writeInner) {
      writeInner.classList.remove('drag-over');
    }
  });

  writeInner.addEventListener('drop', function (e) {
    e.preventDefault();
    writeInner.classList.remove('drag-over');
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
      addFiles(e.dataTransfer.files);
    }
  });
}

// Makes a copy of an object one level deep. Used instead of the spread
// operator so the code stays plain.
function shallowCopy(obj) {
  const copy = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      copy[key] = obj[key];
    }
  }
  return copy;
}

// --- Slash command editor (Notion-style blocks) ----------------------------
// Typing "/" in the editor opens this menu of block types.
const SLASH_BLOCKS = [
  { key: 'h1', label: 'Heading 1', hint: 'Large heading', icon: 'H1',
    run: function () { format('formatBlock', 'H1'); } },
  { key: 'h2', label: 'Heading 2', hint: 'Medium heading', icon: 'H2',
    run: function () { format('formatBlock', 'H2'); } },
  { key: 'h3', label: 'Heading 3', hint: 'Small heading', icon: 'H3',
    run: function () { format('formatBlock', 'H3'); } },
  { key: 'text', label: 'Text', hint: 'Plain paragraph', icon: '&#182;',
    run: function () { format('formatBlock', 'P'); } },
  { key: 'quote', label: 'Quote', hint: 'Capture a quote', icon: '&#8220;',
    run: function () { format('formatBlock', 'BLOCKQUOTE'); } },
  { key: 'bullet', label: 'Bulleted list', hint: 'Unordered list', icon: '&bull;',
    run: function () { format('insertUnorderedList'); } },
  { key: 'number', label: 'Numbered list', hint: 'Ordered list', icon: '1.',
    run: function () { format('insertOrderedList'); } },
  { key: 'divider', label: 'Divider', hint: 'Visual separator', icon: '&mdash;',
    run: function () { format('insertHorizontalRule'); } },
  { key: 'link', label: 'Link', hint: 'Insert a hyperlink', icon: '&#128279;',
    run: insertLink }
];

function format(cmd, arg) {
  document.execCommand(cmd, false, arg);
}

function insertLink() {
  const url = prompt('Link URL:');
  if (!url) {
    return;
  }

  const sel = window.getSelection();
  if (sel && sel.toString()) {
    // Some text is highlighted, so turn that into the link.
    document.execCommand('createLink', false, url);
  } else {
    // Nothing highlighted, so drop the URL in as its own link.
    const html = `<a href="${escAttr(url)}" target="_blank" rel="noopener">${escHtml(url)}</a>&nbsp;`;
    document.execCommand('insertHTML', false, html);
  }
}

// Reads the "/query" the caret is sitting just after, if there is one.
function caretLineQuery() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) {
    return null;
  }

  const range = sel.getRangeAt(0);
  const node = range.endContainer;
  if (node.nodeType !== Node.TEXT_NODE) {
    return null;
  }

  const textBefore = node.textContent.slice(0, range.endOffset);
  const match = textBefore.match(/\/([a-zA-Z0-9]*)$/);
  if (!match) {
    return null;
  }

  return { query: match[1], len: match[0].length };
}

function handleSlashInput(editor) {
  const info = caretLineQuery();
  if (!info) {
    hideSlashMenu();
    return;
  }

  // Keep only the blocks whose key or label contains what was typed.
  const q = info.query.toLowerCase();
  slashFiltered = [];
  for (let i = 0; i < SLASH_BLOCKS.length; i++) {
    const block = SLASH_BLOCKS[i];
    if (block.key.includes(q) || block.label.toLowerCase().includes(q)) {
      slashFiltered.push(block);
    }
  }

  if (slashFiltered.length === 0) {
    hideSlashMenu();
    return;
  }

  slashMatchLen = info.len;
  slashIndex = 0;
  showSlashMenu();
}

function showSlashMenu() {
  const menu = document.getElementById('slash-menu');
  if (!menu) {
    return;
  }

  slashActive = true;

  let html = '';
  for (let i = 0; i < slashFiltered.length; i++) {
    const b = slashFiltered[i];
    const activeClass = i === slashIndex ? 'active' : '';
    html += `
    <div class="slash-item ${activeClass}" data-i="${i}">
      <span class="slash-icon">${b.icon}</span>
      <span class="slash-text"><span class="slash-label">${b.label}</span><span class="slash-hint">${b.hint}</span></span>
    </div>`;
  }
  menu.innerHTML = html;

  // Put the menu just under the caret, but keep it on screen.
  const sel = window.getSelection();
  if (sel && sel.rangeCount) {
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const top = (rect.bottom || rect.top) + 6;
    menu.style.top = Math.min(top, window.innerHeight - 320) + 'px';
    menu.style.left = Math.min(rect.left, window.innerWidth - 260) + 'px';
  }

  menu.classList.add('open');

  const items = menu.querySelectorAll('.slash-item');
  for (let i = 0; i < items.length; i++) {
    const el = items[i];
    el.addEventListener('mousedown', function (e) {
      // mousedown, not click, so the editor does not lose the caret first.
      e.preventDefault();
      slashIndex = parseInt(el.dataset.i);
      applySlash();
    });
  }
}

function hideSlashMenu() {
  slashActive = false;
  const menu = document.getElementById('slash-menu');
  if (menu) {
    menu.classList.remove('open');
  }
}

function applySlash() {
  const block = slashFiltered[slashIndex];
  if (!block) {
    hideSlashMenu();
    return;
  }

  // Remove the "/query" the user typed before running the block command.
  const sel = window.getSelection();
  if (sel && sel.rangeCount && slashMatchLen > 0) {
    const range = sel.getRangeAt(0);
    try {
      range.setStart(range.endContainer, range.endOffset - slashMatchLen);
      range.deleteContents();
    } catch (err) {
      // The caret moved somewhere unexpected. Leave the text alone.
    }
  }

  hideSlashMenu();
  block.run();
}

function handleSlashKeydown(e) {
  if (!slashActive) {
    return;
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    slashIndex = slashIndex + 1;
    if (slashIndex >= slashFiltered.length) {
      slashIndex = 0;
    }
    showSlashMenu();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    slashIndex = slashIndex - 1;
    if (slashIndex < 0) {
      slashIndex = slashFiltered.length - 1;
    }
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

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) {
      overlay.classList.remove('open');
    }
  });

  const prev = document.getElementById('dp-prev');
  if (prev) {
    prev.addEventListener('click', function () {
      dpMonth = dpMonth - 1;
      if (dpMonth < 0) {
        dpMonth = 11;
        dpYear = dpYear - 1;
      }
      document.getElementById('dp-popup').innerHTML = renderDatePicker();
      bindDPEvents();
    });
  }

  const next = document.getElementById('dp-next');
  if (next) {
    next.addEventListener('click', function () {
      dpMonth = dpMonth + 1;
      if (dpMonth > 11) {
        dpMonth = 0;
        dpYear = dpYear + 1;
      }
      document.getElementById('dp-popup').innerHTML = renderDatePicker();
      bindDPEvents();
    });
  }

  const cells = document.querySelectorAll('.dp-day:not(.past):not(.empty)');
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    cell.addEventListener('click', function () {
      // 23:59:59 so a capsule unlocks at the end of the chosen day.
      dpSelected = new Date(
        parseInt(cell.dataset.year),
        parseInt(cell.dataset.month),
        parseInt(cell.dataset.day),
        23, 59, 59
      );

      const input = document.getElementById('capsule-date');
      if (input) {
        input.value = formatDateInput(dpSelected.getTime());
      }

      overlay.classList.remove('open');
      document.getElementById('dp-popup').innerHTML = renderDatePicker();
    });
  }
}

// --- View transitions ------------------------------------------------------
function showView(name) {
  currentView = name;

  const views = document.querySelectorAll('.view');
  for (let i = 0; i < views.length; i++) {
    views[i].classList.remove('active');
  }

  const el = document.getElementById(name + '-view');
  if (el) {
    // Wait one frame so the browser notices the class change and animates it.
    requestAnimationFrame(function () {
      el.classList.add('active');
    });
  }
}

// --- Now playing -----------------------------------------------------------

// Milliseconds as M:SS, the way a music player writes them.
function formatTrackTime(ms) {
  if (!ms || ms < 0) {
    ms = 0;
  }
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes + ':' + padTwo(seconds);
}

// Spotify is only asked every few seconds, so carry the position forward using
// the clock in between. That is what makes the bar move smoothly rather than
// jumping once per poll.
function currentProgressMs() {
  if (!nowPlaying) {
    return 0;
  }

  let progress = nowPlaying.progressMs || 0;
  if (nowPlaying.isPlaying) {
    progress = progress + (Date.now() - nowPlaying.fetchedAt);
  }

  if (nowPlaying.durationMs && progress > nowPlaying.durationMs) {
    progress = nowPlaying.durationMs;
  }
  return progress;
}

function renderNowPlaying() {
  if (!nowPlaying) {
    return '';
  }

  let art = '<div class="np-art np-art-empty">&#9835;</div>';
  if (nowPlaying.albumArt) {
    art = '<img class="np-art" src="' + escAttr(nowPlaying.albumArt) + '" alt="">';
  }

  const pausedClass = nowPlaying.isPlaying ? '' : ' np-paused';

  return art +
    '<div class="np-body">' +
      '<div class="np-track">' + escHtml(nowPlaying.trackName || '') + '</div>' +
      '<div class="np-artist">' + escHtml(nowPlaying.artistName || '') + '</div>' +
      '<div class="np-bar' + pausedClass + '"><div class="np-fill" id="np-fill"></div></div>' +
      '<div class="np-times">' +
        '<span id="np-elapsed">0:00</span>' +
        '<span>' + formatTrackTime(nowPlaying.durationMs) + '</span>' +
      '</div>' +
    '</div>';
}

// Moves only the bar and the elapsed time. Called several times a second, so it
// deliberately does not touch anything else.
function updateNowPlayingProgress() {
  const fill = document.getElementById('np-fill');
  const elapsed = document.getElementById('np-elapsed');
  if (!fill || !elapsed || !nowPlaying) {
    return;
  }

  const progress = currentProgressMs();
  let percent = 0;
  if (nowPlaying.durationMs > 0) {
    percent = (progress / nowPlaying.durationMs) * 100;
  }

  fill.style.width = percent.toFixed(2) + '%';
  elapsed.textContent = formatTrackTime(progress);
}

// Rebuilds the bar, but only when the track actually changed -- otherwise the
// artwork would flicker on every poll.
function refreshNowPlayingBar() {
  const bar = document.getElementById('now-playing-bar');
  if (!bar) {
    return;
  }

  const trackId = nowPlaying ? nowPlaying.trackId : null;

  if (trackId !== nowPlayingTrackId) {
    nowPlayingTrackId = trackId;
    bar.innerHTML = renderNowPlaying();
  }

  bar.className = nowPlaying ? 'visible' : '';
  updateNowPlayingProgress();
}

// --- Spotify ---------------------------------------------------------------
async function handleSpotifyConnect() {
  if (!hasClientId()) {
    return;
  }

  document.getElementById('spotify-modal').classList.remove('open');
  const authUrl = await startAuth();

  // In the desktop app the login opens in its own window and hands back a
  // code. In a plain browser we just navigate there instead.
  const isElectron = window.emberAPI && window.emberAPI.isElectron;
  if (!isElectron) {
    window.location.href = authUrl;
    return;
  }

  const code = await window.emberAPI.spotifyAuth(authUrl);
  if (!code) {
    return;
  }

  try {
    await exchangeCode(code);
    render();
  } catch (err) {
    console.error('Spotify auth failed:', err);
  }
}

// While writing, check every few seconds what is playing.
function startSpotifyPoll() {
  if (!isConnected()) {
    return;
  }
  stopSpotifyPoll();

  async function poll() {
    nowPlaying = await getNowPlaying();
    refreshNowPlayingBar();
  }

  poll();
  spotifyPollTimer = setInterval(poll, 5000);

  // Between polls the position is worked out from the clock, so the bar keeps
  // moving instead of stepping once every five seconds.
  spotifyTickTimer = setInterval(updateNowPlayingProgress, 250);
}

function stopSpotifyPoll() {
  if (spotifyPollTimer) {
    clearInterval(spotifyPollTimer);
    spotifyPollTimer = null;
  }
  if (spotifyTickTimer) {
    clearInterval(spotifyTickTimer);
    spotifyTickTimer = null;
  }
  nowPlayingTrackId = null;
}

// --- Seal ------------------------------------------------------------------
// Builds the entry from the write view, checks it with the validation engine,
// then saves it.
async function handleSeal() {
  const titleEl = document.getElementById('write-title');
  const editor = document.getElementById('write-body');

  const title = titleEl ? titleEl.value.trim() : '';
  const body = editor ? editor.innerHTML : '';
  const plainText = editor ? editor.textContent : '';

  // Nothing typed at all, so there is nothing to save.
  if (!title && plainText.trim().length === 0) {
    return;
  }

  // When editing, reuse the original entry's id and creation time.
  let original = null;
  if (editingId) {
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].id === editingId) {
        original = entries[i];
        break;
      }
    }
  }

  const id = editingId || generateId();
  const createdAt = original ? original.createdAt : Date.now();

  const entry = {
    id: id,
    createdAt: createdAt,
    title: title,
    type: currentType,
    rich: true
  };

  // Editing does not reset the revisit gate; it was already earned to get here.
  if (original && original.revisitedAt) {
    entry.revisitedAt = original.revisitedAt;
  }

  if (currentType === 'regular') {
    entry.body = body;
  }

  let capsulePass = null;
  if (currentType === 'capsule') {
    const dateEl = document.getElementById('capsule-date');
    const passEl = document.getElementById('capsule-pass');
    const dateInput = dateEl ? dateEl.value : '';
    const passInput = passEl ? passEl.value : '';

    // Prefer the date picker, then the typed date, then tomorrow.
    let unlockAt;
    if (dpSelected) {
      unlockAt = dpSelected.getTime();
    } else if (dateInput) {
      unlockAt = new Date(dateInput).getTime();
    } else {
      unlockAt = Date.now() + ONE_DAY_MS;
    }

    // With no passphrase typed, the unlock date itself is the key.
    const passphrase = passInput || formatDateInput(unlockAt);
    capsulePass = passphrase;

    const encrypted = await encrypt(body, passphrase);
    entry.capsule = { unlockAt: unlockAt, encrypted: encrypted };
  }

  if (currentType === 'decay') {
    const daysEl = document.getElementById('decay-days');
    const modeEl = document.getElementById('decay-mode');
    const tombEl = document.getElementById('decay-tombstone');

    const durationDays = (daysEl ? parseInt(daysEl.value) : NaN) || 30;
    const mode = (modeEl ? modeEl.value : '') || 'words';
    const tombstone = (tombEl ? tombEl.value : '') || '';

    entry.body = body;
    entry.decay = { durationDays: durationDays, mode: mode, tombstone: tombstone };
  }

  // Attachments are encrypted for capsules, and stored as plain blobs otherwise.
  if (pendingAttachments.length > 0) {
    entry.attachments = [];

    if (currentType === 'capsule') {
      entry.attachmentsEncrypted = true;
      for (let i = 0; i < pendingAttachments.length; i++) {
        const a = pendingAttachments[i];
        const bytes = new Uint8Array(await a.blob.arrayBuffer());
        const enc = await encryptBytes(bytes, capsulePass);
        entry.attachments.push({
          id: a.id, name: a.name, type: a.type, size: a.size, enc: enc
        });
      }
    } else {
      for (let i = 0; i < pendingAttachments.length; i++) {
        const a = pendingAttachments[i];
        entry.attachments.push({
          id: a.id, name: a.name, type: a.type, size: a.size, blob: a.blob
        });
      }
    }
  }

  // Remember the song that was playing, plus its mood values if we can get them.
  if (nowPlaying) {
    entry.spotify = shallowCopy(nowPlaying);
    try {
      const features = await getAudioFeatures(nowPlaying.trackId);
      if (features) {
        entry.spotify.energy = features.energy;
        entry.spotify.valence = features.valence;
      }
    } catch (err) {
      // Mood values are optional, so carry on without them.
    }
  } else if (original && original.spotify) {
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
  editingId = null;
  writeMode = 'new';
  showView('list');
  render();
}

function showSealErrors(errors) {
  const box = document.getElementById('write-errors');
  if (!box) {
    return;
  }

  let html = '';
  for (let i = 0; i < errors.length; i++) {
    html += '<div>' + escHtml(errors[i]) + '</div>';
  }
  box.innerHTML = html;
}

// --- Capsule decryption ----------------------------------------------------
async function decryptAndShowCapsule(entry) {
  // A short pause so the read view is on screen before we swap the body in.
  await new Promise(function (resolve) {
    setTimeout(resolve, 50);
  });

  const placeholder = document.getElementById('capsule-body-placeholder');
  if (!placeholder) {
    return;
  }

  try {
    const passphrase = formatDateInput(entry.capsule.unlockAt);
    const text = await decrypt(entry.capsule.encrypted, passphrase);

    if (entry.rich) {
      placeholder.outerHTML = '<div class="read-body rich">' + sanitizeHtml(text) + '</div>';
    } else {
      placeholder.outerHTML = '<div class="read-body">' + escHtml(text).replace(/\n/g, '<br>') + '</div>';
    }

    // Sealed attachments are decrypted the same way, one at a time.
    const slot = document.getElementById('read-attachments-slot');
    if (slot && entry.attachments && entry.attachments.length) {
      const decrypted = [];
      for (let i = 0; i < entry.attachments.length; i++) {
        const a = entry.attachments[i];
        const bytes = await decryptBytes(a.enc, passphrase);
        const item = shallowCopy(a);
        item.blob = new Blob([bytes], { type: a.type });
        decrypted.push(item);
      }
      slot.outerHTML = renderAttachmentsHTML(decrypted);
    }
  } catch (err) {
    placeholder.innerHTML = '<em style="color:var(--dec-color)">Could not decrypt &#8212; passphrase may differ.</em>';
  }
}

// --- Decay rendering (reflective-modules service) --------------------------
async function showDecayedBody(entry) {
  const placeholder = document.getElementById('decay-body-placeholder');
  if (!placeholder) {
    return;
  }

  try {
    const result = await renderDecayEntry(entry);

    if (!result.fullyDecayed) {
      placeholder.outerHTML = '<div class="read-body">' + result.html + '</div>';
      return;
    }

    placeholder.outerHTML = '<div class="read-body" style="color:var(--text-faint);font-style:italic">[This entry has fully decayed]</div>';

    if (result.tombstone) {
      const bodyEl = document.querySelector('#read-view .read-body');
      if (bodyEl) {
        bodyEl.insertAdjacentHTML('afterend',
          '<div class="decay-tombstone">' + escHtml(result.tombstone) + '</div>');
      }
    }
  } catch (err) {
    placeholder.innerHTML = '<em style="color:var(--dec-color)">Could not reach the reflective-modules service &#8212; try again shortly.</em>';
  }
}

// --- Helpers ---------------------------------------------------------------
function formatDate(ts) {
  return new Date(ts).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

// Formats a timestamp as "YYYY-MM-DD". This doubles as the capsule passphrase.
function formatDateInput(ts) {
  const d = new Date(ts);
  const year = d.getFullYear();
  const month = padTwo(d.getMonth() + 1);
  const day = padTwo(d.getDate());
  return year + '-' + month + '-' + day;
}

function padTwo(n) {
  if (n < 10) {
    return '0' + n;
  }
  return String(n);
}

// Makes text safe to drop into HTML.
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Makes text safe to put inside an HTML attribute.
function escAttr(s) {
  return String(s)
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Tags that are allowed to survive in a rich entry. Anything else is unwrapped.
const ALLOWED_TAGS = ['P', 'BR', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'UL', 'OL',
                      'LI', 'HR', 'A', 'B', 'STRONG', 'I', 'EM', 'U', 'DIV', 'SPAN'];

function isAllowedTag(tagName) {
  return ALLOWED_TAGS.indexOf(tagName) !== -1;
}

// Removes an element but keeps its children where it was.
function unwrapElement(element) {
  const parent = element.parentNode;
  if (!parent) {
    return;
  }
  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }
  parent.removeChild(element);
}

// A light cleaner for rich entry HTML: drops unknown tags, event handlers,
// inline styles and javascript: links before the entry is displayed.
function sanitizeHtml(html) {
  const holder = document.createElement('div');
  holder.innerHTML = html;
  cleanChildren(holder);
  return holder.innerHTML;
}

function cleanChildren(node) {
  // Copy the list first, because the loop changes the real one as it goes.
  const children = [];
  for (let i = 0; i < node.childNodes.length; i++) {
    children.push(node.childNodes[i]);
  }

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.nodeType !== Node.ELEMENT_NODE) {
      continue;
    }

    if (!isAllowedTag(child.tagName)) {
      // Clean the inside first, then lift the children out. The order matters:
      // once the wrapper is gone its children are no longer in this loop's
      // copied list, so anything dangerous inside would never be checked.
      cleanChildren(child);
      unwrapElement(child);
      continue;
    }

    // Copy the attribute list too, for the same reason.
    const attrs = [];
    for (let j = 0; j < child.attributes.length; j++) {
      attrs.push(child.attributes[j]);
    }

    for (let j = 0; j < attrs.length; j++) {
      const name = attrs[j].name.toLowerCase();
      const value = attrs[j].value.toLowerCase();
      const isEventHandler = name.startsWith('on');
      const isScriptLink = name === 'href' && value.startsWith('javascript:');
      if (isEventHandler || isScriptLink || name === 'style') {
        child.removeAttribute(attrs[j].name);
      }
    }

    // Links always open in a new tab, and never get access to this page.
    if (child.tagName === 'A') {
      child.setAttribute('target', '_blank');
      child.setAttribute('rel', 'noopener');
    }

    cleanChildren(child);
  }
}

// Turns rich HTML into plain text for previews.
function stripTags(html) {
  const holder = document.createElement('div');
  holder.innerHTML = html;
  const text = holder.textContent || '';
  return text.replace(/\s+/g, ' ').trim();
}

// --- Boot ------------------------------------------------------------------
function renderServiceError(status) {
  const missing = [];
  if (!status.validation) {
    missing.push('the validation engine (C#, http://127.0.0.1:8901)');
  }
  if (!status.reflective) {
    missing.push('the reflective-modules service (Python, http://127.0.0.1:8902)');
  }

  document.getElementById('app').innerHTML = `
    <div class="empty-state" style="height:100vh;">
      <div class="big-spark" style="color:var(--dec-color);animation:none;">&#10022;</div>
      <p>Ember can't reach ${missing.join(' and ')}.</p>
      <small>Run <span style="font-family:monospace">npm run services</span> (or <span style="font-family:monospace">npm run dev</span>, which starts them too), then reload.</small>
    </div>`;
}

// After a browser sign-in, Spotify sends the page back with ?code=... in the
// address. Trade that code for tokens, then take it back out of the address so
// a refresh does not try to reuse a code that has already been spent.
async function finishSpotifySignIn() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const failed = params.get('error');

  if (!code && !failed) {
    return;
  }

  if (code) {
    try {
      await exchangeCode(code);
    } catch (err) {
      console.error('Spotify sign-in could not be completed:', err);
    }
  }

  window.history.replaceState({}, '', window.location.pathname);
}

async function boot() {
  // Both local services have to be up before anything is shown.
  const status = await checkServices();
  if (!status.ok) {
    renderServiceError(status);
    return;
  }

  await finishSpotifySignIn();

  entries = await loadEntries();
  await refreshDecayStatus();
  initDP();
  render();

  requestAnimationFrame(function () {
    const el = document.getElementById('list-view');
    if (el) {
      el.classList.add('active');
    }
  });
}

boot();
