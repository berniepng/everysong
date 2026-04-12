const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'everysong.db');

let db;

function getDb() {
  if (!db) {
    db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
  }
  return db;
}

function initDb() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS artists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      country TEXT,
      genre TEXT,
      formed_year INTEGER,
      image_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artist_id INTEGER NOT NULL,
      song_name TEXT NOT NULL,
      album TEXT,
      sung_by TEXT,
      year_released INTEGER,
      highlights TEXT,
      art_url TEXT,
      art_fetched INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (artist_id) REFERENCES artists(id)
    );

    CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist_id);
    CREATE INDEX IF NOT EXISTS idx_songs_year ON songs(year_released);
    CREATE INDEX IF NOT EXISTS idx_songs_album ON songs(album);
    CREATE INDEX IF NOT EXISTS idx_artists_slug ON artists(slug);
  `);

  console.log('Database initialized at', DB_PATH);
  return db;
}

module.exports = { getDb, initDb };
