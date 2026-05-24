import { Server } from 'socket.io';
import { User } from './models/User.js';
import { loadMemberConversation } from './services/conversations.js';
import { verifySocketToken } from './middleware/auth.js';

const onlineUsers = new Map();

function onlinePayload(userId, isOnline, lastSeenAt = null) {
  return {
    userId: userId.toString(),
    isOnline,
    lastSeenAt
  };
}

export function configureSocket(server, cors) {
  const io = new Server(server, { cors });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) {
        return next(new Error('Missing token'));
      }

      const decoded = verifySocketToken(token);
      const user = await User.findById(decoded.sub);

      if (!user) {
        return next(new Error('User not found'));
      }

      socket.user = user;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user._id.toString();
    const currentCount = onlineUsers.get(userId) || 0;
    onlineUsers.set(userId, currentCount + 1);
    socket.broadcast.emit('presence:update', onlinePayload(userId, true));
    socket.emit('presence:snapshot', {
      onlineUserIds: [...onlineUsers.keys()]
    });

    socket.on('conversation:join', async (conversationId, ack) => {
      try {
        const conversation = await loadMemberConversation(conversationId, socket.user._id);
        socket.join(conversation._id.toString());
        ack?.({ ok: true });
      } catch {
        ack?.({ ok: false });
      }
    });

    socket.on('conversation:leave', (conversationId) => {
      socket.leave(String(conversationId));
    });

    socket.on('disconnect', async () => {
      const nextCount = (onlineUsers.get(userId) || 1) - 1;

      if (nextCount > 0) {
        onlineUsers.set(userId, nextCount);
        return;
      }

      onlineUsers.delete(userId);
      const lastSeenAt = new Date();
      await User.findByIdAndUpdate(userId, { lastSeenAt }).catch(() => {});
      socket.broadcast.emit('presence:update', onlinePayload(userId, false, lastSeenAt));
    });
  });

  return io;
}
