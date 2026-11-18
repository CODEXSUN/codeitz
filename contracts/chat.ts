import { z } from 'zod';
export const chatCreate = z.object({ owner: z.string().min(1).max(150) }).strict();
export const chatSend = z.object({ content: z.string().trim().min(1).max(8000), mode: z.enum(['explore','plan','review']), requestId: z.string().uuid() }).strict();
export type ChatMode = 'explore' | 'plan' | 'review';
export type Conversation = { id: string; owner: string; title: string; createdAt: string; updatedAt: string };
export type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string; mode: ChatMode; status: 'completed' | 'running' | 'failed' | 'stopped' | 'interrupted'; createdAt: string; updatedAt: string };
export type ChatActivity = { id: number; kind: string; message: string; time: string };
export type ChatTaskLink = { messageId: string; taskId: string; approvedAt: string; state: 'pending' | 'ready' };
export type ChatDetail = { conversation: Conversation; messages: ChatMessage[]; activities: ChatActivity[]; taskLinks: ChatTaskLink[] };
