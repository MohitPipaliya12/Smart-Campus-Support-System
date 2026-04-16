const dotenv = require('dotenv');
dotenv.config();

const mongoose = require('mongoose');
const app = require('./src/app');
const seedStaffAdmin = require('./src/utils/seedStaffAdmin');

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('Missing MONGODB_URI in environment');
  }

  let mongoConnected = false;
  const mongoOptions = {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  };

  async function tryConnectMongo() {
    if (mongoConnected) return;
    try {
      await mongoose.connect(mongoUri, mongoOptions);
      mongoConnected = true;
      console.log('Connected to MongoDB');

      if (process.env.SEED_STAFF === 'true') {
        await seedStaffAdmin();
      }
    } catch (err) {
      console.error('MongoDB connection failed. REST endpoints require MongoDB running.');
      console.error(String(err && err.message ? err.message : err));
    }
  }

  await tryConnectMongo();

  if (!mongoConnected) {
    console.log('Retrying MongoDB connection every 5 seconds...');
    setInterval(tryConnectMongo, 5000);
  }

  const port = process.env.PORT || 5000;
  const server = app.listen(port, () => {
    console.log(`Campus Helpdesk API running on port ${port}`);
  });

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Stop the existing server or set a different PORT.`);
      process.exit(1);
    }
    throw err;
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});

