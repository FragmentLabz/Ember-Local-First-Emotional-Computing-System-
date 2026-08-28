# Security Policy

## Scope

Ember is a local-first journaling app: a Vite-built web UI that also ships as an
Electron desktop app. Entries live in the browser's IndexedDB on your own
machine. There is no Ember server, no account system, and no analytics or
telemetry of any kind.

## What stays local

- **All journal entries and attachments** are stored in IndexedDB on your
  device and are never uploaded anywhere.
- **Time Capsule encryption** runs entirely in the browser via the Web Crypto
  API: AES-GCM 256-bit, with the key derived by PBKDF2 (200,000 iterations,
  SHA-256). The passphrase is derived from the unlock date and is not stored.
- **Decay and time-lock logic** is evaluated locally against the system clock.

## What leaves your machine

Being accurate about this matters more than the marketing line, so:

- **Google Fonts.** The UI loads typefaces from `fonts.googleapis.com` and
  `fonts.gstatic.com` on every launch. Google receives the request. To avoid
  this entirely, self-host the fonts and drop the `<link>` tags in
  `index.html`.
- **Spotify (optional, off by default).** If you connect Spotify, the app talks
  to `accounts.spotify.com` and `api.spotify.com` to complete PKCE OAuth and to
  read the currently-playing track and its audio features. Your journal text is
  never sent to Spotify — only standard OAuth and read requests. Leave Spotify
  disconnected and no request is made.

No journal content is transmitted in either case.

## Time-lock caveat

Time Capsules are sealed by deriving the key from the unlock date, not by
enforcement against a trusted clock. Anyone who knows or guesses the unlock
date can derive the key and open the capsule early. Treat Time Capsules as a
commitment device, not as protection against a determined attacker with access
to your device.

## Reporting a vulnerability

Please do not open a public issue for a security report.

Use GitHub's private vulnerability reporting: go to the **Security** tab of
this repository and choose **Report a vulnerability**. That opens a private
advisory visible only to the maintainer.

Reports that are especially useful: flaws in the key derivation or encryption
path, ways to recover a Time Capsule's plaintext without the unlock date,
Electron IPC or `contextIsolation` weaknesses, and any path by which entry
content reaches the network.

Expect an initial response within a week. This is a personal project, not a
funded product, so please size your expectations accordingly.

## License

Ember is released under the MIT License. See [LICENSE](LICENSE).
