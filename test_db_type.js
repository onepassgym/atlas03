const mongoose = require('mongoose');
require('dotenv').config();
const cfg = require('./config/index');
const Gym = require('./src/db/gymModel');

mongoose.connect(cfg.mongo.uri).then(async () => {
  const gym = await Gym.findOne({ rawPhotos: { $exists: true, $ne: [] } }).select('rawPhotos').lean();
  console.log('Is Array?', Array.isArray(gym.rawPhotos));
  console.log('rawPhotos:', JSON.stringify(gym.rawPhotos, null, 2));
  process.exit(0);
}).catch(console.error);
