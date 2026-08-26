// Copyright (c) 2026 Jeremiah Ayeni <https://github.com/Jeremy-1011>
// This source code is licensed under the MIT license found in the
// LICENSE file in the root directory of this source tree.

// AES-GCM encryption using Web Crypto API
// Key derived via PBKDF2 from a passphrase (unlock date string)

export async function deriveKey(passphrase, saltBytes) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(passphrase), { name: 'PBKDF2' }, false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: 200000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encrypt(text, passphrase) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await deriveKey(passphrase, salt);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(text)
  );
  return {
    salt: buf2hex(salt),
    iv:   buf2hex(iv),
    ciphertext: buf2hex(new Uint8Array(cipherBuf)),
  };
}

export async function decrypt({ salt, iv, ciphertext }, passphrase) {
  const key = await deriveKey(hex2buf(salt), hex2buf(salt));
  // Re-derive with correct salt
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(passphrase), { name: 'PBKDF2' }, false, ['deriveKey']
  );
  const derivedKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: hex2buf(salt), iterations: 200000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: hex2buf(iv) },
    derivedKey,
    hex2buf(ciphertext)
  );
  return new TextDecoder().decode(plain);
}

// ─── Binary encryption (for file attachments in time capsules) ──────────────
export async function encryptBytes(bytes, passphrase) {
  const enc  = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(passphrase), { name: 'PBKDF2' }, false, ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
  return { salt: buf2hex(salt), iv: buf2hex(iv), cipher: new Uint8Array(cipherBuf) };
}

export async function decryptBytes({ salt, iv, cipher }, passphrase) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(passphrase), { name: 'PBKDF2' }, false, ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: hex2buf(salt), iterations: 200000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: hex2buf(iv) }, key, cipher);
  return new Uint8Array(plain);
}

function buf2hex(buf) {
  return Array.from(buf).map(b => b.toString(16).padStart(2,'0')).join('');
}

function hex2buf(hex) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.slice(i*2, i*2+2), 16);
  return arr;
}
