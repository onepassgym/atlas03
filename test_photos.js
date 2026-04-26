const mongoose = require('mongoose');
const Gym = require('./src/db/gymModel');
const cfg = require('./config');

async function test() {
  await mongoose.connect(cfg.db.uri);
  const gym = await Gym.findOne({ rawPhotos: { $type: 'array', $not: { $size: 0 } } }).lean();
  console.log("Raw Photos:", JSON.stringify(gym?.rawPhotos?.slice(0, 2), null, 2));
  
  const totalRawPhotos = await Gym.aggregate([
      { $match: { rawPhotos: { $type: 'array', $not: { $size: 0 } } } },
      { $unwind: '$rawPhotos' },
      { $count: 'total' }
  ]);
  console.log("Total Raw Photos:", totalRawPhotos);
  process.exit(0);
}
test();
