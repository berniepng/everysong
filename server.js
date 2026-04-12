'use strict';

const express = require('express');
const path = require('path');
const compression = require('compression');
const { initDb, getDb } = require('./db/database');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3010;
const BASE = '/everysong';

// Init DB on startup
initDb();

app.use(compression());
app.use(BASE + '/public', express.static(path.join(__dirname, 'public'), {
  maxAge: '1d'
}));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// buildUrl helper available in all EJS templates
app.locals.buildUrl = function(urlPath, params) {
  const parts = [];
  Object.entries(params).forEach(function([k, v]) {
    if (v !== '' && v !== null && v !== undefined) {
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    }
  });
  return parts.length ? urlPath + '?' + parts.join('&') : urlPath;
};

// ─── iTunes art fetcher (runs server-side on Lightsail) ──────────────────────
const artCache = new Map();

function fetchItunesArt(artist, album) {
  const key = `${artist}::${album}`;
  if (artCache.has(key)) return artCache.get(key);

  const promise = new Promise((resolve) => {
    const term = encodeURIComponent(`${artist} ${album}`);
    const url = `https://itunes.apple.com/search?term=${term}&media=music&entity=album&limit=3`;
    const req = https.get(url, { timeout: 6000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.results && json.results.length > 0) {
            const art = json.results[0].artworkUrl100;
            resolve(art ? art.replace('100x100bb', '400x400bb') : null);
          } else resolve(null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });

  artCache.set(key, promise);
  return promise;
}

// Background art enrichment on startup
async function enrichArt() {
  const db = getDb();
  const unenriched = db.prepare(
    'SELECT DISTINCT album FROM songs WHERE (art_url IS NULL OR art_url = "") AND art_fetched = 0 LIMIT 80'
  ).all();

  for (const { album } of unenriched) {
    if (!album) continue;
    try {
      const art = await fetchItunesArt('BTS', album);
      db.prepare('UPDATE songs SET art_url = ?, art_fetched = 1 WHERE album = ? AND (art_url IS NULL OR art_url = "")').run(art || '', album);
      await new Promise(r => setTimeout(r, 350));
    } catch(e) {
      db.prepare('UPDATE songs SET art_fetched = 1 WHERE album = ?').run(album);
    }
  }
  console.log('Art enrichment complete');
}

// Run art enrichment after 2s delay so server starts fast
setTimeout(() => {
  enrichArt().catch(e => console.error('Art enrichment error:', e));
}, 2000);

// ─── Routes ──────────────────────────────────────────────────────────────────

// Landing page
app.get([BASE, BASE + '/'], (req, res) => {
  const db = getDb();
  const artists = db.prepare(`
    SELECT a.*, COUNT(s.id) as song_count
    FROM artists a
    LEFT JOIN songs s ON s.artist_id = a.id
    GROUP BY a.id
    ORDER BY a.name
  `).all();
  res.render('index', { artists, base: BASE });
});

// Artist page
app.get(BASE + '/:slug', (req, res) => {
  const db = getDb();
  const { slug } = req.params;

  const artist = db.prepare('SELECT * FROM artists WHERE slug = ?').get(slug);
  if (!artist) return res.status(404).render('404', { base: BASE });

  // Query params
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const perPage = 24;
  const search = (req.query.search || '').trim();
  const filterYear = req.query.year || '';
  const filterAlbum = req.query.album || '';
  const filterSungBy = req.query.sung_by || '';
  const sortBy = req.query.sort || 'year_asc';

  // Build WHERE clause
  let where = 'WHERE s.artist_id = ?';
  const params = [artist.id];

  if (search) {
    where += ' AND (s.song_name LIKE ? OR s.album LIKE ? OR s.highlights LIKE ?)';
    const q = `%${search}%`;
    params.push(q, q, q);
  }
  if (filterYear) { where += ' AND s.year_released = ?'; params.push(parseInt(filterYear)); }
  if (filterAlbum) { where += ' AND s.album = ?'; params.push(filterAlbum); }
  if (filterSungBy) { where += ' AND s.sung_by LIKE ?'; params.push(`%${filterSungBy}%`); }

  // Sort
  const sortMap = {
    year_asc: 's.year_released ASC, s.song_name ASC',
    year_desc: 's.year_released DESC, s.song_name ASC',
    name_asc: 's.song_name ASC',
    name_desc: 's.song_name DESC',
    album_asc: 's.album ASC, s.song_name ASC',
  };
  const orderBy = sortMap[sortBy] || sortMap.year_asc;

  const countQuery = `SELECT COUNT(*) as n FROM songs s ${where}`;
  const total = db.prepare(countQuery).get(...params).n;
  const totalPages = Math.ceil(total / perPage);
  const offset = (page - 1) * perPage;

  const songs = db.prepare(`
    SELECT s.* FROM songs s ${where}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).all(...params, perPage, offset);

  // Filter options
  const years = db.prepare(
    'SELECT DISTINCT year_released FROM songs WHERE artist_id = ? AND year_released IS NOT NULL ORDER BY year_released'
  ).all(artist.id).map(r => r.year_released);

  const albums = db.prepare(
    `SELECT DISTINCT album FROM songs WHERE artist_id = ? AND album != '' ORDER BY album`
  ).all(artist.id).map(r => r.album);

  const sungByOptions = db.prepare(
    'SELECT DISTINCT sung_by FROM songs WHERE artist_id = ? ORDER BY sung_by'
  ).all(artist.id).map(r => r.sung_by);

  res.render('artist', {
    artist,
    songs,
    page,
    totalPages,
    total,
    perPage,
    search,
    filterYear,
    filterAlbum,
    filterSungBy,
    sortBy,
    years,
    albums,
    sungByOptions,
    base: BASE,
  });
});

// API: refresh art for a specific album
app.get(BASE + '/api/art', async (req, res) => {
  const { artist, album } = req.query;
  if (!artist || !album) return res.json({ art: null });
  const art = await fetchItunesArt(artist, album);
  res.json({ art });
});

app.listen(PORT, () => {
  console.log(`EverySOng running on port ${PORT}`);
  console.log(`Visit: http://localhost:${PORT}${BASE}`);
});
