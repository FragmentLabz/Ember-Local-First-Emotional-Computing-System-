# ✦ Ember — The World's First Local-First Emotional Computing System

> **100% Local-First • GNU AGPLv3 Free Software**

![Views](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/Jeremy-1011/Ember--A-Local-First-Emotional-Computing-System-/main/traffic-data/badge.json)

Ember is the category-defining implementation of **Emotional Computing Systems** — a new
class of cognitive software built on computational emotional mechanics.

Entries exist on a glowing timeline: newest ones burn bright, older ones cool to ash.
Some are sealed until a future date. Others are written to disappear. Everything stays
on your device. No accounts. No cloud. No tracking.

---

## What Makes Ember Unique

Ember introduces three emotional mechanics that have not existed previously in software
engineering:

- **Emotional Decay** — Emotional intensity reduces over time, encouraging raw
  expression without fear of digital permanency.
- **Time-Lock Revisitation** — Emotional entries cannot be deleted or edited until
  revisited, confronting avoidance and anchoring emotional memory.
- **Honesty Constraints** — Prevents self-editing and filtering during emotional
  expression, reducing cognitive distortion.

These mechanics form the foundation of Emotional Computing Systems, a category created
and formally defined through Ember's architecture and whitepaper.

---

## Local-First, Zero-Knowledge Architecture

Ember processes all emotional data entirely offline.

- **No Cloud Execution:** No external servers, no synchronization.
- **No Tracking:** No telemetry, analytics, or behavioural logging.
- **Free Software Guarantee:** Licensed under GNU AGPLv3 to ensure long-term user
  autonomy and data sovereignty.

Your emotional state never leaves your device.

### How that is enforced

- All data lives in browser IndexedDB — nothing leaves your machine
- Time-Lock encryption: AES-GCM 256-bit with PBKDF2 (200,000 iterations, SHA-256)
- The passphrase is derived from the unlock date and is never stored
- Spotify is entirely optional and uses PKCE OAuth (no client secret)

---

## Entry Mechanics

### 🕯 Three entry types

| Type | Mechanic | Description |
|------|----------|-------------|
| **Regular** | — | Rich text entry, lives forever |
| **Time Capsule** | Time-Lock Revisitation | AES-256 encrypted and sealed until a date you choose — completely unreadable until then |
| **Decaying** | Emotional Decay | Fades word-by-word or burns down in opacity over days or weeks, leaving only a tombstone |

### ✍ Rich text input interface
Type `/` on any line to open the block menu — pick a heading, quote, list, divider, or
link without leaving the keyboard.

### 📎 File attachments
Drag-and-drop images, PDFs, or any file onto an entry. Images render inline; PDFs open
in-browser. Attachments inside Time Capsules are encrypted alongside the text.

### 🎵 Spotify integration
Connect your Spotify account to save the track playing while you write. The song is
stored permanently with the entry, and its audio energy/mood subtly tints the card
colour on the timeline.

---

## Category King

Ember is the first implementation of Emotional Computing Systems and the reference
architecture for this new field. It defines the terminology, mechanics, and
computational model that future systems will follow. Ember's emotional mechanics,
validation loops, and local-first design establish the foundational structure for this
new category of cognitive software.

## Whitepaper

The full technical framework is documented in the whitepaper:

> *"Emotional Computing Systems: A Technical Framework for Computational Emotional
> Mechanics."*

---

## Tech Stack

### Architectural model

| Layer | Role |
|-------|------|
| **Frontend Layer** | Electron + JavaScript — emotional input interface and decay visualisation |
| **Validation Engine** | Emotional state validation, honesty constraints, and time-lock enforcement |
| **Reflective Modules** | Non-interpretive reflective processing and revisitation tooling |
| **Storage Model** | 100% local-first, encrypted storage |

### Current implementation

| Layer | Technology |
|-------|-----------|
| UI | Vanilla JavaScript (no framework) |
| Bundler | Vite 5 |
| Desktop | Electron 29 |
| Validation & decay | JavaScript (`src/decay.js`) |
| Storage | IndexedDB (local, no server) |
| Encryption | Web Crypto API — AES-GCM 256-bit, PBKDF2 200k iterations |
| Fonts | Cormorant Garamond · Lora · Kalam (Google Fonts) |

> The validation engine (C#) and reflective modules (Python) described in the
> architectural model are planned as separate processes; today both roles are served
> in-process by the JavaScript layer.

---

## Getting started

### Browser (recommended — no Electron install needed)

```bash
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

### Desktop app (Electron)

```bash
npm install
npm run electron
```

> **Windows:** If Electron's binary fails to download, use `npm run dev` instead — the
> browser version is fully featured.

---

## Spotify setup (optional)

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) and create an app
2. Add `http://127.0.0.1:8888/callback` as a **Redirect URI**
3. Copy your **Client ID**
4. In Ember, click **♫** in the top-right and enter your Client ID

---

## Project structure

```
├── src/
│   ├── app.js        # Main UI — views, editor, event binding
│   ├── crypto.js     # AES-GCM encrypt/decrypt (text + binary)
│   ├── storage.js    # IndexedDB persistence
│   ├── decay.js      # Emotional decay progress & rendering
│   ├── spotify.js    # Spotify PKCE OAuth + now-playing API
│   └── style.css     # Coal & Fire design system
├── electron/
│   ├── main.cjs      # Electron main process + Spotify OAuth window
│   └── preload.cjs   # Context bridge (contextIsolation)
├── index.html
├── vite.config.js
└── package.json
```

---

## Vision

Ember establishes the foundation for a new generation of privacy-first emotional tools
built on structured emotional computation. It demonstrates how emotional processes can
be modelled through deterministic mechanics rather than interpretation, forming the
basis of a new category in cognitive software.

---

## Author

**Jeremiah Ayeni** — [github.com/Jeremy-1011](https://github.com/Jeremy-1011)

Authorship is also recorded in the header of every source file, and shown in the
app's own **About** panel (the `i` button in the top-right of the window).

## License

**GNU Affero General Public License v3.0 or later** — Copyright © 2026 Jeremiah Ayeni.
See [LICENSE](LICENSE) for the full text.

In short, you are free to use, study, modify and redistribute Ember, including
commercially, on these conditions:

- **Keep it open.** Any copy or modified version you distribute must also be
  released under the AGPL, with source available. You cannot take this code
  closed-source.
- **Network use counts as distribution.** If you run a modified Ember as a
  hosted service, you must offer its users the corresponding source code
  (AGPL §13). This is the clause the MIT licence lacked.
- **Keep the notices.** The copyright and licence notices must be retained.

The AGPL permits charging money for the software. What it does not permit is
distributing it — or hosting it — without passing the same freedoms on.

### Note on earlier versions

Ember was released under the MIT licence up to and including commit
[`051eb92`](https://github.com/Jeremy-1011/Journal-App-Ember/commit/051eb92).
That grant is irrevocable for those versions: anyone who obtained the code
under MIT keeps MIT rights to *that* code. The AGPL applies from this commit
onwards. Relicensing was possible because all contributions to date are the
work of a single copyright holder.
