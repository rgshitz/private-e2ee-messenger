# CipherChat: Private E2EE MERN Messenger

CipherChat is a MERN stack starter for a private web messaging app. Messages and attachments are encrypted in the browser with Web Crypto before they touch the API. The Node/Express server stores MongoDB metadata, ciphertext, reactions, reply links, edit history, and encrypted attachment blobs.

## Included Features

- Register/login with JWT auth and bcrypt password hashing
- Direct conversations between users
- End-to-end encrypted text messages with per-message AES-GCM envelopes
- Encrypted image, video, audio, and document attachments
- Replying to messages with decrypted reply previews
- Edit messages with encrypted edit history
- Unsend messages and delete associated encrypted attachment blobs
- Reactions, realtime updates, and Socket.IO conversation rooms
- Local search over decrypted message text and attachment names
- Local or Cloudinary-backed encrypted attachment storage

## Security Model

This starter uses a shared conversation secret that is created and stored only in each browser's local storage. The API never receives that secret and cannot decrypt message bodies or files.

Important limits:

- This is a strong learning/MVP model, not a complete Signal protocol implementation.
- Usernames, conversation membership, timestamps, reaction emoji, attachment sizes, and traffic patterns are server-visible metadata.
- Conversation secrets must be shared outside the app for now.
- Local browser storage is convenient, but a compromised device/browser profile can expose saved secrets.
- Production E2EE should add identity keys, device keys, key verification, key rotation, forward secrecy, abuse controls, audit logging, rate limiting, and backups.

## Project Layout

```text
.
|-- client/                  # React + Vite app
|-- server/                  # Express + MongoDB + Socket.IO API
|-- .env.example             # Local development environment variables
|-- .env.production.example  # Hosted production environment variables
|-- render.yaml              # Render Blueprint for hosted realtime deployment
`-- package.json             # npm workspaces
```

## Local Setup

1. Install Node.js 20+ and MongoDB, or create a free MongoDB Atlas cluster.
2. Copy `.env.example` to `.env` in the project root and set `MONGO_URI` plus a long `JWT_SECRET`.
3. Copy `client/.env.example` to `client/.env` if your API URL differs from localhost.
4. Install dependencies:

```bash
npm install
```

5. Run both apps:

```bash
npm run dev
```

The API runs on `http://localhost:4000` and the client runs on `http://localhost:5173`.

Opening `http://localhost:4000` shows API status. Open `http://localhost:5173` for the web app during development.

To serve the built React app from the Express server, run:

```bash
npm run build
```

Then set:

```env
SERVE_CLIENT_DIST=true
CLIENT_DIST_PATH=client/dist
```

If you use Docker locally, you can start MongoDB with:

```bash
docker compose up -d mongo
```

## Attachment Storage

For local development:

```env
STORAGE_DRIVER=local
UPLOAD_DIR=uploads
```

For Cloudinary:

```env
STORAGE_DRIVER=cloudinary
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
CLOUDINARY_FOLDER=private-e2ee-messenger
```

Files are encrypted before upload, so the storage provider receives opaque encrypted bytes. Original filenames and MIME types are stored inside the encrypted message payload.

## Free/Freemium Deployment Path

For the first live realtime version, deploy this as one Node web service that serves React, the API, and Socket.IO from the same domain.

- App host: Render web service using the included `render.yaml`.
- Database: MongoDB Atlas free cluster.
- Attachments: Cloudinary-backed encrypted blobs.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the step-by-step hosting guide.

## Environment Variables

Server:

```env
PORT=4000
NODE_ENV=development
CLIENT_ORIGIN=http://localhost:5173
MONGO_URI=mongodb://127.0.0.1:27017/private_e2ee_messenger
JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=7d
STORAGE_DRIVER=local
UPLOAD_DIR=uploads
MAX_ATTACHMENT_MB=25
```

Client:

```env
VITE_API_URL=http://localhost:4000/api
VITE_SOCKET_URL=http://localhost:4000
```

## Next Hardening Steps

- Replace shared passphrases with X25519 identity/device keys and per-device encrypted conversation keys.
- Add signed prekeys, key verification, and device change warnings.
- Encrypt or redesign reactions if reaction privacy matters.
- Add refresh tokens, CSRF strategy if cookies are used, account recovery, and rate limiting.
- Add message pagination controls in the UI and server-side retention controls.
- Add automated tests for auth, membership checks, message authorization, edit/unsend, and attachment access.
