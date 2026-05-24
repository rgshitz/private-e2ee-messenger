import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { saveAvatarImage } from '../services/storage.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { presentUser } from '../utils/presenters.js';

const router = Router();
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 1
  },
  fileFilter(req, file, cb) {
    if (!file.mimetype?.startsWith('image/')) {
      cb(new Error('Avatar must be an image file'));
      return;
    }

    cb(null, true);
  }
});

function avatarExtension(mimetype) {
  if (mimetype === 'image/png') return '.png';
  if (mimetype === 'image/webp') return '.webp';
  if (mimetype === 'image/gif') return '.gif';
  return '.jpg';
}

function publicAvatarUrl(req, filename) {
  const baseUrl = process.env.PUBLIC_API_URL || `${req.protocol}://${req.get('host')}`;
  return `${baseUrl}/api/users/avatar/${filename}`;
}

router.get(
  '/search',
  authRequired,
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();

    if (q.length < 2) {
      return res.json({ users: [] });
    }

    const users = await User.find({
      _id: { $ne: req.user._id },
      username: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
    })
      .sort({ username: 1 })
      .limit(10);

    res.json({ users: users.map(presentUser) });
  })
);

router.patch(
  '/me',
  authRequired,
  asyncHandler(async (req, res) => {
    const displayName = String(req.body.displayName || '').trim();
    const about = String(req.body.about || '').trim();
    const avatarUrl = String(req.body.avatarUrl || '').trim();
    const avatarColor = String(req.body.avatarColor || '').trim();

    if (displayName) req.user.displayName = displayName.slice(0, 48);
    if (about) req.user.about = about.slice(0, 140);
    req.user.avatarUrl = avatarUrl.slice(0, 500);
    if (/^#[0-9a-f]{6}$/i.test(avatarColor)) req.user.avatarColor = avatarColor;

    await req.user.save();
    res.json({ user: presentUser(req.user) });
  })
);

router.post(
  '/me/avatar',
  authRequired,
  avatarUpload.single('avatar'),
  asyncHandler(async (req, res) => {
    if (!req.file?.buffer) {
      return res.status(400).json({ message: 'Avatar image is required' });
    }

    const filename = `${req.user._id}-${crypto.randomUUID()}${avatarExtension(req.file.mimetype)}`;
    const hostedUrl = await saveAvatarImage(req.file.buffer, req.file.mimetype, filename);

    req.user.avatarUrl = hostedUrl || publicAvatarUrl(req, filename);
    await req.user.save();

    res.status(201).json({ user: presentUser(req.user) });
  })
);

router.get(
  '/avatar/:filename',
  asyncHandler(async (req, res) => {
    const filename = path.basename(req.params.filename);
    res.sendFile(path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads', 'avatars', filename));
  })
);

export default router;
