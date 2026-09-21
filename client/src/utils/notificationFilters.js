function isGroupChatNotification(notification) {
  const category = String(notification?.category || '').toLowerCase();
  const type = String(notification?.type || '').toLowerCase();
  const entityType = String(notification?.entity_type || '').toLowerCase();
  const eventKey = String(notification?.event_key || '').toLowerCase();
  return category === 'chat' || category === 'group_chat' || category === 'group-chat' ||
    type === 'chat' || type === 'group_chat' || type === 'group-chat' ||
    entityType === 'chat_message' || entityType === 'group_message' || entityType === 'batch_group_message' ||
    eventKey.includes('chat') || eventKey.includes('group_chat') || eventKey.includes('group-chat');
}

export { isGroupChatNotification };