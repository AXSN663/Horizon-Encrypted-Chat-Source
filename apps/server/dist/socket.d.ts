import { Server } from 'socket.io';
export declare let ioInstance: Server | null;
export declare const setupSocketHandlers: (io: Server) => void;
