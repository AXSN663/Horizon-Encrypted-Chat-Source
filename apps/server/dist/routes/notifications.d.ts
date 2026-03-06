declare const router: import("express-serve-static-core").Router;
export declare function createNotification(data: {
    userId: string;
    type: string;
    title: string;
    content?: string;
    senderId?: string;
    roomId?: string;
    requestId?: string;
}): Promise<{
    id: string;
    userId: string;
    createdAt: Date;
    type: string;
    roomId: string | null;
    content: string | null;
    senderId: string | null;
    title: string;
    requestId: string | null;
    isRead: boolean;
} | null>;
export { router as notificationRouter };
