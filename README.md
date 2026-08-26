# ✦ Ember

> A local-first encrypted journaling app with a cinematic timeline interface.

![Views](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/Jeremy-1011/Journal-App-Ember/main/traffic-data/badge.json)

Ember is a desktop/browser journaling app built around the idea that not every thought is meant to last forever. Entries exist on a glowing timeline — newest ones burn bright, older ones cool to ash. Some entries are sealed until a future date. Others are written to disappear.

Everything stays on your device. No accounts. No cloud. No tracking.

---

## Features

### 🕯 Three entry types

| Type | Description |
|------|-------------|
| **Regular** | Rich text journal entry, lives forever |
| **Time Capsule** | AES-256 encrypted and sealed until a date you choose — completely unreadable until then |
| **Decaying** | Fades word-by-word or burns down in opacity over days or weeks, leaving only a tombstone |

### ✍ Rich text editor
Type `/` on any line to open the block menu — pick a heading, quote, list, divider, or link without leaving the keyboard.

### 📎 File attachments
Drag-and-drop images, PDFs, or any file onto an entry. Images render inline; PDFs open in-browser. Attachments inside Time Capsules are encrypted alongside the text.

### 🎵 Spotify integration
Connect your Spotify account to save the track playing while you write. The song is stored permanently with the entry, and its audio energy/mood subtly tints the card colour on the timeline.

### 🔒 Privacy by design
- All data in browser IndexedDB — nothing leaves your machine
- Time Capsule encryption: AES-GCM 256-bit with PBKDF2 (200,000 iterations, SHA-256)
- The passphrase is derived from the unlock date and never stored
- Spotify is entirely optional and uses PKCE OAuth (no client secret)

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

> **Windows:** If Electron's binary fails to download, use `npm run dev` instead — the browser version is fully featured.

---

## Spotify setup (optional)

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) and create an app
2. Add `http://127.0.0.1:8888/callback` as a **Redirect URI**
3. Copy your **Client ID**
4. In Ember, click **♫** in the top-right and enter your Client ID

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| UI | Vanilla JavaScript (no framework) |
| Bundler | Vite 5 |
| Desktop | Electron 29 |
| Storage | IndexedDB (local, no server) |
| Encryption | Web Crypto API — AES-GCM 256-bit, PBKDF2 200k iterations |
| Fonts | Cormorant Garamond · Lora · Kalam (Google Fonts) |

## Project structure

```
├── src/
│   ├── app.js        # Main UI — views, editor, event binding
│   ├── crypto.js     # AES-GCM encrypt/decrypt (text + binary)
│   ├── storage.js    # IndexedDB persistence
│   ├── decay.js      # Decay progress & rendering
│   ├── spotify.js    # Spotify PKCE OAuth + now-playing API
│   └── style.css     # Coal & Fire design system
├── electron/
│   ├── main.cjs      # Electron main process + Spotify OAuth window
│   └── preload.cjs   # Context bridge (contextIsolation)
├── index.html
├── vite.config.js
└── package.json
```

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
