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

// Spotify login (PKCE) and the few API calls Ember needs.

// Ember's own Spotify application. This is what makes "Sign in with Spotify"
// work without asking anyone to register their own app.
//
// Publishing a Client ID is safe here. Ember uses the PKCE flow, which has no
// client secret precisely so that the ID can ship inside a public app -- that
// is the flow Spotify documents for desktop and single-page apps. The secret
// that matters is the code verifier, which is generated fresh on this machine
// for every sign-in and never leaves it.
//
// Leave this empty and Ember falls back to asking for a Client ID, which is
// what self-hosters and forks will want anyway.
const DEFAULT_CLIENT_ID = '581e440cb658440392322f469cd877c2';

// A Client ID the user supplied themselves, which overrides the default.
const CLIENT_ID_KEY = 'spotify_client_id';

export function getClientId() {
  const own = localStorage.getItem(CLIENT_ID_KEY);
  if (own) {
    return own;
  }
  return DEFAULT_CLIENT_ID;
}

// True when Ember ships an app of its own, so the user can just sign in.
export function hasDefaultClientId() {
  return DEFAULT_CLIENT_ID ? true : false;
}

// True when the user has chosen to use their own app instead.
export function usingOwnClientId() {
  return localStorage.getItem(CLIENT_ID_KEY) ? true : false;
}

export function setClientId(id) {
  const trimmed = String(id).trim();
  if (trimmed) {
    localStorage.setItem(CLIENT_ID_KEY, trimmed);
  } else {
    localStorage.removeItem(CLIENT_ID_KEY);
  }
}

export function hasClientId() {
  return getClientId() ? true : false;
}

const REDIRECT_URI = 'http://127.0.0.1:8888/callback';
const SCOPES = 'user-read-currently-playing user-read-playback-state';

// Spotify wants base64 in a URL-safe form: no +, no / and no trailing =.
function base64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary = binary + String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// The verifier is a random secret we keep; the challenge is its hash, which is
// what we send to Spotify. This is what makes PKCE safe without a client secret.
function generateCodeVerifier() {
  const randomBytes = new Uint8Array(64);
  crypto.getRandomValues(randomBytes);
  return base64Url(randomBytes);
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64Url(new Uint8Array(digest));
}

export async function startAuth() {
  if (!hasClientId()) {
    throw new Error('No Spotify Client ID set.');
  }

  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);

  // Kept until the redirect comes back, then used to prove we started this login.
  sessionStorage.setItem('spotify_verifier', verifier);

  const params = new URLSearchParams({
    client_id: getClientId(),
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge
  });

  return 'https://accounts.spotify.com/authorize?' + params;
}

export async function exchangeCode(code) {
  const verifier = sessionStorage.getItem('spotify_verifier');

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: getClientId(),
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier
    })
  });

  if (!response.ok) {
    throw new Error('Token exchange failed');
  }

  const data = await response.json();
  storeTokens(data);
  return data;
}

export async function refreshToken() {
  const refresh = localStorage.getItem('spotify_refresh');
  if (!refresh) {
    return null;
  }

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: getClientId(),
      grant_type: 'refresh_token',
      refresh_token: refresh
    })
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  storeTokens(data);
  return data;
}

function storeTokens(data) {
  localStorage.setItem('spotify_access', data.access_token);
  localStorage.setItem('spotify_expires', Date.now() + data.expires_in * 1000);
  // Spotify does not always send a new refresh token, so only replace it when it does.
  if (data.refresh_token) {
    localStorage.setItem('spotify_refresh', data.refresh_token);
  }
}

export async function getAccessToken() {
  const access = localStorage.getItem('spotify_access');
  const expires = parseInt(localStorage.getItem('spotify_expires') || '0');

  if (!access) {
    return null;
  }

  // Refresh 30 seconds early so a token cannot expire mid-request.
  if (Date.now() < expires - 30000) {
    return access;
  }

  const refreshed = await refreshToken();
  if (!refreshed) {
    return null;
  }
  return localStorage.getItem('spotify_access');
}

export async function getNowPlaying() {
  const token = await getAccessToken();
  if (!token) {
    return null;
  }

  try {
    const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { Authorization: 'Bearer ' + token }
    });

    // 204 means nothing is playing right now.
    if (response.status === 204 || !response.ok) {
      return null;
    }

    const data = await response.json();
    if (!data.is_playing || !data.item) {
      return null;
    }

    // Join every artist's name into one string, e.g. "Artist A, Artist B".
    const artistNames = [];
    for (let i = 0; i < data.item.artists.length; i++) {
      artistNames.push(data.item.artists[i].name);
    }

    // Prefer the medium-sized cover, but fall back to the first one.
    const images = data.item.album.images;
    let albumArt;
    if (images[1]) {
      albumArt = images[1].url;
    } else if (images[0]) {
      albumArt = images[0].url;
    }

    return {
      trackId: data.item.id,
      trackName: data.item.name,
      artistName: artistNames.join(', '),
      albumName: data.item.album.name,
      albumArt: albumArt
    };
  } catch (err) {
    return null;
  }
}

export async function getAudioFeatures(trackId) {
  const token = await getAccessToken();
  if (!token || !trackId) {
    return null;
  }

  try {
    const response = await fetch('https://api.spotify.com/v1/audio-features/' + trackId, {
      headers: { Authorization: 'Bearer ' + token }
    });
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    return { energy: data.energy, valence: data.valence };
  } catch (err) {
    return null;
  }
}

export function isConnected() {
  return localStorage.getItem('spotify_access') ? true : false;
}

export function disconnect() {
  localStorage.removeItem('spotify_access');
  localStorage.removeItem('spotify_refresh');
  localStorage.removeItem('spotify_expires');
}
