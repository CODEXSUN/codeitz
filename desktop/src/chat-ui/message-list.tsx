import type { ReactNode } from "react";

export type ChatMessage = { id: string; role: "user" | "assistant" | "agent" | "system"; content: ReactNode; label?: string };

export function MessageList({ messages }: { messages: readonly ChatMessage[] }) {
  return <ol className="codeitz-messages" aria-label="Conversation messages">{messages.map(message =>
    <li key={message.id} className={`codeitz-message ${message.role === "user" ? "codeitz-message-user" : "codeitz-message-other"}`}>
      <article className="codeitz-message-bubble"><div className="codeitz-message-label">{message.label ?? (message.role === "user" ? "You" : message.role === "agent" ? "Coworker" : message.role === "system" ? "Codeitz" : "Assistant")}</div><div className="codeitz-message-content">{message.content}</div></article>
    </li>)}</ol>;
}
