import {
  Bell,
  Camera,
  Check,
  CheckCheck,
  Download,
  Eye,
  EyeOff,
  FileAudio,
  FileText,
  FileVideo,
  History,
  Image as ImageIcon,
  KeyRound,
  LogOut,
  Paperclip,
  Pencil,
  Reply,
  Search,
  Send,
  SmilePlus,
  Trash2,
  UserPlus,
  X
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api, downloadEncryptedAttachment, socketUrl, uploadAvatar, uploadEncryptedAttachment } from './api/client.js';
import {
  createConversationSecret,
  decryptFile,
  decryptJson,
  encryptFile,
  encryptJson
} from './crypto/e2ee.js';

const tokenKey = 'cipherchat:token';
const reactions = ['\u{1F44D}', '\u2764\uFE0F', '\u{1F602}', '\u{1F62E}', '\u{1F64F}'];
const avatarColors = ['#00a884', '#128c7e', '#34b7f1', '#25d366', '#7c3aed', '#f97316', '#e11d48'];

function formatTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function formatDayTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: 'numeric'
  }).format(new Date(value));
}

function formatLastSeen(value) {
  if (!value) return 'offline';
  return `last seen ${formatDayTime(value)}`;
}

function conversationOther(conversation, user) {
  return conversation?.members?.find((member) => member.id !== user?.id) || conversation?.members?.[0];
}

function conversationName(conversation, user) {
  if (!conversation) return '';
  if (conversation.title) return conversation.title;
  const other = conversationOther(conversation, user);
  return other?.displayName || other?.username || 'Conversation';
}

function initials(user) {
  const label = user?.displayName || user?.username || '?';
  return label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function secretKey(userId) {
  return `cipherchat:secrets:${userId}`;
}

function readSecrets(userId) {
  try {
    return JSON.parse(localStorage.getItem(secretKey(userId)) || '{}');
  } catch {
    return {};
  }
}

function fileKind(type = '') {
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  return 'document';
}

function fileIcon(kind, size = 18) {
  if (kind === 'image') return <ImageIcon size={size} aria-hidden="true" />;
  if (kind === 'video') return <FileVideo size={size} aria-hidden="true" />;
  if (kind === 'audio') return <FileAudio size={size} aria-hidden="true" />;
  return <FileText size={size} aria-hidden="true" />;
}

function formatSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function decryptMessage(message, secret) {
  if (message.unsentAt) {
    return {
      ...message,
      decrypted: {
        text: '',
        attachments: [],
        locked: false
      }
    };
  }

  try {
    const payload = await decryptJson(secret, message.payload);
    let replyPreview = null;

    if (message.replyTo?.payload && !message.replyTo.unsentAt) {
      try {
        const replyPayload = await decryptJson(secret, message.replyTo.payload);
        replyPreview = {
          sender: message.replyTo.sender,
          text: replyPayload.text || '',
          attachments: replyPayload.attachments || []
        };
      } catch {
        replyPreview = { locked: true };
      }
    }

    return {
      ...message,
      decrypted: {
        text: payload.text || '',
        attachments: payload.attachments || [],
        locked: false,
        replyPreview
      }
    };
  } catch {
    return {
      ...message,
      decrypted: {
        text: '',
        attachments: [],
        locked: true
      }
    };
  }
}

function Avatar({ user, size = 'md', online = false, editable = false }) {
  return (
    <span className={`avatar avatar-${size}`} style={{ background: user?.avatarColor || '#00a884' }}>
      {user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <span>{initials(user)}</span>}
      {online && <i className="presence-dot" aria-hidden="true" />}
      {editable && (
        <span className="avatar-edit">
          <Camera size={14} aria-hidden="true" />
        </span>
      )}
    </span>
  );
}

function PasswordInput({ label, description, value, onChange, autoComplete, placeholder, required = false }) {
  const [visible, setVisible] = useState(false);

  return (
    <label className="field">
      <span>{label}</span>
      <div className="reveal-field">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          minLength={8}
          autoComplete={autoComplete}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          required={required}
        />
        <button
          type="button"
          className="field-eye"
          onClick={() => setVisible((current) => !current)}
          title={visible ? 'Hide password' : 'Show password'}
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
      <small>{description}</small>
    </label>
  );
}

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', password: '', displayName: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      const data = await api(`/auth/${mode}`, {
        method: 'POST',
        body: form
      });
      localStorage.setItem(tokenKey, data.token);
      onAuthenticated(data.token, data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <form className="auth-panel" onSubmit={submit}>
        <div className="auth-brand">
          <div className="brand-lock">
            <KeyRound aria-hidden="true" />
          </div>
          <div>
            <h1>Private Messenger</h1>
            <p>Login to your encrypted chats. Messages and files are encrypted in your browser.</p>
          </div>
        </div>

        <div className="segmented" role="tablist" aria-label="Authentication mode">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
            Login
          </button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>
            Register
          </button>
        </div>

        {mode === 'register' && (
          <label className="field">
            <span>Display name</span>
            <input
              value={form.displayName}
              maxLength={48}
              onChange={(event) => setForm({ ...form, displayName: event.target.value })}
              placeholder="Ada Lovelace"
            />
            <small>This is shown at the top of your profile and inside chats.</small>
          </label>
        )}

        <label className="field">
          <span>Username</span>
          <input
            value={form.username}
            minLength={3}
            maxLength={24}
            autoCapitalize="none"
            autoComplete="username"
            onChange={(event) => setForm({ ...form, username: event.target.value })}
            placeholder="ada_l"
            required
          />
          <small>Use 3-24 lowercase letters, numbers, or underscore. Friends use this to start chats.</small>
        </label>

        <PasswordInput
          label="Password"
          value={form.password}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          onChange={(password) => setForm({ ...form, password })}
          placeholder="8+ characters"
          required
          description="Protects your account login. Conversation keys stay separate for end-to-end encryption."
        />

        {error && <p className="form-error">{error}</p>}
        <button className="primary wide" disabled={busy}>
          {busy ? 'Working...' : mode === 'login' ? 'Login' : 'Create account'}
        </button>
      </form>
    </main>
  );
}

