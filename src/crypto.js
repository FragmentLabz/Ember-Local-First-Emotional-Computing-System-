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

// AES-GCM encryption using the Web Crypto API.
// The key is worked out from a passphrase (the unlock date string) with PBKDF2.

// How many times PBKDF2 stretches the passphrase. Higher is slower to attack.
const PBKDF2_ROUNDS = 200000;

// Turns a passphrase into an AES key. `usages` says what the key is allowed
// to do, for example ['encrypt'] or ['decrypt'].
async function makeKey(passphrase, saltBytes, usages) {
  const encoder = new TextEncoder();
  const passphraseBytes = encoder.encode(passphrase);

  // Step 1: hand the raw passphrase bytes to Web Crypto.
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passphraseBytes,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  // Step 2: stretch it into a real 256-bit AES key.
  const settings = {
    name: 'PBKDF2',
    salt: saltBytes,
    iterations: PBKDF2_ROUNDS,
    hash: 'SHA-256'
  };
  return crypto.subtle.deriveKey(
    settings,
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    usages
  );
}

export async function deriveKey(passphrase, saltBytes) {
  return makeKey(passphrase, saltBytes, ['encrypt', 'decrypt']);
}

export async function encrypt(text, passphrase) {
  const encoder = new TextEncoder();

  // A fresh salt and IV every time, so the same text never encrypts the same way.
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const key = await makeKey(passphrase, salt, ['encrypt']);
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    encoder.encode(text)
  );

  return {
    salt: bytesToHex(salt),
    iv: bytesToHex(iv),
    ciphertext: bytesToHex(new Uint8Array(cipherBuffer))
  };
}

export async function decrypt(encrypted, passphrase) {
  // `encrypted` is what encrypt() gave back: salt, iv and ciphertext as hex.
  const salt = hexToBytes(encrypted.salt);
  const iv = hexToBytes(encrypted.iv);
  const ciphertext = hexToBytes(encrypted.ciphertext);

  const key = await makeKey(passphrase, salt, ['decrypt']);
  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(plainBuffer);
}

// --- Binary encryption (for file attachments in time capsules) --------------

export async function encryptBytes(bytes, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const key = await makeKey(passphrase, salt, ['encrypt']);
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    bytes
  );

  return {
    salt: bytesToHex(salt),
    iv: bytesToHex(iv),
    cipher: new Uint8Array(cipherBuffer)
  };
}

export async function decryptBytes(encrypted, passphrase) {
  const salt = hexToBytes(encrypted.salt);
  const iv = hexToBytes(encrypted.iv);

  const key = await makeKey(passphrase, salt, ['decrypt']);
  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    encrypted.cipher
  );

  return new Uint8Array(plainBuffer);
}

// --- Hex helpers ------------------------------------------------------------

// Turns bytes into a hex string, two characters per byte.
function bytesToHex(bytes) {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    let piece = bytes[i].toString(16);
    if (piece.length < 2) {
      piece = '0' + piece;
    }
    hex = hex + piece;
  }
  return hex;
}

// Turns a hex string back into bytes.
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const pair = hex.slice(i * 2, i * 2 + 2);
    bytes[i] = parseInt(pair, 16);
  }
  return bytes;
}
