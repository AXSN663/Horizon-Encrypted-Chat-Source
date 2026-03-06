import { prisma } from '@chat/database';
import fs from 'fs';
import path from 'path';

// Track active timers so we can clear them if needed
const activeTimers = new Map<string, NodeJS.Timeout>();

/**
 * Delete a message and its associated file
 */
async function deleteMessage(messageId: string, io: any) {
  try {
    // Get message info before deleting to check for file
    const msgToDelete = await prisma.message.findUnique({
      where: { id: messageId },
      select: { fileUrl: true, roomId: true }
    });

    if (!msgToDelete) {
      console.log(`Self-destruct: message ${messageId} already deleted or not found`);
      return;
    }

    // Delete associated file if exists
    if (msgToDelete.fileUrl) {
      const filename = msgToDelete.fileUrl.split('/').pop();
      if (filename) {
        const paths = [
          path.join(__dirname, '../../uploads/Pictures', filename),
          path.join(__dirname, '../../uploads/Files', filename),
          path.join(__dirname, '../../uploads', filename),
          path.join(__dirname, '../uploads/Pictures', filename),
          path.join(__dirname, '../uploads/Files', filename),
          path.join(__dirname, '../uploads', filename)
        ];

        for (const fp of paths) {
          try {
            if (fs.existsSync(fp)) {
              fs.unlinkSync(fp);
              console.log(`Self-destruct: deleted file ${fp}`);
              break;
            }
          } catch (err) {
            // Continue to next path
          }
        }

        // Delete from database
        try {
          await prisma.file.deleteMany({ where: { filename } });
        } catch (err) {
          // File record might not exist
        }
      }
    }

    // Hard delete from database
    await prisma.message.delete({
      where: { id: messageId }
    });

    console.log(`Self-destruct: message ${messageId} deleted`);

    // Notify clients if io is provided
    if (io && msgToDelete.roomId) {
      io.to(msgToDelete.roomId).emit('message-deleted', { messageId });
    }
  } catch (err) {
    console.error('Self-destruct: error deleting message:', err);
  }
}

/**
 * Schedule a message for self-destruction
 */
export function scheduleSelfDestruct(messageId: string, selfDestructTime: Date, io: any) {
  // Clear any existing timer for this message
  clearSelfDestructTimer(messageId);

  const now = new Date();
  const delayMs = selfDestructTime.getTime() - now.getTime();

  if (delayMs <= 0) {
    // Already expired, delete immediately
    console.log(`Self-destruct: message ${messageId} already expired, deleting now`);
    deleteMessage(messageId, io);
    return;
  }

  console.log(`Self-destruct: scheduling message ${messageId} for deletion in ${delayMs}ms`);

  const timer = setTimeout(async () => {
    await deleteMessage(messageId, io);
    activeTimers.delete(messageId);
  }, delayMs);

  activeTimers.set(messageId, timer);
}

/**
 * Clear a self-destruct timer (e.g., if message is manually deleted)
 */
export function clearSelfDestructTimer(messageId: string) {
  const timer = activeTimers.get(messageId);
  if (timer) {
    clearTimeout(timer);
    activeTimers.delete(messageId);
    console.log(`Self-destruct: cleared timer for message ${messageId}`);
  }
}

/**
 * Check for and process expired messages on server startup
 * This ensures messages are deleted even if the server was offline
 */
export async function processExpiredMessages(io: any) {
  console.log('Self-destruct: checking for expired messages...');

  try {
    const now = new Date();

    // Find all messages with selfDestruct time in the past
    const expiredMessages = await prisma.message.findMany({
      where: {
        selfDestruct: {
          lte: now
        }
      },
      select: {
        id: true,
        roomId: true,
        fileUrl: true
      }
    });

    console.log(`Self-destruct: found ${expiredMessages.length} expired messages`);

    // Delete all expired messages
    for (const message of expiredMessages) {
      await deleteMessage(message.id, io);
    }

    console.log('Self-destruct: finished processing expired messages');
  } catch (error) {
    console.error('Self-destruct: error processing expired messages:', error);
  }
}

/**
 * Schedule all pending self-destruct messages on server startup
 */
export async function scheduleAllPendingSelfDestructs(io: any) {
  console.log('Self-destruct: scheduling pending self-destructs...');

  try {
    const now = new Date();

    // Find all messages with future selfDestruct times
    const pendingMessages = await prisma.message.findMany({
      where: {
        selfDestruct: {
          gt: now
        }
      },
      select: {
        id: true,
        selfDestruct: true
      }
    });

    console.log(`Self-destruct: found ${pendingMessages.length} pending self-destructs`);

    // Schedule each one
    for (const message of pendingMessages) {
      if (message.selfDestruct) {
        scheduleSelfDestruct(message.id, message.selfDestruct, io);
      }
    }

    console.log('Self-destruct: finished scheduling pending self-destructs');
  } catch (error) {
    console.error('Self-destruct: error scheduling pending self-destructs:', error);
  }
}

/**
 * Initialize self-destruct service on server startup
 */
export async function initializeSelfDestruct(io: any) {
  // First, process any messages that expired while server was offline
  await processExpiredMessages(io);

  // Then schedule timers for messages that are still pending
  await scheduleAllPendingSelfDestructs(io);

  // Set up periodic check every minute to catch any missed messages
  setInterval(async () => {
    await processExpiredMessages(io);
  }, 60000);

  console.log('Self-destruct: service initialized');
}
