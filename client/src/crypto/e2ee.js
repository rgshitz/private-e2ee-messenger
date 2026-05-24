const encoder = new TextEncoder();
const decoder = new TextDecoder();
const iterations = 250000;

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function base64Url(bytes) {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function deriveKey(secret, salt) {
  if (!crypto.subtle) {
    throw new Error('Web Crypto is unavailable. Use HTTPS or localhost.');
  }

  const material = await crypto.subtle.importKey('raw', encoder.encode(secret), 'PBKDF2', false, ['deriveKey']);

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256'
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export function createConversationSecret() {
  return base64Url(randomBytes(32));
}

export async function encryptJson(secret, value) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(secret, salt);
  const plaintext = encoder.encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

  return {
    v: 1,
    kdf: 'PBKDF2-SHA256',
    cipher: 'AES-GCM-256',
    iterations,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext))
  };
}

export async function decryptJson(secret, envelope) {
  if (!envelope?.salt || !envelope?.iv || !envelope?.ciphertext) {
    throw new Error('Invalid encrypted payload');
  }

  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  const data = base64ToBytes(envelope.ciphertext);
  const key = await deriveKey(secret, salt);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);

  return JSON.parse(decoder.decode(plaintext));
}

export async function encryptFile(secret, file) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(secret, salt);
  const bytes = await file.arrayBuffer();
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);

  return {
    blob: new Blob([ciphertext], { type: 'application/octet-stream' }),
    crypto: {
      v: 1,
      kdf: 'PBKDF2-SHA256',
      cipher: 'AES-GCM-256',
      iterations,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv)
    }
  };
}

export async function decryptFile(secret, encryptedBuffer, fileCrypto) {
  const salt = base64ToBytes(fileCrypto.salt);
  const iv = base64ToBytes(fileCrypto.iv);
  const key = await deriveKey(secret, salt);

  return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encryptedBuffer);
}
