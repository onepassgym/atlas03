# 🏋️ Atlas05 Scraper

Google Maps fitness venue scraper for the **Atlas05** platform.  
No API key required · Node 20 · MongoDB 7 · Redis · Playwright · Swagger

---

## 🚀 Key Features

- **Zero-Cost Enrichment**: High-fidelity gym data (prices, timings, photos, reviews) without Google API fees.
- **Interactive API Guide**: Full Swagger documentation available at `/api-docs`.
- **Graceful Cancellation**: Stop city or gym crawls mid-process reliably via API or Redis signals.
- **Smart Scheduling**: Multi-tier frequency (Weekly, Biweekly, Monthly) with staleness-aware re-crawling.
- **6-Tier Deduplication**: Advanced spatial + textual matching to prevent duplicate gym records.
- **Anti-Bot Protection**: Built-in stealth plugins, User-Agent rotation, and human-like interaction patterns.

---

## 🛠️ Project Structure

```
atlas05-scraper/
├── config/                      ← environment & app configuration
├── src/
│   ├── server.js                ← API entry point (Express)
│   ├── api/                     ← REST endpoints (Crawl, Gyms, System)
│   ├── scraper/                 ← Playwright engine & data processors
│   ├── queue/                   ← BullMQ worker & job management
│   ├── services/                ← Business logic (Scheduler)
│   ├── db/                      ← Mongoose models & connections
│   └── utils/                   ← Helpers (Logger, Dedup, API Utils)
├── scripts/                     ← CLI maintenance scripts
├── media/                       ← Local storage for gym photos (gitignored)
└── logs/                        ← Rotating system logs (gitignored)
```

---

## 🚦 Quick Start

### 1. Prerequisites
- Node.js 20+
- MongoDB 7 & Redis 7

### 2. Setup & Start
```bash
npm install
npm run setup        # Installs Chromium dependencies
docker-compose up -d # Recommended: starts Mongo, Redis, API, and Worker
```

### 3. Access Docs
- **Interactive UI**: [http://localhost:8747/api-docs](http://localhost:8747/api-docs)
- **JSON Spec**: `http://localhost:8747/swagger.json` (via Swagger UI)

---

## 📖 API Highlight Guide

### 🏙️ Crawl Management
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/crawl/city` | `POST` | Start a city-wide crawl (w/ dedup guard) |
| `/api/crawl/cancel/:jobId` | `POST` | Cancel a running or queued job |
| `/api/crawl/status/:jobId` | `GET` | Real-time progress tracking |

**Cancellation Payload Notice**:
Cancellation is graceful. A running job will finish its current gym processing, close the browser, and mark itself as `cancelled` within 5-15 seconds of the signal.

### 📅 Scheduling & Enrichment
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/system/schedule` | `GET` | View city frequencies & staleness thresholds |
| `/api/system/schedule/trigger`| `POST`| Manual fire: `weekly`, `biweekly`, or `monthly` |
| `/api/system/schedule/trigger/stale` | `POST` | Re-crawl gyms not updated in >30 days |

---

## 🧠 Smart Deduplication (6-Tier)

1. **URL Slug Match**: Exact match on Google Maps slug.
2. **Metadata Match**: Exact match on `placeId` or `googleMapsUrl`.
3. **Spatial Proximity**: Lat/Lng within **50 meters** + Name similarity **> 70%**.
4. **Phone Match**: Exact match on cleaned international phone numbers.
5. **Contextual Match**: Exact Name + partial Address overlap.
6. **Jaccard Similarity**: Advanced string similarity across name, address, and area.

---

## 🏗️ Worker Configuration

The scraper runs as a separate BullMQ worker process.
- **Concurrency**: Default 3 per worker (configurable in `.env`).
- **Locks**: Auto-extended to 1 hour to prevent timeouts during deep category crawls.
- **Retries**: 3 attempts with exponential backoff on network failures.

---

## 📦 Deployment (Hostinger VPS)

```bash
# Clone and build
git clone <repo_url>
docker-compose up -d --build

# Set up SSL with Nginx (Atlas subdomain)
# Ensure MEDIA_BASE_URL in .env points to https://atlas.onepassgym.com/media
```

See **[DEPLOY.md](DEPLOY.md)** for full step-by-step guide.

---

## 📚 Documentation

| Document | Description | Updated |
|----------|-------------|---------|
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | Complete system architecture, module reference, data flow diagrams, config reference | Manual |
| **[ROADMAP.md](ROADMAP.md)** | Feature upgrade roadmap in 5 phases with status tracking | Manual |
| **[docs/SNAPSHOT.md](docs/SNAPSHOT.md)** | Auto-generated: file tree, route inventory, model summary, dependency list | Auto (`npm run docs:snapshot`) |
| **[DEPLOY.md](DEPLOY.md)** | Step-by-step VPS deployment guide | Manual |
| **[/api-docs](http://localhost:8747/api-docs)** | Interactive Swagger API documentation | Auto (from JSDoc) |

### Keeping Docs Updated

After making structural changes (adding routes, models, dependencies):

```bash
npm run docs:snapshot   # Regenerates docs/SNAPSHOT.md from live code
```

> The snapshot script scans all source files and produces a complete inventory.  
> For design decisions and rationale, update `ARCHITECTURE.md` and `ROADMAP.md` manually.

---

## ⚖️ License
Internal Use Only - OnePassGym.
