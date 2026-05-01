const mongoose = require('mongoose');
require('dotenv').config();
const cfg = require('./config/index');

mongoose.connect(cfg.mongo.uri).then(async () => {
  const Gym = require('./src/db/gymModel');
  const count = await Gym.countDocuments({ photos: { $exists: true, $ne: [] } });
  const result = await Gym.aggregate([
    { $unwind: '$photos' },
    { $count: 'totalEmbeddedPhotos' }
  ]);
  console.log('Gyms with embedded photos:', count);
  console.log('Total embedded photos:', result[0]?.totalEmbeddedPhotos || 0);

  const Photo = require('./src/db/photoModel');
  const photoCount = await Photo.countDocuments();
  console.log('Total photos in gym_photos collection:', photoCount);

  await mongoose.disconnect();
}).catch(console.error);
