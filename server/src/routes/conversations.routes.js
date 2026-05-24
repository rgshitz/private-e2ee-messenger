import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { Conversation } from '../models/Conversation.js';
import { User } from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { presentConversation } from '../utils/presenters.js';

const router = Router();

function directMemberKey(userA, userB) {
  return [userA.toString(), userB.toString()].sort().join(':');
}

router.get(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    const conversations = await Conversation.find({ members: req.user._id })
      .populate('members', 'username displayName avatarUrl avatarColor about lastSeenAt')
      .sort({ lastMessageAt: -1, updatedAt: -1 });

    res.json({ conversations: conversations.map(presentConversation) });
  })
);

router.post(
  '/direct',
  authRequired,
  asyncHandler(async (req, res) => {
    const username = String(req.body.username || '').trim().toLowerCase();
    const recipient = await User.findOne({ username });

    if (!recipient) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (recipient._id.equals(req.user._id)) {
      return res.status(400).json({ message: 'You cannot start a direct chat with yourself' });
    }

    const memberKey = directMemberKey(req.user._id, recipient._id);
    let conversation = await Conversation.findOne({ memberKey });

    if (!conversation) {
      conversation = await Conversation.create({
        type: 'direct',
        members: [req.user._id, recipient._id],
        memberKey,
        createdBy: req.user._id
      });
    }

    await conversation.populate('members', 'username displayName avatarUrl avatarColor about lastSeenAt');
    res.status(201).json({ conversation: presentConversation(conversation) });
  })
);

export default router;
