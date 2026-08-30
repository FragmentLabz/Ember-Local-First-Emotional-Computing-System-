# Ember — interactive demo

A single static page demonstrating Ember's three emotional mechanics:
**Emotional Decay**, **Time-Lock Revisitation** and **Honesty Constraints**.

It is deliberately self-contained: three files, no build step, no backend, no
network requests apart from the Google Fonts stylesheet. Nothing typed on the
page is sent anywhere.

```
demo/
├── index.html
├── style.css
└── app.js
```

## Deploying to Vercel

This folder is a plain static site, so it needs no framework and no build
command.

**Option A — drag and drop.** Go to <https://vercel.com/new>, and drag this
`demo` folder onto the upload area. That is the whole process.

**Option B — from the repository.** Create a new Vercel project from the repo
and set:

| Setting | Value |
|---|---|
| Framework Preset | **Other** |
| Root Directory | `demo` |
| Build Command | *(leave empty)* |
| Output Directory | *(leave empty)* |

Do not reuse the repository root for this project. The root `vercel.json`
describes the full multi-service application (Vite frontend plus the Python
service) and is a different deployment.

## Running it locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server --directory demo 8000
```

## How it relates to the real app

The demo re-implements the mechanics in plain browser JavaScript so that it can
run with no services behind it. The rules are the same ones the real app uses:

| Demo function (`app.js`) | Matches |
|---|---|
| `renderWordsMode`, `renderBurnMode` | `services/reflective-modules/decay.py` |
| the visit counter in `setupTimeLock` | `services/reflective-modules/validation.py` |

The decay output was checked against the Python service directly and matches it
exactly at 0, 5, 10, 15, 22 and 29 days.

Two deliberate differences, to make the mechanics visible in a few seconds
rather than a few weeks:

- **Time is a slider.** The real app computes decay from the entry's creation
  date; here you drag through 30 days.
- **Revisits are a button.** The real app requires genuinely separate visits;
  here "close & come back later" stands in for one.

The demo does not include entry storage, encryption, attachments or Spotify —
those belong to the full application.
