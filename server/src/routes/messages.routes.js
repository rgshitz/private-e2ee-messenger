import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { Attachment } from '../models/Attachment.js';
import { Message } from '../models/Message.js';
import { loadMemberConversation } from '../services/conversations.js';
import { deleteEncryptedObject } from '../services/storage.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { presentMessage } from '../utils/presenters.js';

const router = Router();

const messagePopulate = [
  { path: 'sender', select: 'username displayName avatarUrl avatarColor about lastSeenAt' },
  { path: 'reactions.user', select: 'username displayName avatarUrl avatarColor about lastSeenAt' },
  { path: 'replyTo', populate: { path: 'sender', select: 'username displayName avatarUrl avatarColor about lastSeenAt' } }
];

async function hydrateMessage(message) {
  return Message.findById(message._id).populate(messagePopulate);
}

function validateEnvelope(payload) {
  return Boolean(
    payload &&
      payload.v === 1 &&
      typeof payload.salt === 'string' &&
      typeof payload.iv === 'string' &&
      typeof payload.ciphertext === 'string'
  );
}

router.get(
  '/conversations/:conversationId/messages',
  authRequired,
  asyncHandler(async (req, res) => {
    const conversation = await loadMemberConversation(req.params.conversationId, req.user._id);
    const limit = Math.min(Number(req.query.limit || 50), 100);
    const query = { conversation: conversation._id };

    if (req.query.before) {
      query.createdAt = { $lt: new Date(req.query.before) };
    }

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate(messagePopulate);

    res.json({ messages: messages.reverse().map(presentMessage) });
  })
);

router.post(
  '/conversations/:conversationId/read',
  authRequired,
  asyncHandler(async (req, res) => {
    const conversation = await loadMemberConversation(req.params.conversationId, req.user._id);
    const readAt = new Date();
    const unreadMessages = await Message.find({
      conversation: conversation._id,
      sender: { $ne: req.user._id },
      'readBy.user': { $ne: req.user._id },
      unsentAt: { $exists: false }
    }).select('_id');

    if (!unreadMessages.length) {
      return res.json({ messageIds: [], readAt });
    }

    const messageIds = unreadMessages.map((message) => message._id);

    await Message.updateMany(
      { _id: { $in: messageIds } },
      {
        $push: {
          readBy: {
            user: req.user._id,
            readAt
          }
        }
      }
    );

    const payload = {
      conversationId: conversation._id.toString(),
      userId: req.user._id.toString(),
      messageIds: messageIds.map((id) => id.toString()),
      readAt
    };

    req.app.get('io')?.to(conversation._id.toString()).emit('message:read', payload);
    res.json(payload);
  })
);

router.post(
  '/conversations/:conversationId/messages',
  authRequired,
  asyncHandler(async (req, res) => {
    const conversation = await loadMemberConversation(req.params.conversationId, req.user._id);
    const payload = req.body.payload;
    const attachmentIds = Array.isArray(req.body.attachments) ? req.body.attachments : [];

    if (!validateEnvelope(payload)) {
      return res.status(400).json({ message: 'Encrypted payload envelope is invalid' });
    }

    if (attachmentIds.length) {
      const count = await Attachment.countDocuments({
        _id: { $in: attachmentIds },
        conversation: conversation._id,
        uploader: req.user._id
      });

      if (count !== attachmentIds.length) {
        return res.status(400).json({ message: 'One or more attachments are invalid' });
      }
    }

    let replyTo;
    if (req.body.replyTo) {
      replyTo = await Message.findOne({
        _id: req.body.replyTo,
        conversation: conversation._id
      });

      if (!replyTo) {
        return res.status(400).json({ message: 'Reply target is invalid' });
      }
    }

    const message = await Message.create({
      conversation: conversation._id,
      sender: req.user._id,
      payload,
      attachments: attachmentIds,
      replyTo: replyTo?._id
    });

    conversation.lastMessageAt = new Date();
    await conversation.save();

    const hydrated = await hydrateMessage(message);
    req.app.get('io')?.to(conversation._id.toString()).emit('message:new', presentMessage(hydrated));

    res.status(201).json({ message: presentMessage(hydrated) });
  })
);

router.patch(
  '/messages/:messageId',
  authRequired,
  asyncHandler(async (req, res) => {
    const payload = req.body.payload;

    if (!validateEnvelope(payload)) {
      return res.status(400).json({ message: 'Encrypted payload envelope is invalid' });
    }

    const message = await Message.findById(req.params.messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    await loadMemberConversation(message.conversation, req.user._id);

    if (!message.sender.equals(req.user._id)) {
      return res.status(403).json({ message: 'Only the sender can edit this message' });
    }

    if (message.unsentAt) {
      return res.status(400).json({ message: 'Unsent messages cannot be edited' });
    }

    message.editHistory.push({ payload: message.payload });
    message.payload = payload;
    await message.save();

    const hydrated = await hydrateMessage(message);
    req.app.get('io')?.to(message.conversation.toString()).emit('message:updated', presentMessage(hydrated));

    res.json({ message: presentMessage(hydrated) });
  })
);

router.delete(
  '/messages/:messageId',
  authRequired,
  asyncHandler(async (req, res) => {
    const message = await Message.findById(req.params.messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    await loadMemberConversation(message.conversation, req.user._id);

    if (!message.sender.equals(req.user._id)) {
      return res.status(403).json({ message: 'Only the sender can unsend this message' });
    }

    const attachments = await Attachment.find({ _id: { $in: message.attachments } });
    await Promise.all(attachments.map(deleteEncryptedObject));
    await Attachment.deleteMany({ _id: { $in: message.attachments } });

    message.payload = null;
    message.attachments = [];
    message.unsentAt = new Date();
    message.deletedBy = req.user._id;
    await message.save();

    const hydrated = await hydrateMessage(message);
    req.app.get('io')?.to(message.conversation.toString()).emit('message:deleted', presentMessage(hydrated));

    res.json({ message: presentMessage(hydrated) });
  })
);

router.post(
  '/messages/:messageId/reactions',
  authRequired,
  asyncHandler(async (req, res) => {
    const emoji = String(req.body.emoji || '').trim();

    if (!emoji || emoji.length > 16) {
      return res.status(400).json({ message: 'Reaction is invalid' });
    }

    const message = await Message.findById(req.params.messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    await loadMemberConversation(message.conversation, req.user._id);

    const existingIndex = message.reactions.findIndex((reaction) => reaction.user.equals(req.user._id));

    if (existingIndex >= 0 && message.reactions[existingIndex].emoji === emoji) {
      message.reactions.splice(existingIndex, 1);
    } else if (existingIndex >= 0) {
      message.reactions[existingIndex].emoji = emoji;
      message.reactions[existingIndex].createdAt = new Date();
    } else {
      message.reactions.push({ user: req.user._id, emoji });
    }

    await message.save();

    const hydrated = await hydrateMessage(message);
    req.app.get('io')?.to(message.conversation.toString()).emit('message:reaction', presentMessage(hydrated));

    res.json({ message: presentMessage(hydrated) });
  })
);

router.get(
  '/messages/:messageId/history',
  authRequired,
  asyncHandler(async (req, res) => {
    const message = await Message.findById(req.params.messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    await loadMemberConversation(message.conversation, req.user._id);

    res.json({
      history: message.editHistory.map((entry) => ({
        id: entry._id.toString(),
        payload: entry.payload,
        editedAt: entry.editedAt
      }))
    });
  })
);

export default router;
