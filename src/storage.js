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

// IndexedDB storage for ember entries.
// Everything is kept in the browser on this machine. Nothing is uploaded.

const DB_NAME = 'ember-journal';
const DB_VERSION = 1;
const STORE_NAME = 'entries';

// Once the database is open we hang on to it instead of reopening every time.
let openedDb = null;

function openDB() {
  if (openedDb !== null) {
    return Promise.resolve(openedDb);
  }

  return new Promise(function (resolve, reject) {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // Runs only the first time, or when DB_VERSION goes up.
    request.onupgradeneeded = function (event) {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };

    request.onsuccess = function (event) {
      openedDb = event.target.result;
      resolve(openedDb);
    };

    request.onerror = function (event) {
      reject(event.target.error);
    };
  });
}

export async function saveEntry(entry) {
  const db = await openDB();
  return new Promise(function (resolve, reject) {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(entry);
    tx.oncomplete = function () {
      resolve(entry);
    };
    tx.onerror = function (event) {
      reject(event.target.error);
    };
  });
}

export async function loadEntries() {
  const db = await openDB();
  return new Promise(function (resolve, reject) {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.index('createdAt').getAll();

    request.onsuccess = function (event) {
      // getAll() gives oldest first, but the timeline shows newest first.
      const rows = event.target.result;
      rows.reverse();
      resolve(rows);
    };

    request.onerror = function (event) {
      reject(event.target.error);
    };
  });
}

export async function deleteEntry(id) {
  const db = await openDB();
  return new Promise(function (resolve, reject) {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = function () {
      resolve();
    };
    tx.onerror = function (event) {
      reject(event.target.error);
    };
  });
}

// A simple unique id: the current time plus a few random characters.
export function generateId() {
  const timePart = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2);
  return timePart + randomPart;
}
