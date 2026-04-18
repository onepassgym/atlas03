# 🏗️ Atlas05 — Architecture Reference

> **Living document.** Keep this updated as modules change.  
> Run `node scripts/genArchSnapshot.js` to auto-regenerate the inventory sections.  
> Last manual review: **2026-04-18**

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Process Architecture](#process-architecture)
3. [Directory Map](#directory-map)
4. [Module Reference](#module-reference)
   - [API Layer](#api-layer)
   - [Scraper Engine](#scraper-engine)
   - [Queue System](#queue-system)
   - [Database Layer](#database-layer)
   - [Services](#services)
   - [Media Pipeline](#media-pipeline)
   - [Utilities](#utilities)
   - [Configuration](#configuration)
5. [Data Models](#data-models)
6. [API Route Inventory](#api-route-inventory)
7. [Data Flow Diagrams](#data-flow-diagrams)
8. [Configuration Reference](#configuration-reference)
9. [Infrastructure](#infrastructure)
10. [Known Technical Debt](#known-technical-debt)
11. [Conventions & Patterns](#conventions--patterns)
12. [Changelog](#changelog)

---

## System Overview

Atlas05 is an **API-first Google Maps fitness venue scraper** that operates as two separate Node.js processes backed by MongoDB and Redis.

| Component | Technology | Purpose |
|-----------|-----------|---------|
| API Server | Express 4 + Swagger | REST API for crawl management, gym data, scheduling |
| Worker | BullMQ Worker | Processes crawl jobs using Playwright |
| Database | MongoDB 7 (Mongoose 8) | Gym data, reviews, photos, crawl jobs, change logs |
| Queue | Redis 7 + BullMQ 5 | Job queue with priority, retry, cancellation |
| Scraper | Playwright + Stealth Plugin | Headless Chrome automation for Google Maps |
| Media | Sharp + Axios | Photo download, resize, thumbnail generation |
| Scheduler | node-cron | Multi-tier automated crawl scheduling |

**Key design decisions:**
- **Dual-write architecture** — raw scraped data preserved alongside normalized/indexed data
- **Separate worker process** — API never blocks on scraping; jobs are decoupled via Redis
- **6-tier deduplication** — prevents duplicate gym records across re-crawls
- **Redis-backed cancellation** — worker polls cancel flags every URL for instant, graceful stop

---

## Process Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         API SERVER (server.js)                      │
│                                                                     │
│  Express App                                                        │
│  ├── indexRoutes     GET /           GET /health                    │
│  ├── crawlRoutes     POST|GET /api/crawl/*                         │
│  ├── gymRoutes       GET|PATCH /api/gyms/*                         │
│  ├── systemRoutes    GET|POST|DELETE /api/system/*                  │
│  ├── swagger-ui      GET /api-docs                                 │
│  └── static media    GET /media/*                                  │
│                                                                     │
│  node-cron scheduler (5 cron jobs)                                 │
│  └── Produces BullMQ jobs → Redis                                  │
└──────────────────┬──────────────────────────────────────────────────┘
                   │  BullMQ Queue (atlas05-crawl)
                   │  Redis 7 (:6847)
┌──────────────────▼──────────────────────────────────────────────────┐
│                       WORKER (queue/worker.js)                      │
│                                                                     │
│  BullMQ Worker (concurrency: 2)                                    │
│  ├── city-crawl      → processCityJob()                            │
│  │   ├── searchGymsInCity() per category (16 categories)           │
│  │   ├── scrapeGymDetail() per URL                                 │
│  │   ├── processGym() → upsertGym()                               │
│  │   └── downloadAllMedia()                                        │
│  └── gym-name-crawl  → processGymNameJob()                         │
│      └── Same pipeline, single search, max 15 results              │
│                                                                     │
│  Graceful shutdown: SIGTERM/SIGINT → finish current gym → exit     │
└──────────────────┬──────────────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────────────┐
│                    MONGODB 7 (atlas06 / atlas05 DB)                 │
│                                                                     │
│  Collections:                                                       │
│  ├── gyms              Main venue records (194-line schema)         │
│  ├── gym_reviews       Separate review documents per gym            │
│  ├── gym_photos        Separate photo/media records per gym         │
│  ├── gym_crawl_meta    Crawl status tracking per gym                │
│  ├── gym_crawl_jobs    Job status, progress, errors                 │
│  ├── gym_categories    Normalized category lookup                   │
│  ├── gym_amenities     Normalized amenity lookup                    │
│  ├── gym_place_types   Google place type mapping                    │
│  └── gymChangeLogs     Field-level change audit trail               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Directory Map

```
atlas05/
├── config/
│   ├── index.js                 # Centralized config (env-aware dev/prod)
│   └── schedule.json            # City crawl schedule + staleness thresholds
├── docs/
│   └── database_structure.md    # DB schema reference
├── migration/
│   ├── index.js                 # Migration runner
│   ├── createIndexes.js         # Index creation migration
│   ├── migrateGym.js            # Gym schema migration
│   ├── seedStaticData.js        # Category/amenity seed data
│   └── logger.js                # Migration-specific logger
├── scripts/
│   ├── queueCities.js           # CLI: queue cities from JSON
│   ├── retryFailed.js           # CLI: retry failed/incomplete jobs
│   ├── dbStats.js               # CLI: print DB statistics
│   ├── clearQueue.js            # CLI: obliterate BullMQ queue
│   ├── renameCollections.js     # CLI: rename MongoDB collections
│   ├── cities-india.json        # City list for bulk queueing
│   └── cities-ncr.json          # NCR-specific city list
├── src/
│   ├── server.js                # Express app entry point
│   ├── api/
│   │   ├── indexRoutes.js       # GET / (docs), GET /health
│   │   ├── crawlRoutes.js       # Crawl CRUD + cancel + retry
│   │   ├── gymRoutes.js         # Gym listing, search, geo, export
│   │   └── systemRoutes.js      # Logs, schedule, triggers
│   ├── config/
│   │   └── swagger.js           # OpenAPI 3.0 spec config
│   ├── db/
│   │   ├── connection.js        # Mongoose connect + auto-reconnect
│   │   ├── ensureIndexes.js     # Imperative index creation on startup
│   │   ├── gymModel.js          # Gym schema (194 lines, 11 indexes)
│   │   ├── reviewModel.js       # Review schema + relative-date parser
│   │   ├── photoModel.js        # Photo/media record schema
│   │   ├── crawlMetaModel.js    # Per-gym crawl tracking
│   │   ├── crawlJobModel.js     # Job status + progress schema
│   │   ├── categoryModel.js     # Normalized category lookup
│   │   ├── amenityModel.js      # Normalized amenity lookup
│   │   ├── placeTypeModel.js    # Google place type mapping
│   │   ├── gymChangeLogModel.js # Field-level mutation audit
│   │   └── upsertGym.js         # 527-line dedup + insert/update engine
│   ├── scraper/
│   │   ├── googleMapsScraper.js # Playwright automation (390 lines)
│   │   └── gymProcessor.js      # Raw→structured data transform
│   ├── queue/
│   │   ├── queues.js            # BullMQ queue + cancel via Redis
│   │   └── worker.js            # BullMQ worker + job handlers
│   ├── services/
│   │   └── schedulerService.js  # Cron jobs + staleness + enrichment
│   ├── media/
│   │   └── downloader.js        # Photo download + Sharp resize
│   └── utils/
│       ├── logger.js            # Winston + daily rotate
│       ├── apiUtils.js          # ok(), err(), validate() helpers
│       └── dedup.js             # Standalone dedup (partially deprecated)
├── media/                       # Runtime: downloaded gym photos
├── logs/                        # Runtime: rotating log files
├── Dockerfile                   # node:20-slim + Chromium
├── docker-compose.yml           # 4-service stack (API, Worker, Mongo, Redis)
├── DEPLOY.md                    # Step-by-step VPS deployment guide
├── ARCHITECTURE.md              # ← THIS FILE
├── ROADMAP.md                   # Feature upgrade roadmap
└── README.md                    # Quick start + feature summary
```

---

## Module Reference

### API Layer

| File | Routes | Responsibility |
|------|--------|---------------|
| `indexRoutes.js` | `GET /`, `GET /health` | Service info, health check |
| `crawlRoutes.js` | 10 endpoints under `/api/crawl` | Queue cities/gyms, track jobs, cancel, retry |
| `gymRoutes.js` | 6 endpoints under `/api/gyms` | List, filter, geo-search, export, detail, patch |
| `systemRoutes.js` | 8 endpoints under `/api/system` | Logs, schedule CRUD, manual triggers |

**Pattern:** All routes use `express-validator` for input → `validate()` guard → `try/catch` → `ok()`/`err()` response helpers.

### Scraper Engine

| File | Exports | Responsibility |
|------|---------|---------------|
| `googleMapsScraper.js` | `BrowserManager`, `searchGymsInCity()`, `scrapeGymDetail()`, `FITNESS_CATEGORIES` | Playwright-based Google Maps automation |
| `gymProcessor.js` | `processGym()` | Transforms raw scraped data → structured document, downloads media, calls `upsertGym()` |

**Key constants:**
- `FITNESS_CATEGORIES` — array of 16 search terms (gym, yoga studio, crossfit, etc.)
- `USER_AGENTS` — pool of 15 user-agent strings for rotation
- Review scraping: up to **150 reviews** per gym
- Photo scraping: up to **80 photos** per gym

### Queue System

| File | Exports | Responsibility |
|------|---------|---------------|
| `queues.js` | `addCityJob()`, `addGymNameJob()`, `getQueueStats()`, `requestCancelJob()`, `isJobCancelled()`, etc. | BullMQ queue management + Redis cancel flags |
| `worker.js` | (auto-starts) | Processes `city-crawl` and `gym-name-crawl` jobs |

**Queue name:** `atlas05-crawl`  
**Cancellation:** Redis key `atlas05:cancel:{jobId}` with 1-hour TTL

### Database Layer

| Model | Collection | Key Fields | Indexes |
|-------|-----------|-----------|---------|
| `Gym` | `gyms` | name, slug, placeId, geoLocation, location, rating, contact, openingHours, atlas05 platform fields | 11 indexes incl. 2dsphere, text search |
| `Review` | `gym_reviews` | gymId, reviewId (unique), authorName, rating, text, publishedAt | gymId, reviewId |
| `Photo` | `gym_photos` | gymId, publicUrl (unique), localPath, thumbnailUrl, dimensions | gymId, publicUrl |
| `CrawlMeta` | `gym_crawl_meta` | gymId (unique), firstCrawledAt, lastCrawledAt, dataCompleteness | gymId, jobId |
| `CrawlJob` | `gym_crawl_jobs` | jobId (unique), type, input, status, progress, gymIds, jobErrors | status, createdAt |
| `Category` | `gym_categories` | slug (unique), label | slug |
| `Amenity` | `gym_amenities` | slug (unique), label, icon | slug |
| `PlaceType` | `gym_place_types` | slug (unique), label, googleType | slug |
| `GymChangeLog` | `gymChangeLogs` | gymId, field, oldValue, newValue, changedAt, source | gymId, changedAt |

### Upsert Engine (`upsertGym.js` — 527 lines)

This is the **most critical file** in the system. It handles:

1. **6-tier duplicate lookup:** slug → googleMapsUrl → placeId → geo+name (50m, Jaccard≥0.50) → phone → name+address
2. **INSERT path:** Creates gym, inserts reviews/photos/crawlMeta in parallel
3. **UPDATE path:** Diffs tracked fields (name, address, contact), merges reviews, overwrites safe fields, writes change logs
4. **Normalized reference resolution:** Auto-creates Category, Amenity, PlaceType lookup records

**Safe overwrite fields** (always replaced on re-crawl):
```
rating, ratingBreakdown, openingHours, isOpenNow, coverPhoto, photos, totalPhotos,
description, priceLevel, amenities, highlights, offerings, serviceOptions,
accessibility, permanentlyClosed, temporarilyClosed, claimedByOwner,
categories, primaryType, types, lat, lng
```

**Tracked fields** (diffs logged to GymChangeLog):
```
name, address, contact.phone, contact.email, contact.website
```

### Services

| File | Exports | Responsibility |
|------|---------|---------------|
| `schedulerService.js` | `startScheduler()`, `runScheduledCrawl()`, `queueStaleGyms()`, `queueIncompleteGyms()`, `queueCity()`, config helpers | 5 cron jobs + manual triggers |

**Cron schedule:**
| Job | Cron | IST Time | Description |
|-----|------|----------|-------------|
| Weekly cities | `30 20 * * 6` | Sunday 02:00 AM | All `frequency: "weekly"` cities |
| Biweekly cities | `30 21 * * 6` | Sunday 03:00 AM | 1st & 3rd week only |
| Monthly cities | `30 22 * * 6` | Sunday 04:00 AM | 1st week only |
| Staleness check | `30 21 * * 2` | Wednesday 03:00 AM | Re-crawl gyms not updated in >N days |
| Enrichment | `30 21 * * 4` | Friday 03:00 AM | Re-crawl gyms below completeness threshold |

### Media Pipeline

| File | Exports | Responsibility |
|------|---------|---------------|
| `downloader.js` | `downloadImage()`, `downloadAllMedia()` | Download from Google CDN, resize via Sharp to JPEG |

**Output:** `media/photos/{gym-slug}/{uuid}.jpg` + `media/thumbnails/th_{uuid}.jpg`  
**Concurrency:** 4 parallel downloads per gym  
**Thumbnails:** 400×300, quality 65

### Utilities

| File | Exports | Responsibility |
|------|---------|---------------|
| `logger.js` | Winston logger instance | Console + daily rotating file (`app-*.log`, `error-*.log`) |
| `apiUtils.js` | `ok()`, `err()`, `validate()` | Standardized API responses + express-validator guard |
| `dedup.js` | `findDuplicate()`, `mergeGymData()` (deprecated), `jaccardSim()` | Legacy dedup helpers (mostly superseded by `upsertGym.js`) |

### Configuration

| File | Responsibility |
|------|---------------|
| `config/index.js` | Environment-aware config builder (dev/prod auto-selection) |
| `config/schedule.json` | 21 cities with frequency/priority + staleness/enrichment thresholds |
| `.env` | Port, DB URIs, Redis, scraper behavior, rate limits |
| `src/config/swagger.js` | OpenAPI 3.0 spec generation from JSDoc annotations |

---

## API Route Inventory

### Crawl Routes (`/api/crawl`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/city` | None | Queue a city-wide crawl (dedup guard, force override) |
| `POST` | `/gym` | None | Queue a gym-name crawl |
| `POST` | `/batch` | None | Queue multiple cities at once |
| `GET` | `/status/:jobId` | None | Job status + progress + queue info |
| `GET` | `/jobs` | None | List all jobs (filter by status, paginated) |
| `GET` | `/queue/stats` | None | BullMQ queue counts |
| `GET` | `/categories` | None | List all 16 fitness categories |
| `POST` | `/cancel/:jobId` | None | Cancel queued/running job |
| `POST` | `/queue/clear` | None | ⚠️ Obliterate entire queue |
| `POST` | `/retry/failed` | None | Re-queue all failed/partial city jobs |
| `POST` | `/retry/incomplete` | None | Re-queue gyms below completeness threshold |
| `DELETE` | `/jobs/:jobId` | None | Delete a job record |

### Gym Routes (`/api/gyms`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/` | None | List gyms (city, category, minRating, search, sort, paginated) |
| `GET` | `/nearby` | None | Geospatial search (lat, lng, radiusKm) |
| `GET` | `/stats` | None | Aggregate stats (total, by category, top cities, avg rating) |
| `GET` | `/export` | None | Stream all gyms as JSON (cursor-based) |
| `GET` | `/:id` | None | Full gym detail with populated reviews/photos/crawlMeta |
| `PATCH` | `/:id` | None | Update `atlas05` platform fields only |

### System Routes (`/api/system`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/logs` | None | List log files or tail a specific log |
| `GET` | `/logs/latest` | None | Tail the most recent `app-*.log` |
| `GET` | `/schedule` | None | View full schedule config |
| `POST` | `/schedule` | None | Update schedule config |
| `POST` | `/schedule/city` | None | Add/update a city in schedule |
| `DELETE` | `/schedule/city` | None | Remove a city from schedule |
| `POST` | `/schedule/trigger` | None | Manually trigger crawl by frequency |
| `POST` | `/schedule/trigger/stale` | None | Trigger staleness re-crawl |
| `POST` | `/schedule/trigger/enrichment` | None | Trigger enrichment re-crawl |

---

## Data Flow Diagrams

### City Crawl Flow

```
API: POST /api/crawl/city { cityName, categories }
  │
  ├── Dedup check: hasActiveJob(cityName)?
  ├── CrawlJob.create() → MongoDB (status: queued)
  └── addCityJob() → BullMQ Redis queue
        │
        ▼
WORKER: processCityJob()
  │
  ├── BrowserManager.launch() → Headless Chromium
  ├── FOR each category (16):
  │   └── searchGymsInCity(page, city, category)
  │       └── Google Maps search → scroll → collect URLs
  │
  ├── Deduplicate URLs (Set)
  │
  └── FOR each URL:
      ├── Check: shouldStop(jobId)? (Redis cancel flag)
      ├── scrapeGymDetail(page, url)
      │   ├── Navigate to place page
      │   ├── Extract: name, rating, address, phone, hours, etc.
      │   ├── scrapeReviews(page) → up to 150 reviews
      │   └── scrapePhotosTab(page) → up to 80 photos
      │
      └── processGym(scraped, cityName, jobId)
          ├── mapCategory() → normalize category string
          ├── downloadAllMedia() → save photos locally
          └── upsertGym()
              ├── findExistingGym() → 6-tier dedup
              ├── resolveCategory/Amenities/PlaceType
              ├── INSERT or UPDATE path
              ├── mergeReviews() → separate collection
              ├── upsertPhotos() → separate collection
              ├── upsertCrawlMeta() → separate collection
              └── writeChangeLogs() → audit trail
```

### Upsert Decision Tree

```
findExistingGym(data)
  │
  ├── Tier 1: slug match?        ──→ FOUND (exact)
  ├── Tier 2: googleMapsUrl?     ──→ FOUND (exact)
  ├── Tier 3: placeId?           ──→ FOUND (exact)
  ├── Tier 4: geo+name?          ──→ FOUND if within 50m AND Jaccard ≥ 0.50
  ├── Tier 5: phone?             ──→ FOUND if last-10-digits match
  ├── Tier 6: name+address?      ──→ FOUND if exact name + partial address
  └── null                       ──→ INSERT new gym
       
If FOUND → UPDATE path:
  ├── diff tracked fields → GymChangeLog
  ├── merge reviews → gym_reviews collection
  ├── overwrite safe fields → gym document
  └── skip if nothing actually changed
```

---

## Configuration Reference

### Environment Variables

| Variable | Default (dev) | Default (prod) | Description |
|----------|--------------|----------------|-------------|
| `NODE_ENV` | `development` | `production` | Environment mode |
| `PORT` | `8747` | `8747` | API server port |
| `DEV_MONGODB_URI` | `mongodb://127.0.0.1:27328/atlas06` | — | Dev MongoDB URI |
| `PROD_MONGODB_URI` | — | `mongodb://147.79.71.238:27328/atlas06` | Prod MongoDB URI |
| `DEV_REDIS_HOST` | `127.0.0.1` | — | Dev Redis host |
| `DEV_REDIS_PORT` | `6847` | — | Dev Redis port |
| `SCRAPER_CONCURRENCY` | `2` | `3` | Parallel scrape jobs |
| `SCRAPER_DELAY_MIN` | `1500` | — | Min delay between URLs (ms) |
| `SCRAPER_DELAY_MAX` | `4000` | — | Max delay between URLs (ms) |
| `SCRAPER_TIMEOUT` | `30000` | — | Page load timeout (ms) |
| `SCRAPER_MAX_RETRIES` | `3` | — | Retry attempts per URL |
| `SCRAPER_HEADLESS` | `true` | `true` | Headless browser mode |
| `DEDUP_RADIUS_METERS` | `50` | — | Geo dedup radius |
| `RATE_LIMIT_WINDOW_MS` | `60000` | — | Rate limit window |
| `RATE_LIMIT_MAX` | `100` | — | Max requests per window |
| `LOG_LEVEL` | `info` | `warn` | Winston log level |

### Schedule Config (`config/schedule.json`)

| Key | Type | Description |
|-----|------|-------------|
| `defaultFrequency` | `string` | Default crawl frequency for new cities |
| `defaultCron` | `string` | Cron expression for default schedule |
| `timezone` | `string` | Timezone for cron evaluation |
| `cities[].name` | `string` | Full city name for Google Maps search |
| `cities[].frequency` | `weekly\|biweekly\|monthly` | Crawl frequency |
| `cities[].priority` | `number` | Priority level (1=highest) |
| `staleness.enrichmentThresholdDays` | `number` | Days before a gym is considered stale |
| `staleness.maxStaleDays` | `number` | Max days before forced re-crawl |
| `staleness.batchSize` | `number` | Max stale gyms per batch |
| `enrichment.enabled` | `boolean` | Enable/disable enrichment |
| `enrichment.completenessThreshold` | `number` | Min completeness % |
| `enrichment.batchSize` | `number` | Max enrichment gyms per batch |

---

## Infrastructure

### Docker Services

| Service | Image | Ports | Health Check |
|---------|-------|-------|-------------|
| `api` | Custom (Dockerfile) | `8747:8747` | `GET /health` |
| `worker` | Custom (Dockerfile) | None | None |
| `mongo` | `mongo:7.0` | `27328:27017` | `mongosh ping` |
| `redis` | `redis:7.2-alpine` | `6847:6379` | `redis-cli ping` |

### Production VPS

- **Host:** Hostinger VPS (`147.79.71.238`)
- **Domain:** `atlas.onepassgym.com`
- **SSL:** Let's Encrypt via Certbot
- **Reverse proxy:** Nginx → `:8747`
- **Media serving:** Nginx static files (bypasses Node.js)

---

## Known Technical Debt

| ID | Severity | Description | File(s) |
|----|----------|-------------|---------|
| TD-01 | 🔴 Critical | VPS credentials in `.env` (password in plaintext) | `.env:25` |
| TD-02 | 🟡 Medium | `.env` references `atlas06` DB but project is `atlas05` | `.env`, `config/index.js` |
| TD-03 | 🟡 Medium | Stray `{src` directory at project root (broken mkdir) | Project root |
| TD-04 | 🟡 Medium | `dedup.js` `mergeGymData()` is deprecated but still exported | `src/utils/dedup.js:78` |
| TD-05 | 🟡 Medium | `upsertGym.js` always writes `$set` even when nothing changed | `src/db/upsertGym.js:461` |
| TD-06 | 🟠 Low | No API authentication — destructive endpoints are open | All route files |
| TD-07 | 🟠 Low | `reviews` collection name in ensureIndexes.js doesn't match model's `gym_reviews` | `src/db/ensureIndexes.js:24` |
| TD-08 | 🟠 Low | `ensureIndexes.js` only indexes 3 collections but there are 9 | `src/db/ensureIndexes.js` |

---

## Conventions & Patterns

### API Response Format
```json
// Success
{ "success": true, "message": "...", ...data }

// Error
{ "success": false, "error": "..." }

// Validation Error
{ "success": false, "errors": [{ "msg": "...", "param": "...", "location": "body" }] }
```

### Route Handler Pattern
```javascript
router.METHOD('/path',
  validator1(),          // express-validator middleware
  validator2(),
  async (req, res) => {
    if (validate(req, res)) return;  // guard clause returns early on validation failure
    try {
      // business logic
      ok(res, { data }, statusCode);
    } catch (e) { err(res, e.message); }
  }
);
```

### Mongoose Model Pattern
- Schemas defined in `src/db/{name}Model.js`
- Indexes declared both in schema AND imperatively in `ensureIndexes.js`
- Virtual populations used for `reviews`, `photos`, `crawlMeta` on Gym model
- All models use explicit `collection` names

### Slug Generation
- Uses `slugify` library with `{ lower: true, strict: true }`
- Pattern: `{name}-{areaName}` → `golds-gym-andheri-mumbai`

### Logging
- Winston with daily rotation (`app-*.log`, `error-*.log`)
- Console colorized, file plain text
- Emoji prefixes for visual scanning: 🔍 search, ✅ success, ❌ error, ⏸ pause, 📅 schedule

---

## Changelog

| Date | Author | Changes |
|------|--------|---------|
| 2026-04-18 | Antigravity | Initial architecture document created |
| | | Add new rows above this line |
