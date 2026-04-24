const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27328/atlas05', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    const gymsWithCover = await mongoose.connection.collection('gyms').countDocuments({ coverPhoto: { $exists: true, $ne: null } });
    console.log('Gyms with cover photo:', gymsWithCover);
    
    if (gymsWithCover > 0) {
      const sample = await mongoose.connection.collection('gyms').findOne({ coverPhoto: { $exists: true, $ne: null } });
      console.log('Sample cover photo:', sample.coverPhoto);
    }
    
    // Check if there are ANY photos in ANY array in gyms
    const samplePhotoKeys = await mongoose.connection.collection('gyms').findOne({ 'photos.0': { $exists: true } });
    console.log('Has photos array?', !!samplePhotoKeys);
    if (samplePhotoKeys && samplePhotoKeys.photos) {
      console.log('Photos array length:', samplePhotoKeys.photos.length);
    }

    process.exit(0);
  });
