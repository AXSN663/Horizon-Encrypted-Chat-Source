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

export class CryptoService {
  static async generateKeyPair(): Promise<KeyPair> {
    const keyPair = await window.crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['encrypt', 'decrypt']
    );

    const publicKey = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
    const privateKey = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

    return {
      publicKey: this.arrayBufferToBase64(publicKey),
      privateKey: this.arrayBufferToBase64(privateKey),
    };
  }

  // AES-based encryption for shared keys (much faster)
  static async encryptWithAES(message: string, keyBase64: string): Promise<AESEncryptedMessage> {
    const keyBuffer = this.base64ToArrayBuffer(keyBase64);
    const aesKey = await window.crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );

    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encodedMessage = new TextEncoder().encode(message);

    const encryptedContent = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      encodedMessage
    );

    return {
      content: this.arrayBufferToBase64(encryptedContent),
      iv: this.arrayBufferToBase64(iv.buffer as ArrayBuffer),
    };
  }

  static async decryptWithAES(encryptedMessage: AESEncryptedMessage, keyBase64: string): Promise<string> {
    const keyBuffer = this.base64ToArrayBuffer(keyBase64);
    const aesKey = await window.crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    const iv = this.base64ToArrayBuffer(encryptedMessage.iv);
    const encryptedContent = this.base64ToArrayBuffer(encryptedMessage.content);

    const decryptedContent = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      encryptedContent
    );

    return new TextDecoder().decode(decryptedContent);
  }

  static async encryptFileWithAES(file: ArrayBuffer, keyBase64: string): Promise<{ encryptedData: ArrayBuffer; iv: string }> {
    const keyBuffer = this.base64ToArrayBuffer(keyBase64);
    const aesKey = await window.crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );

    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const encryptedData = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      file
    );

    return {
      encryptedData,
      iv: this.arrayBufferToBase64(iv.buffer as ArrayBuffer),
    };
  }

  static async decryptFileWithAES(encryptedData: ArrayBuffer, ivBase64: string, keyBase64: string): Promise<ArrayBuffer> {
    const keyBuffer = this.base64ToArrayBuffer(keyBase64);
    const aesKey = await window.crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    const iv = this.base64ToArrayBuffer(ivBase64);

    return await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      encryptedData
    );
  }

  static async encryptMessage(
    message: string,
    recipientPublicKeyBase64: string
  ): Promise<EncryptedMessage> {
    const aesKey = await window.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encodedMessage = new TextEncoder().encode(message);

    const encryptedContent = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      encodedMessage
    );

    const recipientPublicKey = await this.importPublicKey(recipientPublicKeyBase64);
    const exportedAesKey = await window.crypto.subtle.exportKey('raw', aesKey);
    const encryptedAesKey = await window.crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      recipientPublicKey,
      exportedAesKey
    );

    return {
      content: this.arrayBufferToBase64(encryptedContent),
      encryptedKey: this.arrayBufferToBase64(encryptedAesKey),
      iv: this.arrayBufferToBase64(iv.buffer as ArrayBuffer),
    };
  }

  static async decryptMessage(
    encryptedMessage: EncryptedMessage,
    privateKeyBase64: string
  ): Promise<string> {
    const privateKey = await this.importPrivateKey(privateKeyBase64);

    const encryptedAesKey = this.base64ToArrayBuffer(encryptedMessage.encryptedKey);
    const aesKeyBuffer = await window.crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      privateKey,
      encryptedAesKey
    );

    const aesKey = await window.crypto.subtle.importKey(
      'raw',
      aesKeyBuffer,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    const iv = this.base64ToArrayBuffer(encryptedMessage.iv);
    const encryptedContent = this.base64ToArrayBuffer(encryptedMessage.content);

    const decryptedContent = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      encryptedContent
    );

    return new TextDecoder().decode(decryptedContent);
  }

  static async encryptFile(
    file: ArrayBuffer,
    recipientPublicKeyBase64: string
  ): Promise<{ encryptedData: ArrayBuffer; encryptedKey: string; iv: string }> {
    const aesKey = await window.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const encryptedData = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      file
    );

    const recipientPublicKey = await this.importPublicKey(recipientPublicKeyBase64);
    const exportedAesKey = await window.crypto.subtle.exportKey('raw', aesKey);
    const encryptedAesKey = await window.crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      recipientPublicKey,
      exportedAesKey
    );

    return {
      encryptedData,
      encryptedKey: this.arrayBufferToBase64(encryptedAesKey),
      iv: this.arrayBufferToBase64(iv.buffer as ArrayBuffer),
    };
  }

  static async decryptFile(
    encryptedData: ArrayBuffer,
    encryptedKeyBase64: string,
    ivBase64: string,
    privateKeyBase64: string
  ): Promise<ArrayBuffer> {
    const privateKey = await this.importPrivateKey(privateKeyBase64);

    const encryptedAesKey = this.base64ToArrayBuffer(encryptedKeyBase64);
    const aesKeyBuffer = await window.crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      privateKey,
      encryptedAesKey
    );

    const aesKey = await window.crypto.subtle.importKey(
      'raw',
      aesKeyBuffer,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    const iv = this.base64ToArrayBuffer(ivBase64);

    return await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      encryptedData
    );
  }

  private static async importPublicKey(base64Key: string): Promise<CryptoKey> {
    const keyBuffer = this.base64ToArrayBuffer(base64Key);
    return await window.crypto.subtle.importKey(
      'spki',
      keyBuffer,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['encrypt']
    );
  }

  private static async importPrivateKey(base64Key: string): Promise<CryptoKey> {
    const keyBuffer = this.base64ToArrayBuffer(base64Key);
    return await window.crypto.subtle.importKey(
      'pkcs8',
      keyBuffer,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['decrypt']
    );
  }

  private static arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private static base64ToArrayBuffer(base64: string): ArrayBuffer {
    // Validate base64 string
    if (!base64 || typeof base64 !== 'string') {
      throw new Error('Invalid base64: empty or not a string');
    }
    // Check for valid base64 characters only
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(base64)) {
      throw new Error('Invalid base64: contains invalid characters');
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
