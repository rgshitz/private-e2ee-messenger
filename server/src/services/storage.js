import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { v2 as cloudinary } from 'cloudinary';

function storageDriver() {
  return process.env.STORAGE_DRIVER === 'cloudinary' ? 'cloudinary' : 'local';
}

function uploadDir() {
  return path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
}

function configureCloudinary() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

function uploadToCloudinary(buffer) {
  configureCloudinary();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: process.env.CLOUDINARY_FOLDER || 'private-e2ee-messenger',
        resource_type: 'raw'
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(result);
      }
    );

    Readable.from(buffer).pipe(stream);
  });
}

function uploadImageToCloudinary(buffer) {
  configureCloudinary();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `${process.env.CLOUDINARY_FOLDER || 'private-e2ee-messenger'}/avatars`,
        resource_type: 'image'
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(result);
      }
    );

    Readable.from(buffer).pipe(stream);
  });
}

export async function saveAvatarImage(buffer, mimetype, filename) {
  const driver = storageDriver();

  if (driver === 'cloudinary') {
    const result = await uploadImageToCloudinary(buffer);
    return result.secure_url;
  }

  const avatarsDir = path.join(uploadDir(), 'avatars');
  await fs.promises.mkdir(avatarsDir, { recursive: true });
  await fs.promises.writeFile(path.join(avatarsDir, filename), buffer);
  return null;
}

export async function saveEncryptedObject(buffer) {
  const driver = storageDriver();

  if (driver === 'cloudinary') {
    const result = await uploadToCloudinary(buffer);

    return {
      provider: 'cloudinary',
      storageKey: result.public_id,
      url: result.secure_url,
      byteLength: buffer.length
    };
  }

  await fs.promises.mkdir(uploadDir(), { recursive: true });
  const storageKey = `${crypto.randomUUID()}.cipher`;
  await fs.promises.writeFile(path.join(uploadDir(), storageKey), buffer);

  return {
    provider: 'local',
    storageKey,
    byteLength: buffer.length
  };
}

export async function streamEncryptedObject(attachment, res) {
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', attachment.byteLength);
  res.setHeader('Cache-Control', 'private, max-age=0, no-store');

  if (attachment.provider === 'cloudinary') {
    const response = await fetch(attachment.url);
    if (!response.ok || !response.body) {
      const error = new Error('Could not fetch attachment blob');
      error.status = 502;
      throw error;
    }

    Readable.fromWeb(response.body).pipe(res);
    return;
  }

  fs.createReadStream(path.join(uploadDir(), attachment.storageKey)).pipe(res);
}

export async function deleteEncryptedObject(attachment) {
  if (!attachment) return;

  if (attachment.provider === 'cloudinary') {
    configureCloudinary();
    await cloudinary.uploader.destroy(attachment.storageKey, { resource_type: 'raw' }).catch(() => {});
    return;
  }

  await fs.promises.unlink(path.join(uploadDir(), attachment.storageKey)).catch(() => {});
}
