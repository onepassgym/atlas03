# Atlas06 — Feature Upgrade Roadmap

> Full review of the current application architecture, data models, scraper pipeline, intelligence services, and dashboard — with actionable upgrade pointers organized by priority tier.

---

## Current Architecture Summary

| Layer | What Exists |
|-------|-------------|
| **Scraper** | Playwright-based Google Maps scraper with stealth plugin, batch processing, throttle/cooldown, category-based discovery |
| **Queue** | BullMQ workers — `worker.js` (main crawl), `chainWorker.js` (chain crawls), `enrichmentWorker.js` (data refresh), `mediaWorker.js` (photo download) |
| **API** | Express REST API with auth, rate limiting, SSE events, webhooks |
| **Data** | MongoDB with 14 models — Gym, Review, Photo, Chain, Category, Amenity, CrawlJob, CrawlMeta, EnrichmentLog, etc. |
| **Intelligence** | Basic keyword-based sentiment analysis, quality scoring (0-100), chain tagging |
| **Dashboard** | React + Vite SPA — Overview, Explorer, Chains, Jobs, Enrichment, Globe, System pages |
| **Infra** | Docker Compose (API, Mongo, Redis, workers, Nginx dashboard) |

---

## 🔴 Tier 1 — High-Impact Quick Wins

### 1. **Review Intelligence & NLP Upgrade**
- Current sentiment is keyword-matching (~22 positive + ~21 negative words). It misses sarcasm, context, and non-English reviews.
- **→** Integrate a lightweight NLP model (or external API like OpenAI/Claude) to:
  - Generate review summaries per gym ("Most guests praise cleanliness but complain about parking")
  - Extract topics (equipment, staff, cleanliness, pricing, location)
  - Detect fake/spam reviews (short + 5-star only pattern)
  - Support multilingual reviews (critical for Ukrainian/Hindi gyms in your DB)

### 2. **Competitive Intelligence Dashboard**
- You have quality scores, ratings, review counts, and locations — but no way to compare gyms against each other.
- **→** Build a "Compare" feature:
  - Side-by-side gym comparison (rating, price, amenities, hours, photos)
  - "Competitors" panel on each gym showing nearby similar gyms
  - Area-level competitive density heatmap
  - "Best in area" auto-ranking by category

### 3. **Photo Intelligence**
- Photos are downloaded but not analyzed.
- **→** Add image classification:
  - Auto-tag photos (interior, exterior, equipment, pool, class, before/after)
  - Detect photo quality (blurry, dark, stock photo vs real)
  - Generate a "visual appeal score" per gym
  - Use cover photo selection AI instead of just first photo

### 4. **Data Completeness & Health Dashboard**
- `qualityScore` exists but there's no aggregate view of data health.
- **→** Build a "Data Health" page showing:
  - % of gyms missing phone, website, hours, photos, reviews
  - Stale data alerts (gyms not updated in 30/60/90 days)
  - Data quality trends over time (is enrichment improving things?)
  - Auto-prioritize enrichment for lowest-quality gyms

---

## 🟡 Tier 2 — Medium-Effort, High-Value

### 5. **Public API / Embed SDK**
- Currently the API is admin-only (single API key).
- **→** Build a public-facing API tier:
  - Tiered API keys (free / pro / enterprise)
  - Rate limiting per key
  - Public endpoints: search, nearby, gym detail, reviews
  - Embeddable gym finder widget (iframe/JS SDK) for partner websites
  - API usage analytics dashboard

### 6. **Pricing Intelligence**
- `priceLevel` field exists but is rarely populated from Google Maps.
- **→** Build pricing data collection:
  - Scrape pricing from gym websites (membership pages)
  - Crowdsource pricing via a submission form
  - Price comparison by area / category
  - Price trend tracking over time
  - "Value for money" composite score (quality ÷ price)

### 7. **Map-Based Explorer**
- You have lat/lng + geospatial indexes but the Explorer is list-only.
- **→** Add an interactive map view:
  - Cluster markers with zoom-based density
  - Color markers by category/rating/quality
  - Draw area polygons for coverage visualization
  - "Search this area" when user pans the map
  - Heat map layer for gym density
  - The Globe page exists but is decorative — make it functional

