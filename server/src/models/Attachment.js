import mongoose from 'mongoose';

const attachmentSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true
    },
    uploader: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    provider: {
      type: String,
      enum: ['local', 'cloudinary'],
      required: true
    },
    storageKey: {
      type: String,
      required: true
    },
    url: {
      type: String
    },
    byteLength: {
      type: Number,
      required: true
    }
  },
  { timestamps: true }
);

export const Attachment = mongoose.model('Attachment', attachmentSchema);