function SecretGate({ conversation, user, onSave }) {
  const [secret, setSecret] = useState('');
  const [visible, setVisible] = useState(false);

  return (
    <section className="secret-gate">
      <KeyRound aria-hidden="true" />
      <h2>Conversation Key</h2>
      <p>Enter or generate the shared secret for {conversationName(conversation, user)}.</p>
      <div className="secret-row">
        <div className="reveal-field">
          <input
            value={secret}
            type={visible ? 'text' : 'password'}
            onChange={(event) => setSecret(event.target.value)}
            placeholder="Conversation secret"
          />
          <button
            type="button"
            className="field-eye"
            onClick={() => setVisible((current) => !current)}
            title={visible ? 'Hide key' : 'Show key'}
            aria-label={visible ? 'Hide key' : 'Show key'}
          >
            {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
        </div>
        <button type="button" className="icon-text" onClick={() => setSecret(createConversationSecret())}>
          <KeyRound size={17} aria-hidden="true" />
          Generate
        </button>
      </div>
      {visible && secret && <code className="secret-preview">{secret}</code>}
      <button className="primary" disabled={!secret.trim()} onClick={() => onSave(secret.trim())}>
        Save Key
      </button>
    </section>
  );
}

function ProfileModal({ user, token, onClose, onSaved, onToast }) {
  const avatarInput = useRef(null);
  const [form, setForm] = useState({
    displayName: user.displayName || '',
    about: user.about || 'Available',
    avatarUrl: user.avatarUrl || '',
    avatarColor: user.avatarColor || '#00a884'
  });
  const [busy, setBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);

  async function save(event) {
    event.preventDefault();
    setBusy(true);

    try {
      const data = await api('/users/me', {
        method: 'PATCH',
        token,
        body: form
      });
      onSaved(data.user);
      onClose();
    } catch (err) {
      onToast(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function uploadDisplayPicture(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      onToast('Choose an image file for DP.');
      return;
    }

    setAvatarBusy(true);
    try {
      const nextUser = await uploadAvatar(file, token);
      setForm((current) => ({
        ...current,
        avatarUrl: nextUser.avatarUrl,
        avatarColor: nextUser.avatarColor || current.avatarColor
      }));
      onSaved(nextUser);
      onToast('Display picture updated.');
    } catch (err) {
      onToast(err.message);
    } finally {
      setAvatarBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <form className="profile-modal" onSubmit={save}>
        <header>
          <h2>Profile</h2>
          <button type="button" className="icon-button" onClick={onClose} title="Close">
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="profile-avatar">
          <Avatar user={{ ...user, ...form }} size="xl" editable />
          <p>Upload a display picture or choose a fallback color.</p>
        </div>
        <input
          ref={avatarInput}
          className="hidden-input"
          type="file"
          accept="image/*"
          onChange={uploadDisplayPicture}
        />
        <button type="button" className="secondary wide" onClick={() => avatarInput.current?.click()} disabled={avatarBusy}>
          <Camera size={17} aria-hidden="true" />
          {avatarBusy ? 'Uploading DP...' : 'Upload DP from device'}
        </button>
        <div className="color-swatches" aria-label="Avatar color">
          {avatarColors.map((color) => (
            <button
              type="button"
              key={color}
              className={form.avatarColor === color ? 'selected' : ''}
              style={{ background: color }}
              onClick={() => setForm({ ...form, avatarColor: color })}
              title={color}
            />
          ))}
        </div>
        <label className="field">
          <span>Name</span>
          <input
            value={form.displayName}
            maxLength={48}
            onChange={(event) => setForm({ ...form, displayName: event.target.value })}
          />
          <small>Your current user name appears at the top of the navigation pane.</small>
        </label>
        <label className="field">
          <span>Status</span>
          <input
            value={form.about}
            maxLength={140}
            onChange={(event) => setForm({ ...form, about: event.target.value })}
          />
          <small>This short line appears under your name and beside your active status.</small>
        </label>
        <button className="primary wide" disabled={busy}>
          {busy ? 'Saving...' : 'Save profile'}
        </button>
      </form>
    </div>
  );
}

function Sidebar({
  conversations,
  activeId,
  user,
  presence,
  unreadCounts,
  notificationPermission,
  onSelect,
  onStart,
  onLogout,
  onProfile,
  onNotifications
}) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const onlineCount = Object.values(presence).filter((item) => item.isOnline).length;

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      await onStart(username);
      setUsername('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="sidebar">
      <div className="me-card">
        <button className="profile-button" onClick={onProfile} title="Edit profile">
          <Avatar user={user} online size="lg" />
          <span>
            <strong>{user.displayName || user.username}</strong>
            <small>{user.about || 'Available'}</small>
          </span>
        </button>
        <div className="me-actions">
          <button
            className={`icon-button ${notificationPermission === 'granted' ? 'good' : ''}`}
            onClick={onNotifications}
            title="Notifications"
            aria-label="Notifications"
          >
            <Bell size={18} aria-hidden="true" />
          </button>
          <button className="icon-button" onClick={onLogout} title="Logout" aria-label="Logout">
            <LogOut size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      <form className="start-chat" onSubmit={submit}>
        <input
          value={username}
          autoCapitalize="none"
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Start chat by username"
        />
        <button className="icon-button filled" disabled={busy || username.trim().length < 3} title="Start chat">
          <UserPlus size={18} aria-hidden="true" />
        </button>
      </form>
      {error && <p className="sidebar-error">{error}</p>}

      <div className="inbox-heading">
        <div>
          <h2>Inbox</h2>
          <p>{conversations.length} chats, {onlineCount} online</p>
        </div>
      </div>

      <nav className="conversation-list" aria-label="Inbox">
        {conversations.map((conversation) => {
          const other = conversationOther(conversation, user);
          const online = Boolean(presence[other?.id]?.isOnline);
          const unread = unreadCounts[conversation.id] || 0;

          return (
            <button
              key={conversation.id}
              className={`conversation-item ${activeId === conversation.id ? 'active' : ''}`}
              onClick={() => onSelect(conversation.id)}
            >
              <Avatar user={other} online={online} />
              <span className="conversation-main">
                <strong>{conversationName(conversation, user)}</strong>
                <small>{online ? 'online' : formatLastSeen(other?.lastSeenAt || presence[other?.id]?.lastSeenAt)}</small>
              </span>
              <span className="conversation-side">
                <time>{formatDayTime(conversation.lastMessageAt || conversation.updatedAt)}</time>
                {unread > 0 && <b>{unread > 9 ? '9+' : unread}</b>}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

function AttachmentPreview({ attachment, onPreview, onDownload, onOpenViewer }) {
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const autoPreviewTried = useRef(false);
  const kind = fileKind(attachment.type);

  useEffect(() => {
    return () => {
      if (preview?.url) URL.revokeObjectURL(preview.url);
    };
  }, [preview?.url]);

  useEffect(() => {
    if (autoPreviewTried.current || kind === 'document') return;
    autoPreviewTried.current = true;
    loadPreview();
  }, [kind]);

  async function loadPreview() {
    if (preview || busy) return;
    setBusy(true);
    try {
      const nextPreview = await onPreview(attachment);
      setPreview(nextPreview);
    } finally {
      setBusy(false);
    }
  }

  if (preview && kind === 'image') {
    return (
      <figure className="media-preview">
        <button className="image-preview-button" onClick={() => onOpenViewer({ attachment, preview })}>
          <img src={preview.url} alt={attachment.name} />
        </button>
        <figcaption>{attachment.name}</figcaption>
      </figure>
    );
  }

  if (preview && kind === 'video') {
    return (
      <figure className="media-preview">
        <video src={preview.url} controls />
        <figcaption>{attachment.name}</figcaption>
      </figure>
    );
  }

  if (preview && kind === 'audio') {
    return (
      <figure className="media-preview audio">
        {fileIcon(kind, 20)}
        <audio src={preview.url} controls />
      </figure>
    );
  }

  return (
    <div className={`attachment-card ${kind}`}>
      <button className="attachment-main" onClick={loadPreview}>
        {fileIcon(kind)}
        <span>
          <strong>{attachment.name}</strong>
          <small>{formatSize(attachment.size)} {kind}</small>
        </span>
      </button>
      <button className="icon-button tiny" onClick={() => onDownload(attachment)} title="Download">
        <Download size={15} aria-hidden="true" />
      </button>
    </div>
  );
}

function ReadState({ message, user }) {
  if (message.sender?.id !== user.id || message.unsentAt) return null;
  const read = (message.readBy || []).some((receipt) => receipt.userId !== user.id);

  return (
    <span className={`read-state ${read ? 'read' : ''}`} title={read ? 'Read by recipient' : 'Sent'}>
      {read ? <CheckCheck size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
    </span>
  );
}

function MessageBubble({
  message,
  user,
  onReply,
  onReact,
  onCustomReact,
  onEdit,
  onUnsend,
  onDownload,
  onPreview,
  onOpenViewer,
  onHistory
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.decrypted?.text || '');
  const own = message.sender?.id === user.id;
  const locked = message.decrypted?.locked;
  const groupedReactions = Object.values(
    (message.reactions || []).reduce((groups, reaction) => {
      groups[reaction.emoji] ||= { emoji: reaction.emoji, count: 0 };
      groups[reaction.emoji].count += 1;
      return groups;
    }, {})
  );

  useEffect(() => {
    setEditText(message.decrypted?.text || '');
  }, [message.decrypted?.text]);

  if (locked) return null;

  return (
    <article className={`message ${own ? 'own' : ''} ${message.unsentAt ? 'unsent' : ''}`}>
      {!own && <strong className="sender-name">{message.sender?.displayName || message.sender?.username}</strong>}

      {message.decrypted?.replyPreview && !message.decrypted.replyPreview.locked && (
        <div className="reply-preview">
          <span>{message.decrypted.replyPreview.sender?.displayName || 'Reply'}</span>
          <p>{message.decrypted.replyPreview.text || 'Attachment'}</p>
        </div>
      )}

      {message.unsentAt ? (
        <p className="muted-text">Message unsent</p>
      ) : editing ? (
        <form
          className="edit-box"
          onSubmit={(event) => {
            event.preventDefault();
            onEdit(message, editText);
            setEditing(false);
          }}
        >
          <textarea value={editText} onChange={(event) => setEditText(event.target.value)} rows={3} />
          <div className="edit-actions">
            <button type="button" className="icon-button" onClick={() => setEditing(false)} title="Cancel">
              <X size={17} aria-hidden="true" />
            </button>
            <button className="icon-button filled" title="Save">
              <Check size={17} aria-hidden="true" />
            </button>
          </div>
        </form>
      ) : (
        <>
          {!!message.decrypted?.attachments?.length && (
            <div className="attachments">
              {message.decrypted.attachments.map((attachment) => (
                <AttachmentPreview
                  key={attachment.id}
                  attachment={attachment}
                  onDownload={onDownload}
                  onPreview={onPreview}
                  onOpenViewer={onOpenViewer}
                />
              ))}
            </div>
          )}
          {message.decrypted?.text && <p className="message-text">{message.decrypted.text}</p>}
        </>
      )}

      {!!groupedReactions.length && (
        <div className="reaction-row">
          {groupedReactions.map((reaction) => (
            <button key={reaction.emoji} onClick={() => onReact(message, reaction.emoji)}>
              {reaction.emoji} {reaction.count}
            </button>
          ))}
        </div>
      )}

      <div className="message-footer">
        <time>{formatTime(message.createdAt)}</time>
        <ReadState message={message} user={user} />
      </div>

      {!message.unsentAt && (
        <div className="message-actions">
          {reactions.map((emoji) => (
            <button key={emoji} onClick={() => onReact(message, emoji)} title={`React ${emoji}`}>
              {emoji}
            </button>
          ))}
          <button className="icon-button" onClick={() => onCustomReact(message)} title="Custom reaction">
            <SmilePlus size={16} aria-hidden="true" />
          </button>
          <button className="icon-button" onClick={() => onReply(message)} title="Reply">
            <Reply size={16} aria-hidden="true" />
          </button>
          {own && (
            <button className="icon-button" onClick={() => setEditing(true)} title="Edit">
              <Pencil size={16} aria-hidden="true" />
            </button>
          )}
          {message.editHistoryCount > 0 && (
            <button className="icon-button" onClick={() => onHistory(message)} title="History">
              <History size={16} aria-hidden="true" />
            </button>
          )}
          {own && (
            <button className="icon-button danger" onClick={() => onUnsend(message)} title="Unsend">
              <Trash2 size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function SelectedFilePreview({ file, onRemove }) {
  const [url, setUrl] = useState('');
  const kind = fileKind(file.type);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <div className="selected-file">
      {kind === 'image' && url ? <img src={url} alt="" /> : fileIcon(kind, 20)}
      <span>
        <strong>{file.name}</strong>
        <small>{formatSize(file.size)}</small>
      </span>
      <button onClick={onRemove} title="Remove file">
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

function Composer({ draft, setDraft, files, setFiles, replyTo, setReplyTo, onSend, busy }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const inputs = {
    image: useRef(null),
    video: useRef(null),
    audio: useRef(null),
    document: useRef(null)
  };

  function addFiles(event) {
    const selected = Array.from(event.target.files || []);
    setFiles([...files, ...selected]);
    event.target.value = '';
    setMenuOpen(false);
  }

  return (
    <footer className="composer">
      {replyTo && (
        <div className="replying">
          <Reply size={16} aria-hidden="true" />
          <span>{replyTo.decrypted?.text || 'Replying to attachment'}</span>
          <button className="icon-button tiny" onClick={() => setReplyTo(null)} title="Cancel reply">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      {!!files.length && (
        <div className="file-strip">
          {files.map((file) => (
            <SelectedFilePreview
              key={`${file.name}-${file.lastModified}-${file.size}`}
              file={file}
              onRemove={() => setFiles(files.filter((item) => item !== file))}
            />
          ))}
        </div>
      )}

      <input ref={inputs.image} className="hidden-input" type="file" accept="image/*" multiple onChange={addFiles} />
      <input ref={inputs.video} className="hidden-input" type="file" accept="video/*" multiple onChange={addFiles} />
      <input ref={inputs.audio} className="hidden-input" type="file" accept="audio/*" multiple onChange={addFiles} />
      <input
        ref={inputs.document}
        className="hidden-input"
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,application/pdf,text/plain"
        multiple
        onChange={addFiles}
      />

      <div className="compose-row">
        <div className="attach-wrap">
          <button className="icon-button" onClick={() => setMenuOpen((current) => !current)} title="Attach files">
            <Paperclip size={19} aria-hidden="true" />
          </button>
          {menuOpen && (
            <div className="attach-menu">
              <button onClick={() => inputs.image.current?.click()}>
                <ImageIcon size={18} aria-hidden="true" />
                Photos
              </button>
              <button onClick={() => inputs.video.current?.click()}>
                <FileVideo size={18} aria-hidden="true" />
                Videos
              </button>
              <button onClick={() => inputs.audio.current?.click()}>
                <FileAudio size={18} aria-hidden="true" />
                Audio
              </button>
              <button onClick={() => inputs.document.current?.click()}>
                <FileText size={18} aria-hidden="true" />
                Documents
              </button>
            </div>
          )}
        </div>
        <textarea
          value={draft}
          rows={1}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Message"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              onSend();
            }
          }}
        />
        <button className="icon-button filled send-button" disabled={busy || (!draft.trim() && !files.length)} onClick={onSend}>
          <Send size={19} aria-hidden="true" />
        </button>
      </div>
    </footer>
  );
}

function HistoryModal({ history, onClose }) {
  if (!history) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="history-modal">
        <header>
          <h2>Edit History</h2>
          <button className="icon-button" onClick={onClose} title="Close">
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        {history.items.length ? (
          <div className="history-list">
            {history.items.map((item) => (
              <article key={item.id}>
                <time>{formatDayTime(item.editedAt)}</time>
                <p>{item.locked ? 'Unable to decrypt this edit.' : item.text || 'Attachment-only message'}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted-text">No previous edits.</p>
        )}
      </section>
    </div>
  );
}

function ImageViewer({ item, onClose, onDownload }) {
  const [zoom, setZoom] = useState(1);

  if (!item) return null;

  return (
    <div className="image-viewer-backdrop" role="dialog" aria-modal="true">
      <div className="image-viewer-toolbar">
        <strong>{item.attachment.name}</strong>
        <div>
          <button onClick={() => setZoom((current) => Math.max(0.5, current - 0.25))}>-</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((current) => Math.min(3, current + 0.25))}>+</button>
          <button onClick={() => setZoom(1)}>Reset</button>
          <button onClick={() => onDownload(item.attachment)}>Download</button>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
      <div className="image-viewer-stage">
        <img src={item.preview.url} alt={item.attachment.name} style={{ transform: `scale(${zoom})` }} />
      </div>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(tokenKey));
  const [checkingAuth, setCheckingAuth] = useState(Boolean(token));
  const [user, setUser] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [messages, setMessages] = useState([]);
  const [decryptedMessages, setDecryptedMessages] = useState([]);
  const [secrets, setSecrets] = useState({});
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState([]);
  const [replyTo, setReplyTo] = useState(null);
  const [search, setSearch] = useState('');
  const [socket, setSocket] = useState(null);
  const [presence, setPresence] = useState({});
  const [unreadCounts, setUnreadCounts] = useState({});
  const [notificationPermission, setNotificationPermission] = useState(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  );
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [history, setHistory] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [imageViewer, setImageViewer] = useState(null);
  const activeRef = useRef(activeId);
  const messagesEndRef = useRef(null);

  const activeConversation = conversations.find((conversation) => conversation.id === activeId);
  const activeSecret = activeId ? secrets[activeId] : '';
  const activeOther = conversationOther(activeConversation, user);
  const activeOnline = Boolean(presence[activeOther?.id]?.isOnline);

  const readableMessages = useMemo(
    () => decryptedMessages.filter((message) => !message.decrypted?.locked),
    [decryptedMessages]
  );

  const hiddenUnreadableCount = decryptedMessages.length - readableMessages.length;

  const visibleMessages = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return readableMessages;

    return readableMessages.filter((message) => {
      const text = message.decrypted?.text || '';
      const attachments = message.decrypted?.attachments || [];
      return (
        text.toLowerCase().includes(q) ||
        attachments.some((attachment) => attachment.name.toLowerCase().includes(q))
      );
    });
  }, [readableMessages, search]);

  const emptyMessage = search.trim()
    ? 'No matching messages.'
    : hiddenUnreadableCount > 0
      ? 'Use the correct conversation key to read this chat.'
      : 'No messages here yet.';

  useEffect(() => {
    activeRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!token) {
      setCheckingAuth(false);
      return;
    }

    setCheckingAuth(true);
    api('/auth/me', { token })
      .then((data) => {
        setUser(data.user);
        setSecrets(readSecrets(data.user.id));
      })
      .catch(() => logout())
      .finally(() => setCheckingAuth(false));
  }, [token]);

  useEffect(() => {
    if (!token || !user) return;

    loadConversations();
    const nextSocket = io(socketUrl(), { auth: { token } });
    setSocket(nextSocket);

    nextSocket.on('presence:snapshot', ({ onlineUserIds }) => {
      setPresence((current) => {
        const next = { ...current };
        onlineUserIds.forEach((userId) => {
          next[userId] = { ...(next[userId] || {}), isOnline: true };
        });
        return next;
      });
    });

    nextSocket.on('presence:update', ({ userId, isOnline, lastSeenAt }) => {
      setPresence((current) => ({
        ...current,
        [userId]: {
          ...(current[userId] || {}),
          isOnline,
          lastSeenAt: lastSeenAt || current[userId]?.lastSeenAt
        }
      }));
    });

    nextSocket.on('message:new', (message) => {
      const incoming = message.sender?.id !== user.id;

      if (message.conversationId === activeRef.current) {
        setMessages((current) => {
          if (current.some((item) => item.id === message.id)) return current;
          return [...current, message];
        });
        if (incoming) markConversationRead(message.conversationId);
        if (incoming && document.hidden) notifyIncoming(message);
      } else if (incoming) {
        setUnreadCounts((current) => ({
          ...current,
          [message.conversationId]: (current[message.conversationId] || 0) + 1
        }));
        notifyIncoming(message);
      }
      loadConversations();
    });

    ['message:updated', 'message:deleted', 'message:reaction'].forEach((eventName) => {
      nextSocket.on(eventName, (message) => {
        if (message.conversationId === activeRef.current) {
          setMessages((current) => current.map((item) => (item.id === message.id ? message : item)));
        }
        loadConversations();
      });
    });

    nextSocket.on('message:read', ({ conversationId, userId, messageIds, readAt }) => {
      if (conversationId !== activeRef.current) return;

      setMessages((current) =>
        current.map((message) => {
          if (!messageIds.includes(message.id) || message.readBy?.some((receipt) => receipt.userId === userId)) {
            return message;
          }

          return {
            ...message,
            readBy: [...(message.readBy || []), { userId, readAt }]
          };
        })
      );
    });

    return () => nextSocket.close();
  }, [token, user?.id]);

  useEffect(() => {
    if (!socket || !activeId) return undefined;
    socket.emit('conversation:join', activeId);
    return () => socket.emit('conversation:leave', activeId);
  }, [socket, activeId]);

  useEffect(() => {
    setSearch('');
    setReplyTo(null);
    setUnreadCounts((current) => ({ ...current, [activeId]: 0 }));
    setSearchOpen(false);
  }, [activeId]);

  useEffect(() => {
    if (!activeId || !token) {
      setMessages([]);
      return;
    }

    api(`/conversations/${activeId}/messages`, { token })
      .then((data) => setMessages(data.messages))
      .catch((err) => setToast(err.message));
  }, [activeId, token]);

  useEffect(() => {
    if (!activeId || !messages.length) return;
    markConversationRead(activeId);
  }, [activeId, messages.length]);

  useEffect(() => {
    let cancelled = false;

    if (!activeSecret) {
      setDecryptedMessages([]);
      return;
    }

    Promise.all(messages.map((message) => decryptMessage(message, activeSecret))).then((nextMessages) => {
      if (!cancelled) setDecryptedMessages(nextMessages);
    });

    return () => {
      cancelled = true;
    };
  }, [messages, activeSecret]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [visibleMessages.length, activeId]);

  async function loadConversations() {
    if (!token) return;
    const data = await api('/conversations', { token });
    setConversations(data.conversations);
    if (!activeRef.current && data.conversations[0]) {
      setActiveId(data.conversations[0].id);
    }
  }

  function logout() {
    localStorage.removeItem(tokenKey);
    setToken('');
    setUser(null);
    setConversations([]);
    setActiveId('');
    setMessages([]);
    setSecrets({});
  }

  function notifyIncoming(message) {
    const sender = message.sender?.displayName || message.sender?.username || 'New message';
    setToast(`New message from ${sender}`);

    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

    if (document.hidden || message.conversationId !== activeRef.current) {
      new Notification(sender, {
        body: 'New encrypted message',
        tag: message.conversationId
      });
    }
  }

  async function requestNotifications() {
    if (typeof Notification === 'undefined') {
      setToast('Browser notifications are not supported here.');
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === 'granted') {
      new Notification('Private Messenger', { body: 'Notifications are enabled for this browser.' });
    }
    setToast(permission === 'granted' ? 'Notifications enabled.' : 'Notifications not enabled.');
  }

  function saveSecret(conversationId, secret) {
    const next = { ...secrets, [conversationId]: secret };
    setSecrets(next);
    localStorage.setItem(secretKey(user.id), JSON.stringify(next));
  }

  function promptConversationKey() {
    if (!activeConversation) return;
    const next = window.prompt('Conversation key', activeSecret || createConversationSecret());
    if (next) saveSecret(activeConversation.id, next.trim());
  }

  function selectConversation(conversationId) {
    setActiveId(conversationId);
    setUnreadCounts((current) => ({ ...current, [conversationId]: 0 }));
  }

  async function startConversation(username) {
    const data = await api('/conversations/direct', {
      method: 'POST',
      token,
      body: { username }
    });
    await loadConversations();
    selectConversation(data.conversation.id);
  }

  async function markConversationRead(conversationId) {
    if (!token || !conversationId) return;

    try {
      const data = await api(`/conversations/${conversationId}/read`, {
        method: 'POST',
        token
      });

      if (!data.messageIds?.length) return;

      setMessages((current) =>
        current.map((message) => {
          if (!data.messageIds.includes(message.id) || message.readBy?.some((receipt) => receipt.userId === data.userId)) {
            return message;
          }

          return {
            ...message,
            readBy: [...(message.readBy || []), { userId: data.userId, readAt: data.readAt }]
          };
        })
      );
    } catch {
      // Read receipts are helpful, not critical.
    }
  }

  async function sendMessage() {
    if (!activeConversation || !activeSecret || busy) return;
    if (!draft.trim() && !files.length) return;

    setBusy(true);
    setToast('');

    try {
      const attachmentPayloads = [];
      const attachmentIds = [];

      for (const file of files) {
        const encrypted = await encryptFile(activeSecret, file);
        const uploaded = await uploadEncryptedAttachment(activeConversation.id, encrypted.blob, token);
        attachmentIds.push(uploaded.id);
        attachmentPayloads.push({
          id: uploaded.id,
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
          crypto: encrypted.crypto
        });
      }

      const payload = await encryptJson(activeSecret, {
        text: draft.trim(),
        attachments: attachmentPayloads
      });

      const data = await api(`/conversations/${activeConversation.id}/messages`, {
        method: 'POST',
        token,
        body: {
          payload,
          attachments: attachmentIds,
          replyTo: replyTo?.id
        }
      });

      setMessages((current) => {
        if (current.some((message) => message.id === data.message.id)) return current;
        return [...current, data.message];
      });
      setDraft('');
      setFiles([]);
      setReplyTo(null);
      await loadConversations();
    } catch (err) {
      setToast(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function editMessage(message, text) {
    try {
      const payload = await encryptJson(activeSecret, {
        text: text.trim(),
        attachments: message.decrypted?.attachments || []
      });
      const data = await api(`/messages/${message.id}`, {
        method: 'PATCH',
        token,
        body: { payload }
      });
      setMessages((current) => current.map((item) => (item.id === message.id ? data.message : item)));
    } catch (err) {
      setToast(err.message);
    }
  }

  async function unsendMessage(message) {
    if (!window.confirm('Unsend this message for everyone?')) return;

    try {
      const data = await api(`/messages/${message.id}`, {
        method: 'DELETE',
        token
      });
      setMessages((current) => current.map((item) => (item.id === message.id ? data.message : item)));
    } catch (err) {
      setToast(err.message);
    }
  }

  async function reactToMessage(message, emoji) {
    try {
      const data = await api(`/messages/${message.id}/reactions`, {
        method: 'POST',
        token,
        body: { emoji }
      });
      setMessages((current) => current.map((item) => (item.id === message.id ? data.message : item)));
    } catch (err) {
      setToast(err.message);
    }
  }

  async function customReactToMessage(message) {
    const emoji = window.prompt('Type an emoji or short reaction');
    const reaction = emoji?.trim();

    if (!reaction) return;
    if ([...reaction].length > 8) {
      setToast('Reaction is too long.');
      return;
    }

    await reactToMessage(message, reaction);
  }

  async function decryptAttachmentBlob(attachment) {
    const encrypted = await downloadEncryptedAttachment(attachment.id, token);
    const plaintext = await decryptFile(activeSecret, encrypted, attachment.crypto);
    return new Blob([plaintext], { type: attachment.type });
  }

  async function previewAttachment(attachment) {
    try {
      const blob = await decryptAttachmentBlob(attachment);
      return {
        url: URL.createObjectURL(blob),
        type: attachment.type,
        name: attachment.name
      };
    } catch (err) {
      setToast(err.message);
      throw err;
    }
  }

  async function downloadAttachment(attachment) {
    try {
      const blob = await decryptAttachmentBlob(attachment);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.name;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setToast(err.message);
    }
  }

  async function openHistory(message) {
    try {
      const data = await api(`/messages/${message.id}/history`, { token });
      const items = await Promise.all(
        data.history.map(async (item) => {
          try {
            const payload = await decryptJson(activeSecret, item.payload);
            return { ...item, text: payload.text || '' };
          } catch {
            return { ...item, locked: true };
          }
        })
      );
      setHistory({ message, items });
    } catch (err) {
      setToast(err.message);
    }
  }

  function profileSaved(nextUser) {
    setUser(nextUser);
    setConversations((current) =>
      current.map((conversation) => ({
        ...conversation,
        members: conversation.members.map((member) => (member.id === nextUser.id ? nextUser : member))
      }))
    );
  }

  if (token && checkingAuth && !user) {
    return (
      <main className="auth-page">
        <section className="auth-panel">
          <div className="brand-lock">
            <KeyRound aria-hidden="true" />
          </div>
          <h1>Opening Private Messenger</h1>
        </section>
      </main>
    );
  }

  if (!token || !user) {
    return (
      <AuthScreen
        onAuthenticated={(nextToken, nextUser) => {
          setToken(nextToken);
          setUser(nextUser);
          setSecrets(readSecrets(nextUser.id));
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        user={user}
        presence={presence}
        unreadCounts={unreadCounts}
        notificationPermission={notificationPermission}
        onSelect={selectConversation}
        onStart={startConversation}
        onLogout={logout}
        onProfile={() => setProfileOpen(true)}
        onNotifications={requestNotifications}
      />

      <main className="chat-pane">
        {activeConversation ? (
          <>
            <header className="chat-header">
              <div className="chat-title">
                <Avatar user={activeOther} online={activeOnline} />
                <div>
                  <h1>{conversationName(activeConversation, user)}</h1>
                  <p>
                    {activeOnline
                      ? 'online'
                      : formatLastSeen(activeOther?.lastSeenAt || presence[activeOther?.id]?.lastSeenAt)}
                  </p>
                </div>
              </div>
              <div className="chat-tools">
                <label className={`search-box ${searchOpen ? 'mobile-open' : ''}`}>
                  <Search size={17} aria-hidden="true" />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" />
                  {search && (
                    <button
                      type="button"
                      className="search-clear"
                      onClick={() => setSearch('')}
                      title="Clear search"
                      aria-label="Clear search"
                    >
                      <X size={15} aria-hidden="true" />
                    </button>
                  )}
                </label>
                <button
                  className="icon-button mobile-search-toggle"
                  title="Search"
                  aria-label="Search"
                  onClick={() => setSearchOpen((current) => !current)}
                >
                  <Search size={18} aria-hidden="true" />
                </button>
                <button
                  className={`icon-button ${activeSecret ? 'good' : ''}`}
                  onClick={promptConversationKey}
                  title="Conversation key"
                  aria-label="Conversation key"
                >
                  <KeyRound size={18} aria-hidden="true" />
                </button>
              </div>
            </header>

            {activeSecret ? (
              <>
                <section className="messages" aria-live="polite">
                  {visibleMessages.map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      user={user}
                      onReply={setReplyTo}
                      onReact={reactToMessage}
                      onCustomReact={customReactToMessage}
                      onEdit={editMessage}
                      onUnsend={unsendMessage}
                      onDownload={downloadAttachment}
                      onPreview={previewAttachment}
                      onOpenViewer={setImageViewer}
                      onHistory={openHistory}
                    />
                  ))}
                  {!visibleMessages.length && <p className="empty-state">{emptyMessage}</p>}
                  <div ref={messagesEndRef} aria-hidden="true" />
                </section>
                <Composer
                  draft={draft}
                  setDraft={setDraft}
                  files={files}
                  setFiles={setFiles}
                  replyTo={replyTo}
                  setReplyTo={setReplyTo}
                  onSend={sendMessage}
                  busy={busy}
                />
              </>
            ) : (
              <SecretGate
                conversation={activeConversation}
                user={user}
                onSave={(secret) => saveSecret(activeConversation.id, secret)}
              />
            )}
          </>
        ) : (
          <section className="no-chat">
            <SmilePlus aria-hidden="true" />
            <h1>Select or start a conversation</h1>
          </section>
        )}
      </main>

      {toast && (
        <button className="toast" onClick={() => setToast('')}>
          {toast}
        </button>
      )}
      <HistoryModal history={history} onClose={() => setHistory(null)} />
      <ImageViewer item={imageViewer} onClose={() => setImageViewer(null)} onDownload={downloadAttachment} />
      {profileOpen && (
        <ProfileModal
          user={user}
          token={token}
          onClose={() => setProfileOpen(false)}
          onSaved={profileSaved}
          onToast={setToast}
        />
      )}
    </div>
  );
}
