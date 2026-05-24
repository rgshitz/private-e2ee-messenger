import mongoose from 'mongoose';

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function connectDb(uri) {
  if (!uri) {
    throw new Error('MONGO_URI is required');
  }

  const retries = Number(process.env.MONGO_CONNECT_RETRIES || 12);
  const retryMs = Number(process.env.MONGO_CONNECT_RETRY_MS || 2500);
  const serverSelectionTimeoutMS = Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 5000);

  mongoose.set('strictQuery', true);

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS });
      console.log('MongoDB connected');
      return;
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }

      console.warn(`MongoDB unavailable. Retry ${attempt}/${retries} in ${retryMs}ms.`);
      await wait(retryMs);
    }
  }
}
