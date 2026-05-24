function idOf(value) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? value;
}

export function presentUser(user) {
  if (!user) return null;

  return {
    id: idOf(user),
    username: user.username,
    displayName: user.displayName || user.username,
    avatarUrl: user.avatarUrl || '',
    avatarColor: user.avatarColor || '#00a884',
    about: user.about || 'Available',
    lastSeenAt: user.lastSeenAt || null
  };
}

export function presentConversation(conversation) {
  return {
    id: idOf(conversation),
    type: conversation.type,
    title: conversation.title,
    members: (conversation.members || []).map(presentUser),
    createdBy: idOf(conversation.createdBy),
    lastMessageAt: conversation.lastMessageAt,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt
  };
}

function presentReply(message) {
  if (!message) return null;

  return {
    id: idOf(message),
    sender: presentUser(message.sender),
    payload: message.payload,
    unsentAt: message.unsentAt,
    createdAt: message.createdAt
  };
}

export function presentMessage(message) {
  return {
    id: idOf(message),
    conversationId: idOf(message.conversation),
    sender: presentUser(message.sender),
    payload: message.payload,
    attachmentIds: (message.attachments || []).map(idOf),
    replyTo: presentReply(message.replyTo),
    reactions: (message.reactions || []).map((reaction) => ({
      id: idOf(reaction),
      user: presentUser(reaction.user),
      emoji: reaction.emoji,
      createdAt: reaction.createdAt
    })),
    readBy: (message.readBy || []).map((receipt) => ({
      userId: idOf(receipt.user),
      readAt: receipt.readAt
    })),
    editHistoryCount: message.editHistory?.length || 0,
    unsentAt: message.unsentAt,
    deletedBy: idOf(message.deletedBy),
    createdAt: message.createdAt,
    updatedAt: message.updatedAt
  };
}
