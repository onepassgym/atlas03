'use strict';
const { chromium } = require('playwright-extra');
const stealthPlugin = require('puppeteer-extra-plugin-stealth');
const cfg    = require('../../config');
const logger = require('../utils/logger');

// ── Activate stealth anti-detection ──────────────────────────────────────────
chromium.use(stealthPlugin());

// ── All fitness category search terms ────────────────────────────────────────
const FITNESS_CATEGORIES = [
  'gym',
  'fitness center',
  'yoga studio',
  'crossfit',
  'pilates studio',
  'martial arts gym',
  'boxing gym',
  'dance fitness studio',
  'personal training studio',
  'health club',
  'sports club',
  'functional training gym',
  'strength training gym',
  'cycling studio',
  'swimming club',
  'zumba class',
];

// ── User-Agent rotation pool ─────────────────────────────────────────────────
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
];

function getRandomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function sleep(min, max) {
  return new Promise(r => setTimeout(r, min + Math.random() * (max - min)));
}

// ── Browser pool ──────────────────────────────────────────────────────────────

class BrowserManager {
  constructor() { this.browser = null; this.ctx = null; }

  async launch() {
    const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;
    this.browser = await chromium.launch({
      headless: cfg.scraper.headless,
      executablePath,
      args: [
        '--no-sandbox', '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', '--disable-gpu',
        '--no-first-run', '--no-zygote',
        '--disable-background-networking',
        '--disable-default-apps',
        '--lang=en-US',
      ],
    });

    this.ctx = await this.browser.newContext({
      userAgent:   getRandomUA(),
      locale:      'en-US',
      timezoneId:  'America/New_York',
      viewport:    { width: 1280, height: 900 },
      extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
    });

    // Speed up: abort heavy resources on search pages
    await this.ctx.route('**/*.{woff,woff2,ttf,otf}', r => r.abort());

    return this.ctx;
  }

  async newPage() { return this.ctx.newPage(); }

  async close() {
    try { await this.browser?.close(); } catch (_) {}
    this.browser = null; this.ctx = null;
  }
}

// ── Search: collect all place URLs for a query ───────────────────────────────

async function searchGymsInCity(page, cityName, category) {
  const query = category
    ? `${category} in ${cityName}`
    : cityName; // direct gym name search

  const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
  logger.info(`  🔍 Searching: "${query}"`);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: cfg.scraper.timeout });
  } catch (_) {
    await page.goto(url, { waitUntil: 'commit', timeout: cfg.scraper.timeout });
  }

  await sleep(2000, 3000);

  // Dismiss cookie banner if present
  for (const sel of ['button:has-text("Accept all")', 'button:has-text("Agree")', 'button[aria-label="Accept all"]']) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 2000 })) { await btn.click(); await sleep(800, 1200); break; }
    } catch (_) {}
  }

  const gymUrls  = new Set();
  let   noNewFor = 0;
  let   lastSize = 0;

  while (true) {
    // Grab all place links
    const links = await page.locator('a[href*="/maps/place/"]').all();
    for (const a of links) {
      try {
        const href = await a.getAttribute('href');
        if (href) gymUrls.add(href.split('?')[0].split('/@')[0]);
      } catch (_) {}
    }

    // End of list?
    const ended = await page.locator('text="You\'ve reached the end of the list."').isVisible({ timeout: 500 }).catch(() => false);
    if (ended) break;

    // Scroll the results panel
    const panel = page.locator('div[role="feed"]').first();
    try {
      await panel.evaluate(el => el.scrollBy(0, 1200));
    } catch (_) {
      await page.mouse.wheel(0, 1200);
    }
    await sleep(1200, 2200);

    if (gymUrls.size === lastSize) { if (++noNewFor >= 5) break; }
    else noNewFor = 0;
    lastSize = gymUrls.size;
  }

  logger.info(`  ✅ Found ${gymUrls.size} URLs for "${query}"`);
  return [...gymUrls];
}

