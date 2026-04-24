const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27328/atlas05', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    const rawPhotoDocs = await mongoose.connection.collection('gyms').countDocuments({ 'rawPhotos.0': { $exists: true } });
    console.log('Docs with rawPhotos:', rawPhotoDocs);

    if (rawPhotoDocs > 0) {
      const doc = await mongoose.connection.collection('gyms').findOne({ 'rawPhotos.0': { $exists: true } });
      console.log('Sample rawPhoto:', doc.rawPhotos[0]);
    }
    process.exit(0);
  });
