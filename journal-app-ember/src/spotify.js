// Spotify PKCE OAuth + API helpers

const CLIENT_ID = 'YOUR_CLIENT_ID_HERE';
const REDIRECT_URI = 'http://127.0.0.1:8888/callback';
const SCOPES = 'user-read-currently-playing user-read-playback-state';

function generateCodeVerifier() {
  const arr = new Uint8Array(64);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}

export async function startAuth() {
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  sessionStorage.setItem('spotify_verifier', verifier);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });
  return `https://accounts.spotify.com/authorize?${params}`;
}

export async function exchangeCode(code) {
  const verifier = sessionStorage.getItem('spotify_verifier');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new Error('Token exchange failed');
  const data = await res.json();
  storeTokens(data);
  return data;
}

export async function refreshToken() {
  const refresh = localStorage.getItem('spotify_refresh');
  if (!refresh) return null;
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refresh,
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  storeTokens(data);
  return data;
}

function storeTokens(data) {
  localStorage.setItem('spotify_access', data.access_token);
  localStorage.setItem('spotify_expires', Date.now() + data.expires_in * 1000);
  if (data.refresh_token) localStorage.setItem('spotify_refresh', data.refresh_token);
}

export async function getAccessToken() {
  const access  = localStorage.getItem('spotify_access');
  const expires = parseInt(localStorage.getItem('spotify_expires') || '0');
  if (!access) return null;
  if (Date.now() < expires - 30000) return access;
  const refreshed = await refreshToken();
  return refreshed ? localStorage.getItem('spotify_access') : null;
}

export async function getNowPlaying() {
  const token = await getAccessToken();
  if (!token) return null;
  try {
    const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 204 || !res.ok) return null;
    const data = await res.json();
    if (!data.is_playing || !data.item) return null;
    return {
      trackId:    data.item.id,
      trackName:  data.item.name,
      artistName: data.item.artists.map(a => a.name).join(', '),
      albumName:  data.item.album.name,
      albumArt:   data.item.album.images[1]?.url || data.item.album.images[0]?.url,
    };
  } catch { return null; }
}

export async function getAudioFeatures(trackId) {
  const token = await getAccessToken();
  if (!token || !trackId) return null;
  try {
    const res = await fetch(`https://api.spotify.com/v1/audio-features/${trackId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const d = await res.json();
    return { energy: d.energy, valence: d.valence };
  } catch { return null; }
}

export function isConnected() {
  return !!localStorage.getItem('spotify_access');
}

export function disconnect() {
  localStorage.removeItem('spotify_access');
  localStorage.removeItem('spotify_refresh');
  localStorage.removeItem('spotify_expires');
}