// ── Detail: scrape full gym data from a place page ───────────────────────────

async function scrapeGymDetail(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: cfg.scraper.timeout });
    await sleep(1800, 2800);
  } catch (err) {
    throw new Error(`Navigation failed: ${err.message}`);
  }

  // ── Core data from DOM ───────────────────────────────────────────────────
  const core = await page.evaluate(() => {
    const t  = s => document.querySelector(s)?.textContent?.trim() || null;
    const a  = (s, attr) => document.querySelector(s)?.getAttribute(attr) || null;
    const ta = (sel, attr) => [...document.querySelectorAll(sel)].map(el => el.getAttribute(attr)).filter(Boolean);

    // Name
    const name = t('h1.DUwDvf') || t('h1') || t('[data-attrid="title"]');

    // Rating
    const ratingRaw = t('.F7nice span[aria-hidden="true"]') || t('.MW4etd');
    const rating    = ratingRaw ? parseFloat(ratingRaw) : null;

    // Review count
    const revText     = document.querySelector('.F7nice')?.getAttribute('aria-label') || '';
    const revMatch    = revText.match(/([\d,]+)\s*review/i);
    const totalReviews = revMatch ? parseInt(revMatch[1].replace(/,/g, ''), 10) : 0;

    // Address
    const address = t('button[data-item-id="address"] .Io6YTe') ||
                    t('[data-tooltip="Copy address"] .Io6YTe');

    // Phone
    const phone = t('button[data-item-id^="phone:tel"] .Io6YTe') ||
                  t('[data-tooltip="Copy phone number"] .Io6YTe');

    // Website
    const website = a('a[data-item-id="authority"]', 'href') ||
                    a('a[aria-label*="website" i]', 'href');

    // Category
    const category = t('.DkEaL') || t('button.DkEaL') || null;

    // Price level
    const priceLevel = t('[aria-label*="price range" i]') || null;

    // Description
    const description = t('.PYvSYb') || t('[data-attrid="description"] span') || null;

    // Opening hours
    const hourRows = [...document.querySelectorAll('table.WgFkxc tr, .t39EBf tr')];
    const openingHours = hourRows.map(row => {
      const cells = row.querySelectorAll('td, th');
      const day   = cells[0]?.textContent?.trim();
      const times = cells[1]?.textContent?.trim();
      if (!day) return null;
      const closed  = !times || /closed/i.test(times);
      const open24  = /open 24/i.test(times);
      const parts   = times?.split('–').map(s => s.trim()) || [];
      return { day, open: parts[0] || null, close: parts[1] || null, isClosed: closed, isOpen24: open24 };
    }).filter(Boolean);

    // Open now
    const openNowEl = document.querySelector('.dpoVLd, [aria-label*="Open now" i], [aria-label*="Closed" i]');
    const isOpenNow = openNowEl ? /open now/i.test(openNowEl.textContent) : null;

    // Plus code
    const plusCode = t('button[data-item-id="oloc"] .Io6YTe');

    // Amenities / highlights
    const amenities = [...document.querySelectorAll('[aria-label].iP2t7d, .E0DTEd [aria-label]')]
      .map(el => el.getAttribute('aria-label')).filter(Boolean);
    const highlights = [...document.querySelectorAll('.aSftqf .iP2t7d, .PJEMsc li')]
      .map(el => el.getAttribute('aria-label') || el.textContent?.trim()).filter(Boolean);
    const serviceOptions = [...document.querySelectorAll('.LTs0Rc li span')]
      .map(el => el.textContent?.trim()).filter(Boolean);

    // Lat/lng from URL
    const urlMatch = window.location.href.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    const lat = urlMatch ? parseFloat(urlMatch[1]) : null;
    const lng = urlMatch ? parseFloat(urlMatch[2]) : null;

    // Place ID from URL data-lsp attribute or URL path
    const pidMatch = window.location.href.match(/!1s(ChIJ[^!]+)/);
    const placeId  = pidMatch ? pidMatch[1] : null;

    // Photo URLs (visible on main page)
    const photoUrls = [...new Set(
      [...document.querySelectorAll('button[jsaction*="heroHeaderImage"] img, .RZ66Rb img, .Uf0tqf img')]
        .map(img => img.src || img.dataset?.src)
        .filter(src => src?.startsWith('http'))
        .map(src => src.replace(/=w\d+-h\d+[^&]*/, '=w1600-h1200'))
    )];

    // Rating breakdown
    const starEls = [...document.querySelectorAll('.jANrlb .dneCp')];
    const starKeys = ['fiveStar','fourStar','threeStar','twoStar','oneStar'];
    const ratingBreakdown = Object.fromEntries(starKeys.map(k => [k, 0]));
    starEls.slice(0, 5).forEach((el, i) => {
      const lbl = el.closest('[aria-label]')?.getAttribute('aria-label') || '';
      const n   = parseInt(lbl.replace(/[^0-9]/g, '') || '0', 10);
      if (starKeys[i]) ratingBreakdown[starKeys[i]] = n;
    });

    // Popular Times (on main overview page)
    const popularTimes = [...document.querySelectorAll('[aria-label*="busy at" i], [aria-label*="Busy at" i], [aria-label*="Usually" i]')]
      .map(el => el.getAttribute('aria-label')).filter(Boolean);

    const permanentlyClosed = !!document.querySelector('.eXlrNe, [aria-label*="Permanently closed" i]');

    return {
      name, rating, totalReviews, address, phone, website,
      category, priceLevel, description, openingHours, isOpenNow,
      plusCode, amenities, highlights, serviceOptions, photoUrls,
      lat, lng, placeId, ratingBreakdown, permanentlyClosed, popularTimes,
      googleMapsUrl: window.location.href,
    };
  });

  if (!core.name) throw new Error('Could not extract gym name — page may not have loaded correctly');

  // ── About Tab (Deep Amenities) ──────────────────────────────────────────
  const deepAmenities = await scrapeAboutTab(page);

  // ── Reviews ──────────────────────────────────────────────────────────────
  const { reviews, reviewSummary } = await scrapeReviews(page);

  // ── All photos tab ────────────────────────────────────────────────────────
  const allPhotos = await scrapePhotosTab(page, core.photoUrls || []);

  const mergedAmenities = [...new Set([...(core.amenities || []), ...(deepAmenities || [])])];

  return { ...core, amenities: mergedAmenities, reviews, reviewSummary, photoUrls: allPhotos };
}

