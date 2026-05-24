import mongoose from 'mongoose';

const reactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    emoji: {
      type: String,
      required: true,
      maxlength: 16
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: true }
);

const editHistorySchema = new mongoose.Schema(
  {
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    editedAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: true }
);

const readReceiptSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    payload: {
      type: mongoose.Schema.Types.Mixed
    },
    attachments: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Attachment'
      }
    ],
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message'
    },
    reactions: [reactionSchema],
    readBy: [readReceiptSchema],
    editHistory: [editHistorySchema],
    unsentAt: {
      type: Date
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  { timestamps: true }
);

messageSchema.index({ conversation: 1, createdAt: -1 });

export const Message = mongoose.model('Message', messageSchema);
