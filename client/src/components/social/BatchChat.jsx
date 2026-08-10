import { useEffect, useRef, useState } from 'react';
import {
  getChatBatches,
  getChatMessages,
  sendChatMessage,
  sendChatReply,
  deleteChatMessage,
  addReaction,
  removeReaction,
} from '../../api/chatApi';
import { io } from 'socket.io-client';
import styles from './BatchChat.module.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

function getToken() {
  return localStorage.getItem('wim-token') || '';
}

function formatMessageDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '👏', '🔥'];

export default function BatchChat({ user }) {
  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [openMessageId, setOpenMessageId] = useState(null);
  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);
  const menuRefs = useRef({});

  const currentUserId = user?.id;

  useEffect(() => {
    let mounted = true;

    getChatBatches()
      .then((data) => {
        if (!mounted) return;
        const list = data.batches || [];
        setBatches(list);
        if (list.length > 0) {
          setSelectedBatchId(list[0].id);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err.message);
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedBatchId) return;
    let mounted = true;

    getChatMessages(selectedBatchId)
      .then((data) => {
        if (!mounted) return;
        setMessages(data.messages || []);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err.message);
      });

    return () => {
      mounted = false;
    };
  }, [selectedBatchId]);

  useEffect(() => {
    if (!selectedBatchId) return;
    const token = getToken();
    const socket = io(API_BASE, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('chat:join_batch', selectedBatchId);
    });

    socket.on('chat:new_message', (message) => {
      if (Number(message.teacher_batch_id) === Number(selectedBatchId)) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === message.id)) return prev;
          return [...prev, message];
        });
      }
    });

    socket.on('chat:new_reply', ({ parentMessageId, reply }) => {
      if (Number(reply.teacher_batch_id) === Number(selectedBatchId)) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === parentMessageId
              ? { ...m, replies: [...(m.replies || []), reply] }
              : m
          )
        );
      }
    });

    socket.on('chat:message_deleted', ({ messageId, deleted_for }) => {
      setMessages((prev) => {
        if (deleted_for === 'everyone') {
          return prev.map((m) =>
            m.id === messageId ? { ...m, is_deleted: true, content: '' } : m
          );
        }
        return prev;
      });
    });

    socket.on('chat:message_hidden', ({ messageId, userId }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                deleted_by_user_ids: Array.from(
                  new Set([...(m.deleted_by_user_ids || []), userId])
                ),
              }
            : m
        )
      );
    });

    socket.on('chat:reaction_updated', ({ messageId, reactions }) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reactions } : m))
      );
    });

    return () => {
      socket.emit('chat:leave_batch', selectedBatchId);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [selectedBatchId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (openMessageId && menuRefs.current[openMessageId]) {
        if (!menuRefs.current[openMessageId].contains(e.target)) {
          setOpenMessageId(null);
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMessageId]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || sending || !selectedBatchId) return;
    setSending(true);
    setError('');
    try {
      const data = await sendChatMessage(selectedBatchId, newMessage.trim());
      setMessages((prev) => {
        if (prev.some((m) => m.id === data.message.id)) return prev;
        return [...prev, data.message];
      });
      setNewMessage('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const handleReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || sending || !replyTo || !selectedBatchId) return;
    setSending(true);
    setError('');
    try {
      const data = await sendChatReply(selectedBatchId, replyText.trim(), replyTo.id);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === replyTo.id
            ? { ...m, replies: [...(m.replies || []), data.message] }
            : m
        )
      );
      setReplyTo(null);
      setReplyText('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (msg, deleteForEveryone) => {
    setOpenMessageId(null);
    try {
      await deleteChatMessage(selectedBatchId, msg.id, deleteForEveryone);
      if (deleteForEveryone) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.id ? { ...m, is_deleted: true, content: '' } : m
          )
        );
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.id
              ? {
                  ...m,
                  deleted_by_user_ids: Array.from(
                    new Set([...(m.deleted_by_user_ids || []), currentUserId])
                  ),
                }
              : m
          )
        );
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleReaction = async (msg, emoji) => {
    try {
      const currentReactions = msg.reactions || {};
      const users = Array.isArray(currentReactions[emoji]) ? currentReactions[emoji] : [];
      const hasReacted = users.some((id) => String(id) === String(currentUserId));
      const data = hasReacted
        ? await removeReaction(selectedBatchId, msg.id, emoji)
        : await addReaction(selectedBatchId, msg.id, emoji);
      const updatedReactions = data.reactions;
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, reactions: updatedReactions } : m))
      );
    } catch (err) {
      setError(err.message);
    }
  };

  const renderReactionSummary = (reactions) => {
    if (!reactions || Object.keys(reactions).length === 0) return null;
    return (
      <div className={styles.reactionSummary}>
        {Object.entries(reactions).map(([emoji, users]) => {
          if (!Array.isArray(users) || users.length === 0) return null;
          return (
            <span key={emoji} className={styles.reactionBadge}>
              {emoji} {users.length > 1 ? users.length : ''}
            </span>
          );
        })}
      </div>
    );
  };

  const renderMessage = (msg, isReply = false) => {
    const isMe = String(msg.user_id) === String(currentUserId);
    const authorName = `${msg.first_name || ''} ${msg.last_name || ''}`.trim() || msg.user_role || 'User';
    const roleLabel = (msg.user_role || '').toLowerCase();
    const roleBadge =
      roleLabel === 'teacher'
        ? 'Teacher'
        : roleLabel === 'student'
        ? 'Student'
        : roleLabel === 'coordinator'
        ? 'Coordinator'
        : roleLabel === 'supervisor'
        ? 'Supervisor'
        : roleLabel === 'admin'
        ? 'Admin'
        : '';
    const isDeletedForMe =
      Array.isArray(msg.deleted_by_user_ids) &&
      msg.deleted_by_user_ids.some((id) => String(id) === String(currentUserId));
    const isHidden = msg.is_deleted || isDeletedForMe;

    return (
      <div
        key={msg.id}
        className={`${styles.messageRow} ${isMe ? styles.messageRowMe : styles.messageRowOther}`}
      >
        {isHidden ? (
          <div className={`${styles.messageBubble} ${isMe ? styles.messageBubbleMe : styles.messageBubbleOther} ${styles.hiddenMessage}`}>
            <span className={styles.hiddenText}>
              {msg.is_deleted ? 'Message deleted' : 'You hid this message'}
            </span>
          </div>
        ) : (
          <>
            <div className={`${styles.messageBubble} ${isMe ? styles.messageBubbleMe : styles.messageBubbleOther}`}>
              <div className={styles.messageHeader}>
                <div className={styles.messageAuthor}>{authorName}</div>
                {roleBadge && <span className={styles.roleBadge}>{roleBadge}</span>}
              </div>
              <div className={styles.messageContent}>{msg.content}</div>
              {renderReactionSummary(msg.reactions)}
              <div className={styles.messageFooter}>
                <div className={styles.messageTime}>{formatMessageDate(msg.created_at)}</div>
                {!isReply && (
                  <div className={styles.messageActions}>
                    <button
                      type="button"
                      className={styles.actionBtn}
                      onClick={() => setReplyTo({ ...msg, isReply: true })}
                      title="Reply"
                    >
                      &#8617;
                    </button>
                    <div className={styles.reactionPicker}>
                      {QUICK_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          className={styles.reactionBtn}
                          onClick={() => handleReaction(msg, emoji)}
                          title={`React with ${emoji}`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                    {isMe && (
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => setOpenMessageId(openMessageId === msg.id ? null : msg.id)}
                        title="More options"
                      >
                        &#8230;
                      </button>
                    )}
                    {openMessageId === msg.id && isMe && (
                      <div
                        ref={(el) => { menuRefs.current[msg.id] = el; }}
                        className={styles.messageMenu}
                      >
                        <button type="button" className={styles.menuItem} onClick={() => handleDelete(msg, false)}>
                          Delete for you
                        </button>
                        <button type="button" className={`${styles.menuItem} ${styles.menuItemDanger}`} onClick={() => handleDelete(msg, true)}>
                          Delete for everyone
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {msg.replies && msg.replies.length > 0 && (
              <div className={styles.repliesContainer}>
                {msg.replies
                  .filter(
                    (r) =>
                      !(
                        r.is_deleted ||
                        (Array.isArray(r.deleted_by_user_ids) &&
                          r.deleted_by_user_ids.includes(currentUserId))
                      )
                  )
                  .map((r) => renderMessage(r, true))}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const selectedBatch = batches.find((b) => b.id === selectedBatchId);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Group Chat</h2>
        <p className={styles.subtitle}>Chat with your batch members</p>
      </div>

      <div className={styles.layout}>
        <div className={styles.sidebar}>
          <h3 className={styles.sidebarTitle}>My Batches</h3>
          {loading ? (
            <p className={styles.loading}>Loading...</p>
          ) : batches.length === 0 ? (
            <p className={styles.emptySidebar}>No batches assigned yet.</p>
          ) : (
            <ul className={styles.batchList}>
              {batches.map((batch) => (
                <li key={batch.id}>
                  <button
                    type="button"
                    className={`${styles.batchItem} ${batch.id === selectedBatchId ? styles.batchItemActive : ''}`}
                    onClick={() => setSelectedBatchId(batch.id)}
                  >
                    <span className={styles.batchLabel}>{batch.batch_label}</span>
                    <span className={styles.batchMeta}>
                      {batch.teacher && <span>Teacher: {batch.teacher}</span>}
                      {batch.supervisor && <span>Supervisor: {batch.supervisor}</span>}
                      <span>Coordinator: {batch.coordinator}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.chatArea}>
          {selectedBatch ? (
            <>
              <div className={styles.chatHeader}>
                <div>
                  <h3 className={styles.chatTitle}>{selectedBatch.batch_label}</h3>
                  <p className={styles.chatSubtitle}>
                    Teacher: {selectedBatch.teacher}
                    {selectedBatch.supervisor && ` | Supervisor: ${selectedBatch.supervisor}`}
                    {' | Coordinator: '}{selectedBatch.coordinator}
                  </p>
                </div>
              </div>

              <div className={styles.messages}>
                {messages.length === 0 && (
                  <div className={styles.emptyMessages}>
                    <p>No messages yet. Start the conversation!</p>
                  </div>
                )}
                {messages.map((msg) => renderMessage(msg, false))}
                <div ref={messagesEndRef} />
              </div>

              {error && <div className={styles.error}>{error}</div>}

              {replyTo && (
                <div className={styles.replyBanner}>
                  <div className={styles.replyInfo}>
                    <span className={styles.replyLabel}>Replying to</span>
                    <span className={styles.replyText}>{replyTo.content}</span>
                  </div>
                  <button
                    type="button"
                    className={styles.replyCancel}
                    onClick={() => setReplyTo(null)}
                  >
                    ×
                  </button>
                </div>
              )}

              <form className={styles.inputArea} onSubmit={replyTo ? handleReply : handleSend}>
                <input
                  type="text"
                  className={styles.input}
                  placeholder={replyTo ? 'Type your reply...' : 'Type a message...'}
                  value={replyTo ? replyText : newMessage}
                  onChange={(e) => {
                    if (replyTo) setReplyText(e.target.value);
                    else setNewMessage(e.target.value);
                  }}
                  disabled={sending}
                />
                <button type="submit" className={styles.sendBtn} disabled={sending || !(replyTo ? replyText.trim() : newMessage.trim())}>
                  {sending ? 'Sending...' : replyTo ? 'Reply' : 'Send'}
                </button>
              </form>
            </>
          ) : (
            <div className={styles.emptyChat}>
              <p>Select a batch to start chatting.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
