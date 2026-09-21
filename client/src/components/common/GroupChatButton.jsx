import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MessageCircle } from 'lucide-react';
import { useChatUnread } from '../../hooks/useChatUnread';
import BatchChat from '../social/BatchChat';
import styles from './GroupChatButton.module.css';

export default function GroupChatButton({ user }) {
  const { unreadCount, chatOpen, openChat, closeChat } = useChatUnread();
  const buttonRef = useRef(null);
  const modalRef = useRef(null);

  useEffect(() => {
    if (!chatOpen) return undefined;

    function handlePointerDown(event) {
      const clickedButton = buttonRef.current?.contains(event.target);
      const clickedModal = modalRef.current?.contains(event.target);

      if (!clickedButton && !clickedModal) {
        closeChat();
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') closeChat();
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [chatOpen, closeChat]);

  return (
    <>
      <div className={styles.wrapper}>
        <button
          ref={buttonRef}
          type="button"
          className={styles.iconButton}
          onClick={openChat}
          aria-label={`Group chat${unreadCount ? `, ${unreadCount} unread` : ''}`}
          aria-expanded={chatOpen}
        >
          <MessageCircle size={20} strokeWidth={1.8} />
          {unreadCount > 0 && (
            <span className={styles.badge}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </div>

      {chatOpen && createPortal(
        <div
          ref={modalRef}
          className={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-label="Group Chat"
        >
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Group Chat</h2>
              <button
                type="button"
                className={styles.closeButton}
                onClick={closeChat}
                aria-label="Close group chat"
              >
                ×
              </button>
            </div>
            <div className={styles.modalBody}>
              <BatchChat user={user} inModal />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
