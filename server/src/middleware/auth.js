import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';

function jwtSecret() {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production');
  }

  return 'dev-only-change-me';
}

export function signToken(user) {
  return jwt.sign({ sub: user._id.toString() }, jwtSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
}

export const authRequired = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const [, token] = header.match(/^Bearer\s+(.+)$/i) || [];

  if (!token) {
    return res.status(401).json({ message: 'Missing bearer token' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, jwtSecret());
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  const user = await User.findById(decoded.sub);
  if (!user) {
    return res.status(401).json({ message: 'User no longer exists' });
  }

  req.user = user;
  next();
});

export function verifySocketToken(token) {
  return jwt.verify(token, jwtSecret());
}
