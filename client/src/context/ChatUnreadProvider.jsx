import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import { getChatBatches } from '../api/chatApi';
import { useAuth } from './AuthContext';
import { ChatUnreadContext } from './chatUnreadContext';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

export function ChatUnreadProvider({ children }) {
  const { user, token } = useAuth();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const chatOpenRef = useRef(false);
  const chatRouteRef = useRef(false);

  useEffect(() => {
    chatOpenRef.current = chatOpen;
  }, [chatOpen]);

  useEffect(() => {
    const isChatRoute = location.pathname.toLowerCase().endsWith('/group-chat');
    chatRouteRef.current = isChatRoute;
    if (isChatRoute) setUnreadCount(0);
  }, [location.pathname]);

  useEffect(() => {
    if (!token || !user?.id) {
      setUnreadCount(0);
      return undefined;
    }

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    let mounted = true;
    let batchesLoaded = false;

    socket.on('connect', async () => {
      if (!mounted || batchesLoaded) return;
      batchesLoaded = true;
      try {
        const data = await getChatBatches();
        const list = data.batches || [];
        list.forEach((batch) => {
          socket.emit('chat:join_batch', batch.id);
        });
      } catch {
        batchesLoaded = false;
      }
    });

    socket.on('disconnect', () => {
      batchesLoaded = false;
    });

    socket.on('chat:new_message', (message) => {
      if (!mounted || chatOpenRef.current || chatRouteRef.current) return;
      if (!message) return;
      if (String(message.user_id) === String(user.id)) return;
      setUnreadCount((count) => count + 1);
    });

    return () => {
      mounted = false;
      socket.disconnect();
    };
  }, [token, user?.id]);

  const markRead = useCallback(() => {
    setUnreadCount(0);
  }, []);

  const openChat = useCallback(() => {
    chatOpenRef.current = true;
    setChatOpen(true);
    setUnreadCount(0);
  }, []);

  const closeChat = useCallback(() => {
    chatOpenRef.current = false;
    setChatOpen(false);
    setUnreadCount(0);
  }, []);

  const value = useMemo(() => ({
    unreadCount,
    chatOpen,
    openChat,
    closeChat,
    markRead,
  }), [unreadCount, chatOpen, openChat, closeChat, markRead]);

  return <ChatUnreadContext.Provider value={value}>{children}</ChatUnreadContext.Provider>;
}
