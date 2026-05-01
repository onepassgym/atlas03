const mongoose = require('mongoose');
require('dotenv').config();
const cfg = require('./config/index');
const Gym = require('./src/db/gymModel');

mongoose.connect(cfg.mongo.uri).then(async () => {
  let cursor = Gym.find({ rawPhotos: { \$exists: true, \$ne: [] } })
    .select('_id slug rawPhotos')
    .lean()
    .cursor({ batchSize: 50 });

  let processed = 0;
  for await (const gym of cursor) {
    if (!Array.isArray(gym.rawPhotos) || !gym.rawPhotos.length) {
      console.log('Skipping gym, invalid array', gym.slug);
      continue;
    }
    processed++;
  }
  console.log('Processed in test script:', processed);

  process.exit(0);
}).catch(console.error);
