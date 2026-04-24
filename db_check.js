const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27328/atlas05', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    const gyms = await mongoose.connection.collection('gyms').countDocuments();
    const photos = await mongoose.connection.collection('gym_photos').countDocuments();
    console.log('Gyms:', gyms);
    console.log('Photos:', photos);
    
    if (photos === 0 && gyms > 0) {
      // Check if photos are stored inside gym objects
      const gymWithPhotos = await mongoose.connection.collection('gyms').findOne({ totalPhotos: { $gt: 0 } });
      if (gymWithPhotos) {
        console.log('Found gym with totalPhotos:', gymWithPhotos.totalPhotos);
        console.log('Keys in gym document:', Object.keys(gymWithPhotos));
        if (gymWithPhotos.rawPhotos) {
          console.log('rawPhotos length:', gymWithPhotos.rawPhotos.length);
          console.log('Sample rawPhoto:', JSON.stringify(gymWithPhotos.rawPhotos[0], null, 2));
        }
      }
    } else if (photos > 0) {
      const samplePhoto = await mongoose.connection.collection('gym_photos').findOne();
      console.log('Sample photo:', JSON.stringify(samplePhoto, null, 2));
    }

    process.exit(0);
  });
