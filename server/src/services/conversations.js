import { Conversation } from '../models/Conversation.js';

export function isMember(conversation, userId) {
  return (conversation.members || []).some((member) => member.toString() === userId.toString());
}

export async function loadMemberConversation(conversationId, userId) {
  const conversation = await Conversation.findById(conversationId);

  if (!conversation || !isMember(conversation, userId)) {
    const error = new Error('Conversation not found');
    error.status = 404;
    throw error;
  }

  return conversation;
}
