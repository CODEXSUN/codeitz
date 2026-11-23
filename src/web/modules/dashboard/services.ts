import { appFetch } from '../../platform-client';
import type { TodoData } from '../../../../contracts/todo';
import type { Conversation } from '../../../../contracts/chat';

export async function readDashboardSource<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await appFetch(url, { cache: 'no-store', signal });
  if (!response.ok) throw new Error(`Could not load summary (${response.status}).`);
  return response.json();
}

export type DashboardSources = { todos: TodoData; chats: { conversations: Conversation[] } };
