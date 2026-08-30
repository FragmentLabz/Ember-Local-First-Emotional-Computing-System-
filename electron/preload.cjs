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

// The only bridge between the page and Electron. Anything not listed here is
// simply not reachable from the page.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('emberAPI', {
  spotifyAuth: function (url) {
    return ipcRenderer.invoke('spotify-auth', url);
  },
  isElectron: true
});
