import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['direct', 'group'],
      default: 'direct'
    },
    title: {
      type: String,
      trim: true,
      maxlength: 80
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      }
    ],
    memberKey: {
      type: String,
      unique: true,
      sparse: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    lastMessageAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

conversationSchema.index({ members: 1, lastMessageAt: -1 });

export const Conversation = mongoose.model('Conversation', conversationSchema);
