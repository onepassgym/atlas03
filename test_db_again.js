const mongoose = require('mongoose');
require('dotenv').config();
const cfg = require('./config/index');
const Gym = require('./src/db/gymModel');

mongoose.connect(cfg.mongo.uri).then(async () => {
  console.log('Connected to:', mongoose.connection.client.s.url);
  const gymTotal = await Gym.countDocuments({ rawPhotos: { $exists: true, $ne: [] } });
  console.log('gymTotal with rawPhotos:', gymTotal);
  
  const gymTotalVirtual = await Gym.countDocuments({ photos: { $exists: true, $ne: [] } });
  console.log('gymTotal with photos:', gymTotalVirtual);

  const gymWithAnyRawPhotos = await Gym.findOne({ rawPhotos: { $exists: true } });
  console.log('Gym with any rawPhotos:', !!gymWithAnyRawPhotos);
  if (gymWithAnyRawPhotos) {
    console.log('rawPhotos length:', gymWithAnyRawPhotos.rawPhotos.length);
  }

  process.exit(0);
}).catch(console.error);
