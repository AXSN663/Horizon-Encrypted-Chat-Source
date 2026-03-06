/**
 * Schedule a message for self-destruction
 */
export declare function scheduleSelfDestruct(messageId: string, selfDestructTime: Date, io: any): void;
/**
 * Clear a self-destruct timer (e.g., if message is manually deleted)
 */
export declare function clearSelfDestructTimer(messageId: string): void;
/**
 * Check for and process expired messages on server startup
 * This ensures messages are deleted even if the server was offline
 */
export declare function processExpiredMessages(io: any): Promise<void>;
/**
 * Schedule all pending self-destruct messages on server startup
 */
export declare function scheduleAllPendingSelfDestructs(io: any): Promise<void>;
/**
 * Initialize self-destruct service on server startup
 */
export declare function initializeSelfDestruct(io: any): Promise<void>;
