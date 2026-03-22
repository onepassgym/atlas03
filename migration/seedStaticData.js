'use strict';
const { connectDB, disconnectDB } = require('../src/db/connection');
const mongoose = require('mongoose');

const CATEGORIES = [
  { slug: "gym", label: "Gym", description: "General fitness center" },
  { slug: "yoga-studio", label: "Yoga Studio", description: "Yoga and meditation focused studio" },
  { slug: "crossfit-box", label: "Crossfit Box", description: "High intensity functional training facility" },
  { slug: "pilates-studio", label: "Pilates Studio", description: "Pilates training studio" },
  { slug: "martial-arts", label: "Martial Arts", description: "Martial arts combat and training center" },
  { slug: "dance-studio", label: "Dance Studio", description: "Dance classes and practice space" },
  { slug: "swimming-pool", label: "Swimming Pool", description: "Aquatic sports and swimming pool" },
  { slug: "sports-complex", label: "Sports Complex", description: "Multi-sport athletics complex" }
];

const PLACE_TYPES = [
  { slug: "gym", label: "Gym", googleType: "gym" }
];

const AMENITIES = [
  { slug: 'parking', label: 'Parking', icon: 'parking-icon' },
  { slug: 'locker-rooms', label: 'Locker Rooms', icon: 'locker-rooms-icon' },
  { slug: 'showers', label: 'Showers', icon: 'showers-icon' },
  { slug: 'wifi', label: 'WiFi', icon: 'wifi-icon' },
  { slug: 'air-conditioning', label: 'Air Conditioning', icon: 'ac-icon' },
  { slug: 'personal-training', label: 'Personal Training', icon: 'personal-training-icon' },
  { slug: 'group-classes', label: 'Group Classes', icon: 'group-classes-icon' },
  { slug: 'sauna', label: 'Sauna', icon: 'sauna-icon' },
  { slug: 'swimming-pool', label: 'Swimming Pool', icon: 'swimming-pool-icon' },
  { slug: 'juice-bar', label: 'Juice Bar', icon: 'juice-bar-icon' },
  { slug: '24-7-access', label: '24/7 Access', icon: '24-7-icon' },
  { slug: 'women-only-section', label: 'Women-only Section', icon: 'women-only-icon' }
];

async function seedStaticData() {
  await connectDB();
  const db = mongoose.connection.db;
  console.log('Seeding static reference collections...');

  const now = new Date();

  // Seed Categories
  for (const cat of CATEGORIES) {
    await db.collection('gym_categories').updateOne(
      { slug: cat.slug },
      { $setOnInsert: { ...cat, createdAt: now } },
      { upsert: true }
    );
  }

  // Seed Place Types
  for (const pt of PLACE_TYPES) {
    await db.collection('gym_place_types').updateOne(
      { slug: pt.slug },
      { $setOnInsert: { ...pt, createdAt: now } },
      { upsert: true }
    );
  }

  // Seed Amenities
  for (const am of AMENITIES) {
    await db.collection('gym_amenities').updateOne(
      { slug: am.slug },
      { $setOnInsert: { ...am, createdAt: now } },
      { upsert: true }
    );
  }

  console.log('Static data seeded successfully.');
  await disconnectDB();
}

if (require.main === module) {
  seedStaticData().catch(console.error).finally(() => process.exit(0));
}

module.exports = seedStaticData;
