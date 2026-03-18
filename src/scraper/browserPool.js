'use strict';
const { chromium } = require('playwright-extra');
const stealthPlugin = require('puppeteer-extra-plugin-stealth');
const genericPool = require('generic-pool');
const cfg = require('../../config');
const logger = require('../utils/logger');

chromium.use(stealthPlugin());

class BrowserPoolManager {
  constructor() {
    this.pool = null;
    this.browserConfig = {
      headless: cfg.scraper.headless,
      args: [
        '--no-sandbox', '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', '--disable-gpu',
        '--no-first-run', '--no-zygote',
        '--disable-background-networking',
        '--disable-default-apps',
        '--lang=en-US',
      ],
    };

    const factory = {
      create: async () => {
        const browser = await chromium.launch(this.browserConfig);
        const ctx = await browser.newContext({
          userAgent: cfg.scraper.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          locale: 'en-US',
          timezoneId: 'America/New_York',
          viewport: { width: 1280, height: 900 },
          extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
        });

        // Speed up: abort heavy resources on search pages
        await ctx.route('**/*.{woff,woff2,ttf,otf}', r => r.abort());

        return { browser, ctx, usageCount: 0 };
      },
      destroy: async (instance) => {
        try { await instance.ctx?.close(); } catch (_) {}
        try { await instance.browser?.close(); } catch (_) {}
      },
      validate: async (instance) => {
        // Simple heuristic to replace heavily used contexts to free memory
        if (instance.usageCount > 150) {
          return false;
        }
        return true;
      }
    };

    this.pool = genericPool.createPool(factory, {
      max: cfg.scraper.concurrency || 2, // Maximum concurrent browsers
      min: 1, // Minimum browsers to keep open
      testOnBorrow: true,
      idleTimeoutMillis: 120000,
      evictionRunIntervalMillis: 30000,
    });
  }

  async acquire() {
    return await this.pool.acquire();
  }

  async release(instance) {
    instance.usageCount += 1;
    await this.pool.release(instance);
  }

  async close() {
    await this.pool.drain();
    await this.pool.clear();
  }
}

const browserPool = new BrowserPoolManager();
module.exports = browserPool;
