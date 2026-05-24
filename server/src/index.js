import './config/env.js';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import fs from 'fs';
import helmet from 'helmet';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDb } from './config/db.js';
import { errorHandler, notFound } from './middleware/error.js';
import attachmentsRoutes from './routes/attachments.routes.js';
import authRoutes from './routes/auth.routes.js';
import conversationsRoutes from './routes/conversations.routes.js';
import messagesRoutes from './routes/messages.routes.js';
import usersRoutes from './routes/users.routes.js';
import { configureSocket } from './socket.js';

const app = express();
const server = http.createServer(app);
const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || '0.0.0.0';
const srcDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(srcDir, '../..');
const defaultDevOrigin = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173';
const originValue = [
  process.env.CLIENT_ORIGIN,
  process.env.PUBLIC_API_URL,
  process.env.RENDER_EXTERNAL_URL,
  process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : '',
  defaultDevOrigin
]
  .filter(Boolean)
  .join(',');
const origins = originValue
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    if (!origin || origins.length === 0 || origins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Origin not allowed by CORS'));
  },
  credentials: true
};

const io = configureSocket(server, corsOptions);
app.set('io', io);
app.set('trust proxy', 1);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  })
);
app.use(cors(corsOptions));
app.use(compression());
app.use(express.json({ limit: '1mb' }));

const clientDistPath = path.resolve(projectRoot, process.env.CLIENT_DIST_PATH || 'client/dist');
const shouldServeClientDist = process.env.SERVE_CLIENT_DIST === 'true';

app.get('/', (req, res, next) => {
  if (shouldServeClientDist) {
    return next();
  }

  res.json({
    name: 'CipherChat API',
    status: 'running',
    client: origins[0],
    health: '/api/health'
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    storage: process.env.STORAGE_DRIVER === 'cloudinary' ? 'cloudinary' : 'local'
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/conversations', conversationsRoutes);
app.use('/api', attachmentsRoutes);
app.use('/api', messagesRoutes);

if (shouldServeClientDist && fs.existsSync(path.join(clientDistPath, 'index.html'))) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }

    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

app.use(notFound);
app.use(errorHandler);

await connectDb(process.env.MONGO_URI);

server.listen(port, host, () => {
  console.log(`API listening on http://${host}:${port}`);
});
