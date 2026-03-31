# 🏋️ Atlas05 Scraper

Google Maps fitness venue scraper for the **Atlas05** platform.  
No API key required · Node 20 · MongoDB 7 · Redis · Playwright

---

## Project Structure

```
atlas05-scraper/
├── .env                         ← pre-filled, edit MongoDB/Redis if needed
├── config/index.js              ← single config source (reads .env)
├── src/
│   ├── server.js                ← Express API (port 8747)
│   ├── api/
│   │   ├── crawlRoutes.js       ← POST /api/crawl/*
│   │   └── gymRoutes.js         ← GET  /api/gyms/*
│   ├── scraper/
│   │   ├── googleMapsScraper.js ← Playwright engine (search + detail + photos + reviews)
│   │   └── gymProcessor.js      ← dedup check → upsert to MongoDB
│   ├── queue/
│   │   ├── queues.js            ← Bull queue definitions
│   │   └── worker.js            ← job processor (run separately)
│   ├── db/
│   │   ├── connection.js        ← Mongoose with auto-reconnect
│   │   ├── gymModel.js          ← full Gym schema
│   │   └── crawlJobModel.js     ← job tracking schema
│   ├── media/
│   │   └── downloader.js        ← downloads + sharp-processes photos
│   └── utils/
│       ├── logger.js            ← Winston rotating logs
│       └── dedup.js             ← 3-tier duplicate detection
├── scripts/
│   ├── cities-india.json        ← ready-made city list
│   ├── queueCities.js           ← bulk-queue cities from JSON or CLI
│   ├── retryFailed.js           ← re-queue failed/incomplete jobs
│   └── dbStats.js               ← print stats + optional export
├── media/                       ← downloaded photos (gitignored)
├── logs/                        ← rotating logs (gitignored)
├── Dockerfile
└── docker-compose.yml
```

---

## Quick Start — Local (No Docker)

### Prerequisites
- Node.js 20+
- MongoDB 7 running locally **or** a MongoDB Atlas URI
- Redis running locally **or** a managed Redis

### 1. Install

```bash
npm install
npm run setup        # installs Chromium for Playwright
```

### 2. Configure

The `.env` is already included with **non-conflicting ports** so this project
won't clash with other things you're running:

| Service | Port | Avoids |
|---------|------|--------|
| API | **8747** | 3000, 8000, 8080 |
| MongoDB | **27328** | 27017 |
| Redis | **6847** | 6379 |

Edit `.env` only if you need to point at Atlas or a remote Redis.

### 3. Start MongoDB + Redis on non-default ports

```bash
# MongoDB on port 27327
docker run -d -p 27328:27017 --name opg-mongo mongo:7.0

# Redis on port 6847
docker run -d -p 6847:6379 --name opg-redis redis:7.2-alpine
```

### 4. Run (2 terminals)

```bash
# Terminal 1 — API server
npm run dev

# Terminal 2 — Queue worker
npm run dev:worker
```

API is live at **http://localhost:8747**

> **NCR auto-queue:** On first startup, **Delhi, Ghaziabad, Gurugram, and Noida**
> are automatically queued. After that, they re-crawl every **Sunday at 2:00 AM IST**.

> **VPS deployment:** See [DEPLOY.md](./DEPLOY.md) for full guide to map this to
> `atlas.onepassgym.com` with Nginx + SSL.

---

## Quick Start — Docker (Recommended for VPS)

```bash
# Everything starts: API, Worker, MongoDB, Redis
docker-compose up -d

# Check logs
docker-compose logs -f api
docker-compose logs -f worker
```

---

## API Usage

### Trigger a city crawl

```bash
curl -X POST http://localhost:8747/api/crawl/city \
  -H "Content-Type: application/json" \
  -d '{"cityName": "Mumbai"}'
```

Response:
```json
{
  "success": true,
  "jobId": "uuid-here",
  "categoryCount": 16,
  "trackAt": "/api/crawl/status/uuid-here"
}
```

### Crawl by gym name (direct)

```bash
curl -X POST http://localhost:8747/api/crawl/gym \
  -H "Content-Type: application/json" \
  -d '{"gymName": "Gold Gym Andheri Mumbai"}'
```

### Queue multiple cities at once

```bash
curl -X POST http://localhost:8747/api/crawl/batch \
  -H "Content-Type: application/json" \
  -d '{"cities": ["Mumbai", "Delhi", "Bangalore"]}'
```

### Check job status

```bash
curl http://localhost:8747/api/crawl/status/<jobId>
```

### Clear the queue (instantly)

```bash
curl -X POST http://localhost:8747/api/crawl/queue/clear
```
*Note: This obliterates the Redis queue and marks all currently 'queued' or 'running' jobs in the DB as 'failed'.*

### Check queue stats

```bash
curl http://localhost:8747/api/crawl/queue/stats
```

