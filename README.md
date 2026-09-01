# ✦ Ember — A Local-First Emotional Computing System

> **100% Local-First • GNU AGPLv3 Free Software**

![Views](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/Jeremy-1011/Ember--A-Local-First-Emotional-Computing-System-/main/traffic-data/badge.json)

Ember is an implementation of **Emotional Computing Systems** — a class of
cognitive software built on computational emotional mechanics.

Entries exist on a glowing timeline: newest ones burn bright, older ones cool to ash.
Some are sealed until a future date. Others are written to disappear. Everything stays
on your device. No accounts. No cloud. No tracking.

> ⭐ **If Ember resonates with you, please star the repository.** Stars are how
> people find work like this, and it is the one thing that helps most.

<p align="center">
  <img src="docs/demo.gif" alt="Writing an entry in Ember: typing into the editor with paste disabled, the slash-command block menu, and switching between regular, time capsule and decaying entry types." width="820">
</p>

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

These mechanics form the foundation of Emotional Computing System, a category created
and formally defined through Ember's architecture and whitepaper.

---

## Local-First, Zero-Knowledge Architecture

Ember processes all emotional data entirely offline.

- **No Cloud Execution:** No external servers, no synchronization.
- **No Tracking:** No telemetry, analytics, or behavioural logging.
- **Free Software Guarantee:** Licensed under GNU AGPLv3 to ensure long-term user
  autonomy and data sovereignty.

Your emotional state never leaves your device.

