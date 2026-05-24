import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 24,
      match: /^[a-z0-9_]+$/
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: 48
    },
    avatarUrl: {
      type: String,
      trim: true,
      maxlength: 500
    },
    avatarColor: {
      type: String,
      trim: true,
      maxlength: 24,
      default: '#00a884'
    },
    about: {
      type: String,
      trim: true,
      maxlength: 140,
      default: 'Available'
    },
    lastSeenAt: {
      type: Date
    },
    passwordHash: {
      type: String,
      required: true,
      select: false
    }
  },
  { timestamps: true }
);

export const User = mongoose.model('User', userSchema);
