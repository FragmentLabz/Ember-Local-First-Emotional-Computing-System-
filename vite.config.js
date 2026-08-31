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

// Keeps the copyright notice in the built output, not just in the sources.
const bannerLines = [
  '/*! ember — Copyright (C) 2026 Jeremiah Ayeni <https://github.com/Jeremy-1011>',
  ' *  SPDX-License-Identifier: AGPL-3.0-or-later',
  ' *  This program is free software under the GNU Affero General Public License',
  ' *  v3 or later. Source: https://github.com/Jeremy-1011/Journal-App-Ember',
  ' */'
];

const banner = bannerLines.join('\n');

export default {
  // Serve index.html for /callback too, so Spotify can redirect the browser
  // back into the app rather than onto a 404.
  appType: 'spa',

  esbuild: { legalComments: 'inline' },

  server: {
    // Bind IPv4 loopback explicitly. Vite's default host is the name
    // "localhost", which Node resolves to ::1 first on Windows -- so the
    // server ends up listening on IPv6 only and http://127.0.0.1:5173 is
    // refused. Spotify accepts only the IP literal in redirect URIs, so this
    // is the address the app has to be reachable on. It stays loopback-only:
    // nothing is exposed to the network.
    host: '127.0.0.1',

    watch: {
      // Do not watch the services' build output. On Windows `dotnet run`
      // holds a lock on obj/Debug/.../apphost.exe while it compiles, and the
      // watcher dies with EBUSY the moment it tries to open it -- which takes
      // the dev server, and everything concurrently started with it, down.
      // None of these paths are part of the frontend anyway.
      ignored: [
        '**/services/**/bin/**',
        '**/services/**/obj/**',
        '**/services/**/__pycache__/**',
        '**/build/**',
        '**/release/**'
      ]
    }
  },

  preview: {
    host: '127.0.0.1'
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: { banner: banner }
    }
  }
};
