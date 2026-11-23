export const MAX_APP_COWORKERS: 2;

type RecordTime = {
  id: string;
  createdAt?: string;
  created_at?: string | Date;
};

export function pickAppActors(
  appId: string,
  conversations: readonly (RecordTime & { appId?: string | null; app_id?: string | null })[],
  coworkers: readonly (RecordTime & { conversationId?: string; conversation_id?: string })[],
): {
  supervisorId: string | null;
  activeCoworkerIds: string[];
  historyConversationIds: string[];
  historyCoworkerIds: string[];
};

export function internalThreadName(appName: string, role: string): string;
