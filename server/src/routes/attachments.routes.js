import multer from 'multer';
import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { Attachment } from '../models/Attachment.js';
import { loadMemberConversation } from '../services/conversations.js';
import { saveEncryptedObject, streamEncryptedObject } from '../services/storage.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
const maxMb = Number(process.env.MAX_ATTACHMENT_MB || 25);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxMb * 1024 * 1024,
    files: 1
  }
});

router.post(
  '/conversations/:conversationId/attachments',
  authRequired,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const conversation = await loadMemberConversation(req.params.conversationId, req.user._id);

    if (!req.file?.buffer) {
      return res.status(400).json({ message: 'Encrypted file is required' });
    }

    const stored = await saveEncryptedObject(req.file.buffer);
    const attachment = await Attachment.create({
      conversation: conversation._id,
      uploader: req.user._id,
      ...stored
    });

    res.status(201).json({
      attachment: {
        id: attachment._id.toString(),
        byteLength: attachment.byteLength
      }
    });
  })
);

router.get(
  '/attachments/:attachmentId',
  authRequired,
  asyncHandler(async (req, res) => {
    const attachment = await Attachment.findById(req.params.attachmentId);
    if (!attachment) {
      return res.status(404).json({ message: 'Attachment not found' });
    }

    await loadMemberConversation(attachment.conversation, req.user._id);
    await streamEncryptedObject(attachment, res);
  })
);

export default router;
