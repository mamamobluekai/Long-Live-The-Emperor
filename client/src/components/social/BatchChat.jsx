import { useEffect, useRef, useState } from 'react';
import {
  getChatBatches,
  getBatchMembers,
  getChatMessages,
  sendChatMessage,
  sendChatReply,
  deleteChatMessage,
  addReaction,
  removeReaction,
} from '../../api/chatApi';
import { io } from 'socket.io-client';
import { SOCKET_URL } from '../../config/api';
import styles from './BatchChat.module.css';


function getToken() {
  return localStorage.getItem('wim-token') || '';
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😭'];

const findMessage = (list, id) => {
  for (const message of list) {
    if (message.id === id) return message;
    const reply = (message.replies || []).find((item) => item.id === id);
    if (reply) return reply;
  }
  return null;
};

const patchMessage = (list, id, patch) =>
  list.map((m) => {
    if (m.id === id) return { ...m, ...patch };
    if (m.replies && m.replies.length) {
      return { ...m, replies: m.replies.map((r) => (r.id === id ? { ...r, ...patch } : r)) };
    }
    return m;
  });

function formatDayLabel(date) {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

  return date.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function BatchChat({ user, inModal = false }) {
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
  const [batchesOpen, setBatchesOpen] = useState(false);
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);
  const menuRefs = useRef({});

  const currentUserId = user?.id;
  const pressTimerRef = useRef(null);

  const cancelPress = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const startPress = (messageId) => {
    cancelPress();
    pressTimerRef.current = setTimeout(() => {
      setOpenMessageId(messageId);
    }, 400);
  };

  const endPress = () => {
    cancelPress();
  };

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
    const socket = io(SOCKET_URL, {
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
          return patchMessage(prev, messageId, { is_deleted: true, content: '' });
        }
        return prev;
      });
    });

    socket.on('chat:message_hidden', ({ messageId, userId }) => {
      setMessages((prev) =>
        patchMessage(prev, messageId, {
          deleted_by_user_ids: Array.from(
            new Set([...(findMessage(prev, messageId)?.deleted_by_user_ids || []), userId])
          ),
        })
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
    if (!selectedBatchId || !batchesOpen) return;
    let mounted = true;
    setMembersLoading(true);
    getBatchMembers(selectedBatchId)
      .then((data) => {
        if (mounted) setMembers(data.members || []);
      })
      .catch(() => {
        if (mounted) setMembers([]);
      })
      .finally(() => {
        if (mounted) setMembersLoading(false);
      });
    return () => { mounted = false; };
  }, [selectedBatchId, batchesOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!window.visualViewport) return undefined;
    const viewport = window.visualViewport;
    const handleResize = () => {
      if (viewport.height < window.innerHeight * 0.85) {
        messagesEndRef.current?.scrollIntoView({ block: 'end' });
      }
    };
    viewport.addEventListener('resize', handleResize);
    return () => viewport.removeEventListener('resize', handleResize);
  }, []);

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
        setMessages((prev) => patchMessage(prev, msg.id, { is_deleted: true, content: '' }));
      } else {
        setMessages((prev) =>
          patchMessage(prev, msg.id, {
            deleted_by_user_ids: Array.from(
              new Set([...(msg.deleted_by_user_ids || []), currentUserId])
            ),
          })
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

  const renderMessage = (msg, isReply = false, parentAuthor = '') => {
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
      <div key={msg.id} className={styles.messageBlock}>
        {isHidden ? (
          <p className={styles.hiddenText}>
            {msg.is_deleted ? 'This message was deleted' : 'You hid this message'}
          </p>
        ) : (
          <>
            <div
              className={`${styles.messageRow} ${isMe ? styles.messageRowMe : styles.messageRowOther} ${isReply ? styles.messageRowReply : ''}`}
              onContextMenu={(e) => e.preventDefault()}
              onClick={() => setOpenMessageId(openMessageId === msg.id ? null : msg.id)}
              onTouchStart={() => startPress(msg.id)}
              onTouchEnd={endPress}
              onTouchMove={cancelPress}
            >
              <div
                className={styles.messageStack}
                onClick={(event) => event.stopPropagation()}
              >
                <div className={styles.messageSenderLine}>
                  {isReply && parentAuthor ? (
                    <span className={styles.replyContext}>
                      {isMe ? 'You' : authorName.split(' ')[0]} replied to{' '}
                      <strong>{isMe ? parentAuthor.split(' ')[0] : 'you'}</strong>
                    </span>
                  ) : !isMe ? (
                    <>
                      <span className={styles.messageAuthor}>{authorName}</span>
                      {roleBadge && <span className={styles.roleBadge}>{roleBadge}</span>}
                    </>
                  ) : (
                    <span className={styles.youBadge}>You</span>
                  )}
                </div>

                <div className={`${styles.messageBubble} ${isMe ? styles.messageBubbleMe : styles.messageBubbleOther}`}>
                  <div className={styles.messageContent}>{msg.content}</div>
                </div>

                <div className={styles.messageMeta}>
                  {renderReactionSummary(msg.reactions)}
                  <span className={styles.messageTime}>
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>

                {openMessageId === msg.id && (
                  <div
                    ref={(el) => { menuRefs.current[msg.id] = el; }}
                    className={styles.messageActionsBar}
                    onClick={(event) => event.stopPropagation()}
                  >
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
                    {!isMe && (
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => { setOpenMessageId(null); setReplyTo({ ...msg, isReply: true }); }}
                        title="Reply"
                      >
                        Reply to {authorName.split(' ')[0]}
                      </button>
                    )}
                    {isMe && (
                      <>
                        <button
                          type="button"
                          className={styles.actionBtn}
                          onClick={() => handleDelete(msg, false)}
                          title="Delete for me"
                        >
                          Delete for me
                        </button>
                        <button
                          type="button"
                          className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                          onClick={() => handleDelete(msg, true)}
                          title="Delete for all"
                        >
                          Delete for all
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  const selectedBatch = batches.find((b) => b.id === selectedBatchId);

  const authorNameOf = (item) =>
    `${item.first_name || ''} ${item.last_name || ''}`.trim() || item.user_role || 'User';

  const chatTimeline = messages
    .flatMap((message) => [
      { item: message, parentAuthor: '' },
      ...(message.replies || []).map((reply) => ({
        item: reply,
        parentAuthor: authorNameOf(message),
      })),
    ])
    .sort((a, b) => new Date(a.item.created_at) - new Date(b.item.created_at));

  const timelineWithDividers = chatTimeline.map((entry, index) => {
    const current = new Date(entry.item.created_at);
    const previous = chatTimeline[index - 1];
    const previousDay = previous ? new Date(previous.item.created_at).toDateString() : null;
    const isNewDay = previousDay !== current.toDateString();

    return {
      type: isNewDay ? 'day' : 'message',
      label: formatDayLabel(current),
      key: current.toDateString(),
      entry,
    };
  });

  return (
    <div className={`${styles.container} ${inModal ? styles.modalMode : ''}`}>
      <div className={styles.header}>
        <h2 className={styles.title}>Group Chat</h2>
        <p className={styles.subtitle}>Chat with your batch members</p>
      </div>

      <div className={`${styles.layout} ${inModal ? styles.modalLayout : ''}`}>
        <div className={styles.chatArea}>
          <button type="button" className={styles.batchesButton} onClick={() => setBatchesOpen(true)}>
            Batches
          </button>
          <div className={styles.chatToolbarDivider} />

          {selectedBatch ? (
            <>
              <div className={styles.messages}>
                {messages.length === 0 && (
                  <div className={styles.emptyMessages}>
                    <p>No messages yet. Start the conversation!</p>
                  </div>
                )}
                {timelineWithDividers.map((row, index) => {
                  const { item, parentAuthor } = row.entry;

                  return (
                    <div key={`${row.key}-${item.id}-${index}`} className={styles.timelineGroup}>
                      {row.type === 'day' && (
                        <div className={styles.dayDivider}>
                          <span>{row.label}</span>
                        </div>
                      )}
                      <div className={styles.timelineRow}>
                        {renderMessage(item, Boolean(parentAuthor), parentAuthor)}
                      </div>
                    </div>
                  );
                })}
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
                <textarea
                  rows={1}
                  className={styles.input}
                  placeholder={replyTo ? 'Type your reply...' : 'Type a message...'}
                  value={replyTo ? replyText : newMessage}
                  onChange={(e) => {
                    if (replyTo) setReplyText(e.target.value);
                    else setNewMessage(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (replyTo) handleReply(e);
                      else handleSend(e);
                    }
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

      {batchesOpen && (
        <div
          className={styles.drawerOverlay}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setBatchesOpen(false);
          }}
        >
          <aside className={styles.batchesDrawer} role="dialog" aria-modal="true" aria-label="Batch details">
            <div className={styles.drawerHeader}>
              <div>
                <span className={styles.drawerEyebrow}>Group chat</span>
                <h3>Batches</h3>
              </div>
              <button type="button" className={styles.drawerClose} onClick={() => setBatchesOpen(false)} aria-label="Close">
                ✕
              </button>
            </div>

            <div className={styles.drawerBody}>
              {loading ? (
                <p className={styles.emptySidebar}>Loading...</p>
              ) : batches.length === 0 ? (
                <p className={styles.emptySidebar}>No batches assigned yet.</p>
              ) : (
                <ul className={styles.batchList}>
                  {batches.map((batch) => (
                    <li key={batch.id}>
                      <button
                        type="button"
                        className={`${styles.batchItem} ${batch.id === selectedBatchId ? styles.batchItemActive : ''}`}
                        onClick={() => {
                          setSelectedBatchId(batch.id);
                          setBatchesOpen(false);
                        }}
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

              {selectedBatch && (
                <div className={styles.membersBlock}>
                  <h4 className={styles.membersTitle}>
                    Classmates · {selectedBatch.batch_label}
                  </h4>
                  {membersLoading ? (
                    <p className={styles.emptySidebar}>Loading classmates...</p>
                  ) : members.length === 0 ? (
                    <p className={styles.emptySidebar}>No classmates found.</p>
                  ) : (
                    <ul className={styles.membersList}>
                      {members.map((member) => (
                        <li key={member.id} className={styles.memberItem}>
                          <span className={styles.memberName}>
                            {member.name}
                            {String(member.id) === String(currentUserId) && <em> (You)</em>}
                          </span>
                          {member.studentNumber && (
                            <span className={styles.memberId}>{member.studentNumber}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
