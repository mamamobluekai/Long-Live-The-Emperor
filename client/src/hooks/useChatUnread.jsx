import { useContext } from 'react';
import { ChatUnreadContext } from '../context/chatUnreadContext';

export function useChatUnread() {
  const value = useContext(ChatUnreadContext);
  if (!value) throw new Error('useChatUnread must be used inside ChatUnreadProvider.');
  return value;
}
