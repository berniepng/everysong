# EverySong

**A self-hosted, database-driven music discography explorer.**

Browse complete artist discographies — every album track, B-side, solo release, collaboration, and bonus track — in a searchable, filterable gallery. Add any artist by dropping in a CSV.

Live demo: [demo.bernie.studio/everysong](https://demo.bernie.studio/everysong)

---

![Banner Description](https://github.com/berniepng/bs-everysong/blob/main/Git/everysong/docs/_img/github-banner_everysong.png)

## What it does

- Landing page listing all catalogued artists with song counts
- Per-artist gallery with album art (fetched live from iTunes API), song name, performer, year, and highlights
- Filter by year, album, and performer; search across song name, album, and highlights
- Toggle between grid and list view
- Pagination (24 songs per page)
- Dark / light theme with localStorage persistence
- Mobile-responsive down to 320px

Currently catalogued:

- **BTS** — 386 songs (2013–2026) including all group albums, Japanese releases, solo mixtapes and albums, unit tracks, OSTs, and the 2026 comeback album ARIRANG
- **Pet Shop Boys** — 362 songs (1984–2025) including all studio albums, B-side collections Alternative and Format, Further Listening bonus disc series, soundtracks, EPs, collaborations, and the complete Disco 5 remix album featuring Noel Gallagher, Tina Turner, Primal Scream, Paul Weller, and Sleaford Mods
- **Brandi Carlile** — 156 songs (2005–2026) including all 8 solo studio albums, The Highwomen supergroup album, the Elton John collaboration Who Believes in Angels?, live albums, hidden tracks, and notable features and collaborations

---

## Tech stack

| Layer              | Technology                                                                |
| ------------------ | ------------------------------------------------------------------------- |
| Runtime            | Node.js 22+                                                               |
| Web framework      | Express 4                                                                 |
| Database           | SQLite via Node's built-in `node:sqlite` (no native compilation required) |
| Templating         | EJS (server-side rendered — no build step)                                |
| Styling            | Vanilla CSS with CSS custom properties for theming                        |
| Album art          | iTunes Search API (fetched at runtime, cached in DB)                      |
| Process management | PM2                                                                       |
| Reverse proxy      | nginx                                                                     |
| Hosting            | AWS Lightsail                                                             |
| CI                 | GitHub Actions                                                            |

**Why these choices:**

- `node:sqlite` ships with Node 22 — zero native module compilation headaches on the server. No `better-sqlite3` build failures, no Python/gyp dependencies.
- Server-side rendering via EJS means the app works without JavaScript enabled and has fast first-paint with no hydration overhead.
- SQLite is the right tool here — the dataset is read-heavy, single-server, and fits comfortably in memory. No Postgres/MySQL overhead for what is essentially a static catalogue.
- No TypeScript, no bundler, no framework — deliberately minimal. The complexity ceiling is low; the maintainability ceiling is high.

---

## Project structure

```
everysong/
├── server.js                    # Express app — all routes, iTunes art enrichment
├── package.json
├── ecosystem.config.js          # PM2 process config
├── nginx-snippet.conf           # nginx location block to paste into your server config
├── DEPLOY.md                    # Step-by-step deployment guide
│
├── db/
│   └── database.js              # SQLite init, table creation, connection singleton
│
├── scripts/
│   ├── seed-bts.js              # Seed script for BTS
│   ├── seed-psb.js              # Seed script for Pet Shop Boys
│   ├── bts_complete_discography.csv
│   └── psb_complete_discography.csv
│
├── views/
│   ├── index.ejs                # Landing page
│   ├── artist.ejs               # Artist gallery + filters
│   └── 404.ejs
│
├── public/
│   ├── css/
│   │   ├── main.css             # Shared styles, CSS variables, dark/light themes
│   │   └── artist.css           # Gallery cards, filters, pagination, responsive grid
│   └── js/
│       ├── theme.js             # Dark/light toggle, localStorage persistence
│       └── artist.js            # Dropdowns, view toggle, search debounce, art fallback
│
└── .github/
    └── workflows/
        └── ci.yml               # GitHub Actions: lint, CSV validation, DB integrity
```

---

## Database schema

```sql
CREATE TABLE artists (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT UNIQUE NOT NULL,   -- URL identifier e.g. "bts", "petshopboys"
  name         TEXT NOT NULL,
  description  TEXT,
  country      TEXT,
  genre        TEXT,
  formed_year  INTEGER,
  image_url    TEXT,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE songs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_id     INTEGER NOT NULL REFERENCES artists(id),
  song_name     TEXT NOT NULL,
  album         TEXT,
  sung_by       TEXT,
  year_released INTEGER,
  highlights    TEXT,
  art_url       TEXT,    -- Cached iTunes CDN URL
  art_fetched   INTEGER DEFAULT 0,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## Adding a new artist

### Step 1 — Prepare your CSV

Create a file in `scripts/` named `yourartist_discography.csv` with these columns:

```
song_name,album,sung_by,year_released,highlights
```

**Rules:**

- Wrap all values in double quotes
- Escape internal double quotes by doubling them: `"He said ""hello"""`
- `sung_by` — use the group name for group tracks, member name(s) for solos/units
- `year_released` — four-digit year only
- `highlights` — one or two sentences maximum; keep it factual

**Example rows:**

```csv
"Dancing Queen","Arrival","ABBA",1976,"Written as a tribute to Queen Elizabeth II; became their signature song and only US #1"
"Waterloo","Waterloo","ABBA",1974,"Eurovision Song Contest winner 1974; launched them internationally"
"The Winner Takes It All","Super Trouper","ABBA",1980,"Written by Bjorn about his divorce from Agnetha; considered their finest ballad"
```

### Step 2 — Create a seed script

Copy `scripts/seed-bts.js` to `scripts/seed-yourartist.js` and update:

```javascript
// Change the artist details
db.prepare(`INSERT OR IGNORE INTO artists ...`).run(
  "abba", // slug — used in the URL: /everysong/abba
  "ABBA", // display name
  "Swedish pop group...", // description shown on the artist page
  "Sweden", // country — used for flag emoji
  "Pop, Disco, Dance-pop", // genre tags
  1972, // formed year
);

// Change the CSV filename
const csvPath = path.join(__dirname, "abba_discography.csv");

// Change the iTunes search artist name
const art = await fetchArt("ABBA", album);
```

### Step 3 — Add an npm script (optional)

In `package.json`:

```json
"scripts": {
  "seed:abba": "node --experimental-sqlite scripts/seed-abba.js"
}
```

### Step 4 — Run on your server

```bash
node --experimental-sqlite scripts/seed-yourartist.js
pm2 restart everysong
```

The artist will appear automatically on the landing page at `/everysong/yourslug`.

---

## URL structure

```
/everysong/                          Landing page — all artists
/everysong/:slug                     Artist gallery (e.g. /everysong/bts)
/everysong/:slug?search=dynamite     Search
/everysong/:slug?year=2020           Filter by year
/everysong/:slug?album=Wings         Filter by album
/everysong/:slug?sung_by=Jimin       Filter by performer
/everysong/:slug?sort=year_desc      Sort (year_asc, year_desc, name_asc, name_desc, album_asc)
/everysong/:slug?page=2              Pagination
/everysong/api/art                   Internal iTunes art fetch endpoint
```

All filter parameters stack — e.g. `?year=2020&sung_by=Jimin&sort=name_asc` works.

---

## Deploying to your own server

See [DEPLOY.md](./DEPLOY.md) for the full step-by-step guide. The short version:

**Requirements:**

- Node.js 22+ (for built-in `node:sqlite`)
- nginx (for reverse proxy)
- PM2 (for process management)

```bash
# 1. Clone the repo
git clone https://github.com/yourusername/everysong.git
cd everysong

# 2. Install dependencies
npm install --ignore-scripts

# 3. Seed the database
npm run seed:all

# 4. Start with PM2
pm2 start ecosystem.config.js
pm2 save && pm2 startup

# 5. Add nginx location block (see nginx-snippet.conf)
sudo nginx -t && sudo systemctl reload nginx
```

**Note:** The app runs on port `3010` by default. Set `PORT` environment variable to change it. The `--ignore-scripts` flag avoids native module compilation — this project uses only pure-JS dependencies plus Node's built-in sqlite.

---

## Album art

Album art is sourced from the **iTunes Search API** at runtime — no images are stored locally. On server startup, a background job fetches art URLs for any albums not yet cached in the database and stores the CDN URL. Subsequent page loads serve the cached URL directly.

If the iTunes API has no art for an album, a styled placeholder is shown with the album name.

---

## CI

GitHub Actions runs on every push to `main` and every pull request:

1. **Syntax check** — validates all JS files with `node --check`
2. **CSV validation** — parses both discography CSVs and asserts minimum row counts
3. **DB integrity** — seeds BTS data into an in-memory test DB and runs key queries

See `.github/workflows/ci.yml`.

---

## What's not included (deliberately)

- **No user accounts** — read-only public catalogue, no auth needed
- **No external database** — SQLite is appropriate for this use case
- **No React/Vue/bundler** — SSR EJS keeps the stack simple and fast
- **No image storage** — iTunes CDN handles art delivery
- **No web scraping** — all discography data was compiled manually from Wikipedia, official fan wikis, and Discogs, then stored in version-controlled CSVs

---

## Roadmap

- [ ] Admin UI for adding/editing songs without re-running seed scripts
- [ ] Artist-level image upload
- [ ] "Did you know?" random song highlight on landing page
- [ ] Export filtered results as CSV
- [ ] Multiple language support for song names (Korean/Japanese originals alongside English translations)
- [ ] Pet Shop Boys Further Listening bonus disc gap-fill

---

## Built by

**Bernie Png** — [berniepng.com](https://berniepng.com)

Part of an ongoing series of portfolio projects built during the NTU Advanced Professional Certificate in Data Science and AI, documenting a pivot from digital marketing leadership into AI/data engineering and technical education.

---

## License

MIT — use it, fork it, extend it. If you add an artist, consider opening a PR.
