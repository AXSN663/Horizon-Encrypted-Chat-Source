export interface KeyPair {
    publicKey: string;
    privateKey: string;
}
export interface EncryptedMessage {
    content: string;
    encryptedKey: string;
    iv: string;
}
export interface AESEncryptedMessage {
    content: string;
    iv: string;
}
export declare class CryptoService {
    static generateKeyPair(): Promise<KeyPair>;
    static encryptWithAES(message: string, keyBase64: string): Promise<AESEncryptedMessage>;
    static decryptWithAES(encryptedMessage: AESEncryptedMessage, keyBase64: string): Promise<string>;
    static encryptFileWithAES(file: ArrayBuffer, keyBase64: string): Promise<{
        encryptedData: ArrayBuffer;
        iv: string;
    }>;
    static decryptFileWithAES(encryptedData: ArrayBuffer, ivBase64: string, keyBase64: string): Promise<ArrayBuffer>;
    static encryptMessage(message: string, recipientPublicKeyBase64: string): Promise<EncryptedMessage>;
    static decryptMessage(encryptedMessage: EncryptedMessage, privateKeyBase64: string): Promise<string>;
    static encryptFile(file: ArrayBuffer, recipientPublicKeyBase64: string): Promise<{
        encryptedData: ArrayBuffer;
        encryptedKey: string;
        iv: string;
    }>;
    static decryptFile(encryptedData: ArrayBuffer, encryptedKeyBase64: string, ivBase64: string, privateKeyBase64: string): Promise<ArrayBuffer>;
    private static importPublicKey;
    private static importPrivateKey;
    private static arrayBufferToBase64;
    private static base64ToArrayBuffer;
}