### Query scraped gyms

```bash
# List gyms in Mumbai with rating ≥ 4
curl "http://localhost:8747/api/gyms?city=Mumbai&minRating=4&limit=20"

# Find gyms near a coordinate
curl "http://localhost:8747/api/gyms/nearby?lat=19.0760&lng=72.8777&radiusKm=3"

# Full gym detail (all reviews, photos)
curl "http://localhost:8747/api/gyms/<mongoId>"

# DB stats
curl "http://localhost:8747/api/gyms/stats"
```

### Check Logs

```bash
# List all available log files
curl "http://localhost:8747/api/system/logs"

# Tail the latest app log (last 100 lines)
curl "http://localhost:8747/api/system/logs/latest"

# Tail a specific file
curl "http://localhost:8747/api/system/logs?file=app-2026-03-21.log&tail=200"
```

### Utility scripts

```bash
# Queue all 20 Indian cities
npm run queue:cities -- --file scripts/cities-india.json

# Queue specific cities from CLI
npm run queue:cities -- --cities "Delhi,Chennai,Pune"

# Re-queue all failed/partial jobs
npm run retry:failed

# Re-queue gyms with completeness < 50%
npm run retry:incomplete

# Print database stats
npm run db:stats

# Export all gyms to gyms-export.json
npm run db:export
```

---

## What Gets Scraped

For every gym:

| Field | Description |
|-------|-------------|
| `name` | Gym name |
| `placeId` | Google Maps Place ID |
| `lat` / `lng` / `geoLocation` | Coordinates (2dsphere indexed) |
| `address` | Full address |
| `contact.phone` | Phone number |
| `contact.website` | Website URL |
| `rating` | Google rating (0–5) |
| `totalReviews` | Total review count |
| `ratingBreakdown` | ★1–★5 counts |
| `reviews[]` | Up to 150 reviews with author, text, rating, date, reply |
| `openingHours[]` | Day-by-day open/close times |
| `photos[]` | All photos — originalUrl, localPath, publicUrl, thumbnail, dimensions |
| `amenities.raw[]` | Raw amenity strings |
| `highlights[]` | Feature highlights |
| `serviceOptions[]` | Service options |
| `permanentlyClosed` | Boolean |
| `crawlMeta.dataCompleteness` | 0–100% completeness score |
| `atlas05.*` | Platform fields: isListed, isVerified, isPartner |

---

## Fitness Categories (16 total, all searched per city)

gym · fitness center · yoga studio · crossfit · pilates studio · martial arts gym · boxing gym · dance fitness studio · personal training studio · health club · sports club · functional training gym · strength training gym · cycling studio · swimming club · zumba class

---

## Duplicate Detection & Smart Upsert (5-tier)

1. **slug match** — exact URL slug match → highest confidence
2. **googleMapsUrl match** — exact URL match → high confidence
3. **placeId match** — exact Google Place ID → high confidence
4. **lat/lng within 50m + name similarity ≥ 45%** → medium/high confidence
5. **exact name + partial address** → medium confidence

### Smart Update Logic
When a duplicate is found (on re-running the same city queue):
- **Reviews — MERGE**: Fresh reviews are compared against existing ones (by `reviewId`). Only brand new reviews are added to the separate `reviews` collection.
- **Tracked Fields — DIFF**: Changes to `name`, `address`, and `contact` (phone, website, email) are logged to the `gymChangeLogs` collection.
- **Safe Overwrite — REFRESH**: Dynamic fields like `rating`, `openingHours`, `isOpenNow`, and `photos` are always updated from the latest crawl.
- **crawlMeta**: `lastCrawledAt` and `crawlVersion` are updated, but `firstCrawledAt` is preserved.
- **GeoJSON**: `location` field is automatically rebuilt from the latest lat/lng.

---

## Edge Cases Handled

| Scenario | Handling |
|----------|----------|
| Bot detection | Random delays (1.5–4s), realistic Chrome UA, human-like scroll |
| Pagination | Auto-scroll until "end of list" detected |
| Page load timeout | 30s timeout + up to 3 retries with exponential backoff |
| Duplicate gyms | 3-tier spatial + name dedup |
| Media download failure | Logged with `downloadError`, skipped gracefully |
| Worker crash | Bull queue persists in Redis, resumes on restart |
| Partial crawl | Job marked `partial`, all errors logged per URL |
| Missing data | `dataCompleteness` score + `missingFields` tracked |
| Re-crawl | Only missing/outdated fields updated, existing data preserved |

---

## VPS Deployment (Hostinger)

```bash
# On your VPS
git clone <repo> && cd atlas05-scraper
# Edit .env — set MEDIA_BASE_URL=https://yourdomain.com/media
docker-compose up -d --build
```

Media stored at `./media/` on VPS filesystem, served at `/media/*`.
