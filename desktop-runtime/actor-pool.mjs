export const MAX_APP_COWORKERS = 2;

function oldest(left, right) {
  const timestamp = (value) =>
    new Date(value.createdAt ?? value.created_at ?? 0).getTime() || 0;
  return timestamp(left) - timestamp(right) || left.id.localeCompare(right.id);
}

/** Selection only: never merge, delete or rewrite historical actors/messages. */
export function pickAppActors(appId, conversations, coworkers) {
  const chats = conversations
    .filter((item) => (item.appId ?? item.app_id) === appId)
    .sort(oldest);
  const supervisorId = chats[0]?.id ?? null;
  const conversationIds = new Set(chats.map((item) => item.id));
  const all = coworkers
    .filter((item) => conversationIds.has(item.conversationId ?? item.conversation_id))
    .sort(oldest);
  const active = all
    .filter((item) => (item.conversationId ?? item.conversation_id) === supervisorId)
    .slice(0, MAX_APP_COWORKERS);
  const activeIds = new Set(active.map((item) => item.id));

  return {
    supervisorId,
    activeCoworkerIds: [...activeIds],
    historyConversationIds: chats.slice(1).map((item) => item.id),
    historyCoworkerIds: all
      .filter((item) => !activeIds.has(item.id))
      .map((item) => item.id),
  };
}

export function internalThreadName(appName, role) {
  const clean = (value) => String(value)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return `Codeitz · ${clean(appName)} · ${clean(role)}`;
}
