# Gym Data Migration Guide

This guide explains the Database Normalization and Migration process for the `gyms` collection. It is written in plain English to help you understand how the migration works, how to run it, and what happens to the data.

## 1. Why Are We Migrating?
The original database stored all gym information (like reviews, photos, crawled metadata, and amenities) inside a single `gyms` document. As the data grows, this becomes slow to query and hard to maintain.

This migration **normalizes** the data, which means it extracts those large embedded lists into their own separate collections (tables). The original `gyms` collection becomes much lighter, faster to query, and only holds the core identity of the gym.

## 2. What Changes in the Data?
When a gym is migrated, the following information is separated out:
- **Reviews**: Moved to the `gym_reviews` collection.
- **Photos**: Moved to the `gym_photos` collection.
- **Crawl Metadata**: Moved to the `gym_crawl_meta` collection.
- **Amenities**: Extracted into a shared `gym_amenities` collection, and the gym simply links to them via `amenityIds`.
- **Categories & Place Types**: Extracted into static `gym_categories` and `gym_place_types` collections, and the gym links to them via `categoryId` and `primaryType`.

Once a gym has its internal lists extracted, the old internal lists (`reviews`, `photos`, `crawlMeta`) are deleted from the `gyms` document, and we set a flag: `parsed: true`. This flag tells the system that this gym is fully migrated and clean.

## 3. How the Script Works
The migration is designed to be **safe, batch-processed, and idempotent**.
- **Safe**: If it fails halfway on a gym, it won't mark it as `parsed: true`. The script will simply retry it the next time it runs without duplicating the data.
- **Batched**: It processes gyms in small chunks (20 gyms at a time) with a 2-second pause in between. This makes sure your live application doesn't slow down or crash while the migration is running.
- **Logged**: Every success or failure is recorded in the `migration_logs` collection. If a gym fails, you can look up why in the logs.

## 4. How to Run the Migration

### Step 1: Create Database Indexes (Run Once)
Before migrating, we must create indexes. Indexes prevent duplicate data from being inserted and make lookups very fast.
```bash
node migration/createIndexes.js
```

### Step 2: Seed Static Data (Run Once)
We need to set up the default categories and amenities that gyms will link to.
```bash
node migration/seedStaticData.js
```

### Step 3: Run the Migration
There are two ways to run the actual migration process:

**Option A: Automatic Daily Schedule (Recommended)**
Start the cron scheduler. This will run the migration automatically every day at 12:01 AM.
```bash
node migration/index.js
```

**Option B: Manual Execution**
If you want to trigger the migration immediately (for example, to test it, or to manually process a backlog), run this command:
```bash
node -e "require('./migration/index.js').runNow()"
```
*Note: This will process all unparsed gyms by running continuously in small batches until there are no unparsed gyms left.*

## 5. Checking the Progress
You can check if the migration is working by opening your MongoDB viewer (like MongoDB Compass) and looking at:
1. `gym_migration_logs` collection: Look for docs where `status: "success"` or `status: "failure"`.
2. `gyms` collection: Filter by `{ parsed: true }` to see gyms that have been successfully normalized.
3. `gym_reviews` and `gym_photos` collections: Verify that reviews and photos are populating correctly.