### 8. **User Accounts & Favorites**
- No user system exists.
- **→** Add lightweight user features:
  - User registration / OAuth login
  - Favorite/bookmark gyms
  - Personal gym comparison lists
  - "Notify me" when a gym's data changes
  - User-submitted gym corrections / data contributions

### 9. **Gym Change Tracking & Alerts**
- `gymChangeLogModel.js` exists but doesn't appear to be surfaced in the dashboard.
- **→** Build a "Changes" feed:
  - Track when a gym's rating drops, hours change, or it closes
  - Alert dashboard (or email/webhook) for significant changes
  - Historical rating graph per gym
  - "Recently Closed" / "Newly Opened" auto-curated lists

---

## 🟢 Tier 3 — Strategic / Long-Term

### 10. **Multi-Source Data Fusion**
- Currently Google Maps is the only data source.
- **→** Add secondary sources:
  - Yelp, TripAdvisor, Foursquare for review aggregation
  - Instagram/Facebook for social proof & activity signals
  - Official gym websites for pricing, class schedules, amenities
  - Government fitness facility registrations (where available)
  - Cross-reference to validate data accuracy

### 11. **AI-Powered Gym Recommendations**
- You have ratings, categories, locations, amenities, reviews — enough for a recommendation engine.
- **→** Build recommendation features:
  - "Gyms like this" collaborative filtering
  - User-preference-based recommendations (budget, amenities, distance)
  - "Hidden gems" — high quality + low review count
  - Trending gyms (recent review velocity)

### 12. **Operational Analytics & Forecasting**
- Current enrichment metrics show basic counts.
- **→** Add deeper operational intelligence:
  - Crawl cost analysis (time per gym, failure rate by region)
  - Optimal crawl scheduling (predict best times to avoid Google blocks)
  - Data freshness forecasting (predict when data will go stale)
  - Resource usage trends (memory, CPU, Redis queue depth over time)
  - ROI metrics: "new gyms discovered per crawl hour"

### 13. **Whitelabel / Multi-Tenant**
- Everything is hardcoded to "Atlas06".
- **→** Prepare for multi-tenant operation:
  - Tenant-level data isolation
  - Custom branding per tenant
  - Per-tenant API keys and usage quotas
  - Different vertical support (restaurants, hotels, etc.)

### 14. **Mobile App / PWA**
- Dashboard is desktop-first.
- **→** Build a consumer-facing PWA:
  - Gym finder with GPS-based "near me"
  - Offline gym details caching
  - Push notifications for favorites
  - QR code check-in integration

### 15. **Data Export & Business Intelligence**
- Export endpoint exists (`/api/gyms/export`) but it's raw JSON.
- **→** Enhance data portability:
  - CSV/Excel export with column selection
  - Scheduled email reports (weekly gym discovery summary)
  - Integration with BI tools (Metabase, Grafana)
  - Data feeds for partner integrations (real-time webhooks already exist)

---

## 🛠 Technical Debt to Address

| Area | Issue | Impact |
|------|-------|--------|
| **Testing** | Zero unit/integration tests | High — regressions are invisible |
| **Error handling** | Many `catch { }` blocks silently swallow errors | Medium — hard to debug |
| **TypeScript** | Entire codebase is untyped JS | Medium — refactoring risk |
| **CSS** | `index.css` is 47KB, growing unsustainably | Low — works but hard to maintain |
| **API docs** | Swagger annotations exist but no generated docs endpoint | Low — slows external adoption |
| **Auth** | Single shared API key, no RBAC | High for production use |
| **Monitoring** | No APM/metrics (Prometheus, Datadog) | Medium — blind to perf issues |
| **CI/CD** | No pipeline — manual Docker deploys | Medium — error-prone releases |

---

## Suggested Priority Order

1. **Review Intelligence** (#1) — Transforms raw data into actionable insights
2. **Map-Based Explorer** (#7) — Most visually impressive, leverages existing geo data
3. **Data Health Dashboard** (#4) — Improves data quality feedback loop
4. **Gym Change Tracking** (#9) — Model already exists, just needs surfacing
5. **Competitive Intelligence** (#2) — High value for any gym marketplace
6. **Public API** (#5) — Opens monetization path
7. **Photo Intelligence** (#3) — Differentiator, but needs ML infrastructure