> These guarantees describe Ember as you run it yourself — the desktop app, or
> the dev server on your own machine. The [live demo](#live-demo) is a separate
> static page: it keeps these properties (it has no backend at all), but it
> only shows the mechanics, it is not the full application.

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

## Reference Architecture

Ember implements Emotional Computing Systems as working software rather than
describing them in the abstract. The terminology, the mechanics and the computational
model are all defined by the code: the emotional mechanics, the validation loops and
the local-first design are specified concretely enough to be reimplemented or built
on.

## Whitepaper

The full technical framework is documented in the whitepaper:

> *"Emotional Computing System: A Technical Framework for Computational Emotional
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
| Validation engine | C# / ASP.NET Core (`services/validation-engine`) |
| Reflective modules | Python / FastAPI (`services/reflective-modules`) |
| Storage | IndexedDB (local, no server) |
| Encryption | Web Crypto API — AES-GCM 256-bit, PBKDF2 200k iterations |
| Fonts | Cormorant Garamond · Lora · Kalam (Google Fonts) |

The validation engine and reflective modules described in the architectural
model are real, separate local processes — both bound to `127.0.0.1` only,
never reachable from outside the machine, and required for the app to run
(there is no in-process JS fallback):

- **Validation engine (C#)**, `http://127.0.0.1:8901` — validates a draft
  entry's capsule/decay settings before it's saved, and enforces the
  Time-Lock Revisitation gate (whether an entry may currently be edited or
  deleted).
- **Reflective modules (Python)**, `http://127.0.0.1:8902` — computes
  Emotional Decay: how far an entry has decayed, and the redacted or
  fading text shown for it.

Honesty Constraints (disabling paste while writing) stay enforced in the
frontend — there's no way for a backend to tell, after the fact, whether
text was typed or pasted.

### Running the local services

Prerequisites: **.NET SDK 10+** and **Python 3.11+**, in addition to Node.

```bash
npm install
pip install -r services/reflective-modules/requirements.txt
npm run services   # starts both local services on their own
```

The desktop app starts the services itself, so `npm run electron` is all you
need there. `npm run dev` (the browser version) has no Electron to do that, so
it starts them alongside Vite.

If either service isn't running, Ember shows an error screen naming which
one it can't reach rather than starting in a degraded state.

> These prerequisites are for **running from a checkout**. Installed builds
> carry both services inside them — see [Building installers](#building-installers)
> — so end users need nothing but the app.

### Live demo

**<https://emberdemo-1.vercel.app/>**

An interactive page showing the three mechanics — drag a slider to watch an
entry decay, step through the time lock, and try to paste into the editor. It
runs entirely in the browser: no services behind it, and nothing typed on the
page is sent anywhere. Source in [`demo/`](demo/).

---

## Building installers

An installed Ember bundles both services, so nobody needs .NET or Python to
run it. Those toolchains are needed only on the machine doing the build.

```bash
npm install
pip install pyinstaller
npm run dist          # builds the app, both services, and an installer
```

`npm run dist` runs three steps in order:

| Step | What it produces |
|---|---|
| `vite build` | the frontend, into `dist/` |
| `npm run build:services` | both services as standalone binaries, into `build/services/` |
| `electron-builder` | the installer, into `release/` |

The service binaries are copied into the packaged app's
`resources/services/`, which is where `electron/services.cjs` looks for them.
On launch it starts both, waits for each to answer `/health`, and stops them
again when the app quits. If a service will not start, Ember shows a window
naming it rather than an empty screen.

Running from a checkout, those binaries do not exist, so the same code falls
back to running the services from source — which is why the prerequisites
above still apply for development.

Targets are AppImage on Linux, dmg on macOS and NSIS on Windows. Each has to be
built on its own platform, because the bundled services are native executables.

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

Ember can save the track playing while you write. Click **♫** in the top-right
and choose **Sign in with Spotify** — that is the whole thing.

> Using the browser version, open it at **http://127.0.0.1:5173**, not
> `localhost:5173`. Spotify only accepts the loopback address in redirect URIs,
> and the two are different origins, so signing in from `localhost` loses the
> verifier stored for `127.0.0.1`.

### For maintainers: registering Ember's Spotify app

"Sign in with Spotify" needs one Spotify application to exist, registered once
by whoever ships Ember. Until `DEFAULT_CLIENT_ID` in `src/spotify.js` is filled
in, the panel asks each user for a Client ID of their own instead.

1. Create an app at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Add **both** of these as **Redirect URIs**:
   - `http://127.0.0.1:8888/callback` — the desktop app
   - `http://127.0.0.1:5173/callback` — the browser version (`npm run dev`)
3. Copy the **Client ID** into `DEFAULT_CLIENT_ID` in `src/spotify.js`

Committing that Client ID is safe. Ember uses the PKCE flow, which has no
client secret precisely so the ID can ship inside a public application — the
secret that matters is the code verifier, generated fresh on each machine for
every sign-in and never transmitted.

Two things to know before relying on it:

- A new Spotify app starts in **Development Mode**, which only works for up to
  25 accounts that you add by email in the dashboard. Going beyond that needs
  Spotify's **Extended Quota Mode** review.
- Anyone can still use their own app: **Use your own Spotify app instead**, in
  the same panel, overrides the shipped ID. Forks and self-hosters will want
  this, and it is what the panel falls back to when no ID is shipped.

---

## Project structure

```
├── src/
│   ├── app.js        # Main UI — views, editor, event binding
│   ├── crypto.js     # AES-GCM encrypt/decrypt (text + binary)
│   ├── storage.js    # IndexedDB persistence
│   ├── services.js   # Client for the local validation-engine / reflective-modules services
│   ├── spotify.js    # Spotify PKCE OAuth + now-playing API
│   └── style.css     # Coal & Fire design system
├── services/
│   ├── validation-engine/       # C# — entry validation, time-lock enforcement
│   ├── validation-engine-tests/ # xUnit tests for the above
│   └── reflective-modules/      # Python — emotional decay computation
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

## Star the project

If you find Ember interesting — the mechanics, the local-first architecture, or
just the idea — [**star it on GitHub**](https://github.com/Jeremy-1011/Ember--A-Local-First-Emotional-Computing-System-). It costs you a click, and it is
what puts a project like this in front of the next person who needs it.

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
