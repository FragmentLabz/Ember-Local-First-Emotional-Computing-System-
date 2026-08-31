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
  esbuild: { legalComments: 'inline' },

  server: {
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

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: { banner: banner }
    }
  }
};
