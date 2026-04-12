#!/usr/bin/env node
'use strict';

const { initDb, getDb } = require('../db/database');
const fs = require('fs');
const path = require('path');
const https = require('https');

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = parseLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseLine(line);
    const row = {};
    headers.forEach((h, i) => row[h.trim()] = (vals[i] || '').trim());
    return row;
  });
}

function parseLine(line) {
  const result = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuote && line[i+1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (c === ',' && !inQuote) {
      result.push(cur); cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result;
}

function fetchArt(artist, album) {
  return new Promise((resolve) => {
    const term = encodeURIComponent(`${artist} ${album}`);
    const url = `https://itunes.apple.com/search?term=${term}&media=music&entity=album&limit=3`;
    const req = https.get(url, { timeout: 5000 }, (res) => {
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
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function seed() {
  console.log('🌱 Seeding BTS...');
  const db = initDb();

  db.prepare(`INSERT OR IGNORE INTO artists (slug, name, description, country, genre, formed_year) VALUES (?, ?, ?, ?, ?, ?)`).run(
    'bts',
    'BTS (방탄소년단)',
    'South Korean global superstars who broke every record in K-pop history. Seven members — RM, Jin, Suga, J-Hope, Jimin, V, Jungkook — who went from underdogs to stadium-filling worldwide phenomenon, redefining what K-pop could be.',
    'South Korea',
    'K-Pop, Hip-Hop, Pop, R&B',
    2013
  );

  const artist = db.prepare('SELECT id FROM artists WHERE slug = ?').get('bts');
  const artistId = artist.id;
  console.log('✅ Artist inserted, id:', artistId);

  db.prepare('DELETE FROM songs WHERE artist_id = ?').run(artistId);

  const csvPath = path.join(__dirname, 'bts_complete_discography.csv');
  const csv = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCSV(csv);
  console.log(`📄 Parsed ${rows.length} songs from CSV`);

  const insertSong = db.prepare(`
    INSERT INTO songs (artist_id, song_name, album, sung_by, year_released, highlights, art_url, art_fetched)
    VALUES (?, ?, ?, ?, ?, ?, NULL, 0)
  `);

  db.exec('BEGIN');
  for (const row of rows) {
    insertSong.run(
      artistId,
      row.song_name || '',
      row.album || '',
      row.sung_by || 'BTS',
      parseInt(row.year_released) || null,
      row.highlights || ''
    );
  }
  db.exec('COMMIT');
  console.log(`✅ Inserted ${rows.length} songs`);

  console.log('🎨 Fetching album art from iTunes...');
  const updateArt = db.prepare('UPDATE songs SET art_url = ?, art_fetched = 1 WHERE artist_id = ? AND album = ?');
  const albums = db.prepare('SELECT DISTINCT album FROM songs WHERE artist_id = ? AND art_fetched = 0').all(artistId);

  let fetched = 0;
  for (const { album } of albums) {
    if (!album) continue;
    const art = await fetchArt('BTS', album);
    if (art) {
      updateArt.run(art, artistId, album);
      fetched++;
      process.stdout.write(`  🖼  ${album.substring(0, 50)}\n`);
    }
    await sleep(350);
  }

  db.prepare('UPDATE songs SET art_fetched = 1 WHERE artist_id = ? AND art_fetched = 0').run(artistId);
  console.log(`✅ Art fetched for ${fetched}/${albums.length} albums`);
  console.log('🎉 BTS seed complete!');

  const count = db.prepare('SELECT COUNT(*) as n FROM songs WHERE artist_id = ?').get(artistId);
  console.log(`   Total songs in DB: ${count.n}`);
}

seed().catch(err => { console.error('Seed failed:', err); process.exit(1); });