// ── Scrape About Tab (Detailed Amenities & Accessibility) ──────────────────
async function scrapeAboutTab(page) {
  try {
    const tab = page.locator('button[aria-label*="About" i], button:has-text("About")').first();
    if (!await tab.isVisible({ timeout: 2000 }).catch(() => false)) return null;
    await tab.click();
    await sleep(1000, 1500);

    return await page.evaluate(() => {
      const items = [...document.querySelectorAll('.hpLkke, .E0DTEd li, .kx8XBd, .iP2t7d')];
      return items.map(el => el.textContent?.trim() || el.getAttribute('aria-label')).filter(Boolean);
    });
  } catch (err) {
    return null;
  }
}

// ── Scrape reviews (up to 150 per gym) ───────────────────────────────────────

async function scrapeReviews(page) {
  const reviews = [];
  let reviewSummary = null;
  try {
    // Click Reviews tab
    const tab = page.locator('button[aria-label*="reviews" i], button:has-text("Reviews")').first();
    if (!await tab.isVisible({ timeout: 3000 }).catch(() => false)) return { reviews, reviewSummary };
    await tab.click();
    await sleep(1500, 2200);

    // Extract AI Review Summary or keywords
    try {
      reviewSummary = await page.evaluate(() => {
        const aiSummary = document.querySelector('.P_Pval, .OA1nbd, .d7Bzhf')?.textContent?.trim();
        const keywords = [...document.querySelectorAll('.fontBodySmall.Cw1rxd')].map(el => el.textContent?.trim()).join(', ');
        return aiSummary || keywords || null;
      });
    } catch (_) {}

    // Sort by Newest
    try {
      const sortBtn = page.locator('button[aria-label*="Sort" i]').first();
      if (await sortBtn.isVisible({ timeout: 2000 })) {
        await sortBtn.click();
        await sleep(400, 700);
        await page.locator('li[data-index="1"], li:has-text("Newest")').first().click({ timeout: 2000 });
        await sleep(1000, 1500);
      }
    } catch (_) {}

    const panel = page.locator('.m6QErb[aria-label*="review" i], .DxyBCb').first();
    let lastCount = 0; let noNew = 0;

    while (reviews.length < 150) {
      // Expand truncated review text
      for (const btn of await page.locator('button.w8nwRe').all()) {
        try { await btn.click(); } catch (_) {}
      }

      // Parse visible review cards
      for (const card of await page.locator('.jftiEf, .MyEned').all()) {
        try {
          const r = await card.evaluate(el => {
            const t = s => el.querySelector(s)?.textContent?.trim() || null;
            const g = (s, a) => el.querySelector(s)?.getAttribute(a) || null;
            const ratingLabel = g('.kvMYJc', 'aria-label') || '';
            const ratingNum   = parseInt(ratingLabel.replace(/[^0-9]/g, '') || '0', 10) || null;
            return {
              reviewId:    el.getAttribute('data-review-id') || null,
              authorName:  t('.d4r55') || t('.GHT2ce'),
              authorUrl:   g('.al6Kxe', 'href'),
              authorAvatar:g('.NBa7we img', 'src'),
              rating:      ratingNum,
              text:        t('.wiI7pd') || t('.MyEned span'),
              publishedAt: t('.rsqaWe') || t('.xRkPPb span'),
              likes:       parseInt(t('.GBkF3d') || '0', 10) || 0,
              ownerReply:  { text: t('.CDe7pd'), publishedAt: t('.n5VP6b') },
            };
          });
          if (r.authorName && !reviews.some(x => x.reviewId && x.reviewId === r.reviewId)) {
            reviews.push(r);
          }
        } catch (_) {}
      }

      if (reviews.length === lastCount) { if (++noNew >= 3) break; }
      else noNew = 0;
      lastCount = reviews.length;

      try { await panel.evaluate(el => el.scrollBy(0, 1800)); }
      catch (_) { await page.mouse.wheel(0, 1800); }
      await sleep(1200, 2000);
    }
  } catch (err) {
    logger.warn(`Review scraping partial: ${err.message}`);
  }
  return { reviews, reviewSummary };
}

