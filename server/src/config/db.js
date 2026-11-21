import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { env } from './env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let embeddedMongoServer = null;

export async function connectDB(uri = env.mongodbUri) {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  mongoose.set('strictQuery', true);

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 3000,
    });
    console.log(`[MongoDB] Connected to ${mongoose.connection.host}/${mongoose.connection.name}`);
    return mongoose.connection;
  } catch (err) {
    const isLocalDefault =
      env.nodeEnv !== 'production' &&
      uri === env.mongodbUri &&
      /^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(uri);

    if (!isLocalDefault) {
      throw err;
    }

    console.warn(
      '[MongoDB] Local mongod not detected on 127.0.0.1:27017. Starting embedded local MongoDB instance...'
    );
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const dbPath = path.resolve(__dirname, '../../.local-mongo-data');
    fs.mkdirSync(dbPath, { recursive: true });

    try {
      embeddedMongoServer = await MongoMemoryServer.create({
        instance: {
          dbName: 'syncspace-ai',
          dbPath,
          storageEngine: 'wiredTiger',
        },
      });
    } catch {
      // Fallback to ephemeral in-memory instance if wiredTiger lock or path issue occurs
      embeddedMongoServer = await MongoMemoryServer.create({
        instance: { dbName: 'syncspace-ai' },
      });
    }

    const embeddedUri = embeddedMongoServer.getUri('syncspace-ai');
    await mongoose.connect(embeddedUri, { serverSelectionTimeoutMS: 5000 });
    console.log(`[MongoDB] Connected to embedded local MongoDB (${embeddedUri})`);
    return mongoose.connection;
  }
}

export async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (embeddedMongoServer) {
    await embeddedMongoServer.stop();
    embeddedMongoServer = null;
  }
}
