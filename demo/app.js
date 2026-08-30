// ember demo - a local-first emotional computing system.
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

// Everything here runs in the browser. There is no server and no network
// request. The decay rules match services/reflective-modules/decay.py and the
// time-lock rule matches services/reflective-modules/validation.py.

// --- Sample entry ----------------------------------------------------------

const SAMPLE_BODY =
  'I did not sleep again. I keep replaying the same thirty seconds of a ' +
  'conversation from a week ago, looking for the moment it turned, and I ' +
  'cannot find it. Maybe there was no moment. Maybe it was always going to ' +
  'end there and I just kept talking.';

const TOMBSTONE = 'it mattered at the time.';
const TOTAL_DAYS = 30;

// --- Decay rules (a port of decay.py) --------------------------------------

// How far through its life an entry is, from 0 (new) to 1 (fully decayed).
function getProgress(daysElapsed, durationDays) {
  if (durationDays <= 0) {
    return 1;
  }
  const progress = daysElapsed / durationDays;
  if (progress > 1) {
    return 1;
  }
  return progress;
}

function escHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isSpace(piece) {
  if (!piece) {
    return false;
  }
  return /^\s+$/.test(piece);
}

// "words" mode: blank out words from the end, working backwards.
function renderWordsMode(body, progress) {
  // Splitting on a capturing group keeps the spaces, so the text can be put
  // back together exactly as it was.
  const pieces = body.split(/(\s+)/);

  let wordCount = 0;
  for (let i = 0; i < pieces.length; i++) {
    if (!isSpace(pieces[i])) {
      wordCount++;
    }
  }

  // Everything from this word onwards gets blanked out.
  const redactCount = Math.floor(progress * wordCount);
  const redactFrom = wordCount - redactCount;

  let html = '';
  let wordIndex = 0;

  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];

    if (isSpace(piece)) {
      html += piece;
      continue;
    }

    if (wordIndex >= redactFrom) {
      let blocks = '';
      for (let j = 0; j < piece.length; j++) {
        blocks += '█';
      }
      html += '<span class="decay-redacted">' + blocks + '</span>';
    } else {
      html += escHtml(piece);
    }

    wordIndex++;
  }

  return html;
}

// "burn" mode: keep every word, but fade the whole entry out.
function renderBurnMode(body, progress) {
  const opacity = 1 - progress * 0.85;
  return '<span style="opacity:' + opacity.toFixed(3) + '">' + escHtml(body) + '</span>';
}

function renderDecay(body, daysElapsed, durationDays, mode) {
  const progress = getProgress(daysElapsed, durationDays);

  if (progress >= 1) {
    return '<span style="color:var(--text-faint);font-style:italic">' +
           '[This entry has fully decayed]</span>' +
           '<div class="tombstone">' + escHtml(TOMBSTONE) + '</div>';
  }

  if (mode === 'burn') {
    return renderBurnMode(body, progress);
  }
  return renderWordsMode(body, progress);
}

// --- 01: Emotional decay ---------------------------------------------------

function setupDecay() {
  const output = document.getElementById('decay-output');
  const slider = document.getElementById('decay-slider');
  const label = document.getElementById('decay-days-label');
  const modeButtons = document.querySelectorAll('.seg-btn');

  let mode = 'words';

  function update() {
    const days = parseInt(slider.value);

    if (days === 1) {
      label.textContent = '1 day';
    } else {
      label.textContent = days + ' days';
    }

    output.innerHTML = renderDecay(SAMPLE_BODY, days, TOTAL_DAYS, mode);
  }

  slider.addEventListener('input', update);

  for (let i = 0; i < modeButtons.length; i++) {
    const btn = modeButtons[i];
    btn.addEventListener('click', function () {
      mode = btn.dataset.mode;
      for (let j = 0; j < modeButtons.length; j++) {
        modeButtons[j].classList.remove('active');
      }
      btn.classList.add('active');
      update();
    });
  }

  update();
}

// --- 02: Time-lock revisitation --------------------------------------------