// ── Scrape Photos tab (up to 80 photos) ──────────────────────────────────────

async function scrapePhotosTab(page, existing = []) {
  const urls = new Set(existing);
  try {
    const tab = page.locator('button[aria-label*="Photos" i], button:has-text("Photos")').first();
    if (!await tab.isVisible({ timeout: 3000 }).catch(() => false)) return [...urls];
    await tab.click();
    await sleep(1500, 2200);

    let last = 0; let noNew = 0;
    while (urls.size < 80) {
      const imgs = await page.locator('.Uf0tqf img, .RZ66Rb img, .U39Pmb img').all();
      for (const img of imgs) {
        try {
          const src = await img.getAttribute('src') || await img.getAttribute('data-src');
          if (src?.startsWith('http')) urls.add(src.replace(/=w\d+-h\d+[^&]*/, '=w1600-h1200'));
        } catch (_) {}
      }
      if (urls.size === last) { if (++noNew >= 3) break; }
      else noNew = 0;
      last = urls.size;
      await page.mouse.wheel(0, 1500);
      await sleep(900, 1600);
    }
  } catch (err) {
    logger.warn(`Photo tab scraping partial: ${err.message}`);
  }
  return [...urls];
}

module.exports = { BrowserManager, searchGymsInCity, scrapeGymDetail, FITNESS_CATEGORIES };
