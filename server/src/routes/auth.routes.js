import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { authRequired, signToken } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { presentUser } from '../utils/presenters.js';

const router = Router();
const avatarColors = ['#00a884', '#128c7e', '#34b7f1', '#25d366', '#7c3aed', '#f97316', '#e11d48'];

function normalizeUsername(username = '') {
  return username.trim().toLowerCase();
}

function userColor(username) {
  const total = [...username].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return avatarColors[total % avatarColors.length];
}

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const username = normalizeUsername(req.body.username);
    const password = req.body.password || '';
    const displayName = req.body.displayName?.trim() || username;

    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      return res.status(400).json({ message: 'Username must be 3-24 characters: a-z, 0-9, underscore' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(409).json({ message: 'Username is already taken' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ username, displayName, passwordHash, avatarColor: userColor(username) });

    res.status(201).json({
      token: signToken(user),
      user: presentUser(user)
    });
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const username = normalizeUsername(req.body.username);
    const password = req.body.password || '';
    const user = await User.findOne({ username }).select('+passwordHash');

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    res.json({
      token: signToken(user),
      user: presentUser(user)
    });
  })
);

router.get('/me', authRequired, (req, res) => {
  res.json({ user: presentUser(req.user) });
});

export default router;