// The rule, from validation.py: an entry only unlocks once it has been
// revisited on a separate, later visit. Visit 1 records the revisit but stays
// locked, because at that moment there was no *prior* revisit.
function setupTimeLock() {
  const deleteBtn = document.getElementById('lock-delete');
  const editBtn = document.getElementById('lock-edit');
  const visitBtn = document.getElementById('lock-visit');
  const resetBtn = document.getElementById('lock-reset');
  const explain = document.getElementById('lock-explain');
  const steps = document.querySelectorAll('.step');

  const EXPLANATIONS = [
    'Just written. Edit and delete are locked — you cannot write something ' +
    'raw and erase it in the same sitting.',

    'You have opened it once. That visit is now recorded, but it is still ' +
    'locked: the revisit that unlocks an entry has to be a later, separate one.',

    'Revisited on a separate visit. Edit and delete are now unlocked — you ' +
    'have actually sat with this entry twice.'
  ];

  let visits = 0;

  function update() {
    const unlocked = visits >= 2;

    deleteBtn.disabled = !unlocked;
    editBtn.disabled = !unlocked;
    visitBtn.disabled = unlocked;

    explain.textContent = EXPLANATIONS[visits];
    explain.classList.toggle('unlocked', unlocked);

    for (let i = 0; i < steps.length; i++) {
      const stepIndex = parseInt(steps[i].dataset.step);
      steps[i].classList.toggle('done', stepIndex <= visits);
    }

    if (unlocked) {
      visitBtn.textContent = 'unlocked';
    } else {
      visitBtn.textContent = 'close & come back later';
    }
  }

  visitBtn.addEventListener('click', function () {
    if (visits < 2) {
      visits++;
      update();
    }
  });

  resetBtn.addEventListener('click', function () {
    visits = 0;
    update();
  });

  deleteBtn.addEventListener('click', function () {
    explain.textContent = 'Deleted. In the real app the entry would now be ' +
      'gone from your device for good.';
    explain.classList.add('unlocked');
    deleteBtn.disabled = true;
    editBtn.disabled = true;
  });

  editBtn.addEventListener('click', function () {
    explain.textContent = 'The editor would open here, with the original text ' +
      'ready to change.';
    explain.classList.add('unlocked');
  });

  update();
}

// --- 03: Honesty constraints -----------------------------------------------

function setupHonesty() {
  const editor = document.getElementById('honesty-editor');
  const counter = document.getElementById('blocked-count');

  let blocked = 0;

  function reject() {
    blocked++;

    if (blocked === 1) {
      counter.textContent = '1 paste attempt blocked';
    } else {
      counter.textContent = blocked + ' paste attempts blocked';
    }

    counter.classList.add('flash');
    editor.classList.add('rejected');

    setTimeout(function () {
      counter.classList.remove('flash');
      editor.classList.remove('rejected');
    }, 500);
  }

  editor.addEventListener('paste', function (e) {
    e.preventDefault();
    reject();
  });

  editor.addEventListener('drop', function (e) {
    if (e.dataTransfer && e.dataTransfer.types &&
        e.dataTransfer.types.includes('text/plain')) {
      e.preventDefault();
      reject();
    }
  });
}

// --- Ember particles -------------------------------------------------------

const EMBER_COLORS = ['#f05218', '#ff8c42', '#ffb347', '#e88020', '#ff6b35'];
const EMBER_COUNT = 28;

function resetParticle(p, startAnywhere) {
  p.x = Math.random() * window.innerWidth;
  p.size = 1 + Math.random() * 2.5;
  p.speedY = 0.25 + Math.random() * 0.5;
  p.driftX = (Math.random() - 0.5) * 0.4;
  p.color = EMBER_COLORS[Math.floor(Math.random() * EMBER_COLORS.length)];
  p.maxLife = 200 + Math.random() * 160;

  if (startAnywhere) {
    p.y = Math.random() * window.innerHeight;
    p.life = Math.random() * p.maxLife;
  } else {
    p.y = window.innerHeight + Math.random() * 50;
    p.life = 0;
  }

  return p;
}

function setupEmbers() {
  const canvas = document.getElementById('embers');
  if (!canvas) {
    return;
  }

  // Respect a reduced-motion preference: draw nothing at all.
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduced.matches) {
    return;
  }

  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const particles = [];
  for (let i = 0; i < EMBER_COUNT; i++) {
    particles.push(resetParticle({}, true));
  }

  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      p.life++;
      p.y -= p.speedY;
      p.x += p.driftX;

      if (p.life >= p.maxLife || p.y < -20) {
        resetParticle(p, false);
      }

      // Fade in at the start of life and out towards the end.
      const stage = p.life / p.maxLife;
      let alpha;
      if (stage < 0.2) {
        alpha = stage / 0.2;
      } else if (stage > 0.7) {
        alpha = (1 - stage) / 0.3;
      } else {
        alpha = 1;
      }
      alpha = alpha * 0.4;

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

    requestAnimationFrame(tick);
  }

  tick();
}

// --- Start -----------------------------------------------------------------

setupDecay();
setupTimeLock();
setupHonesty();
setupEmbers();
