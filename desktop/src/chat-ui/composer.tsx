import { useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "@workspace/ui/components/button";
import { Textarea } from "@workspace/ui/components/textarea";
import { Paperclip, Send } from "lucide-react";
import { FileUpload, type FileUploadHandler, type FileUploadItem } from "@workspace/ui/blocks/file-upload";
import { ATTACHMENT_ACCEPT, MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES } from "./attachments";

export type ComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => Promise<void>;
  onUpload: FileUploadHandler;
  onFilesChange: (items: readonly FileUploadItem[]) => void;
  disabled?: boolean;
  canSend: boolean;
  compact?: boolean;
  attachmentsDisabled?: boolean;
  modeSlot?: ReactNode;
  coworkerSlot?: ReactNode;
  optionsSlot?: ReactNode;
  submitLabel?: string;
  submitIcon?: ReactNode;
  ocrResults?: readonly { id: string; name: string; status: "processing" | "ready" | "error"; text?: string; error?: string }[];
};

export function Composer({ value, onChange, onSend, onUpload, onFilesChange, disabled = false, canSend, ocrResults = [], compact = false, attachmentsDisabled = false, modeSlot, coworkerSlot, optionsSlot, submitLabel = "Send", submitIcon }: ComposerProps) {
  const inputId = useId();
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const attachmentButton = useRef<HTMLButtonElement>(null);
  const composing = useRef(false);
  const sending = useRef(false);
  const send = async () => {
    if (disabled || !canSend || composing.current || sending.current) return;
    sending.current = true;
    try { await onSend(); } finally { sending.current = false; }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); void send(); };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey && !event.nativeEvent.isComposing && !composing.current && event.nativeEvent.keyCode !== 229) {
      event.preventDefault();
      if (!event.repeat) void send();
    }
  };
  const upload = <FileUpload compact label="Attachments" accept={ATTACHMENT_ACCEPT} maxFiles={MAX_ATTACHMENTS} maxSizeBytes={MAX_ATTACHMENT_BYTES} onUpload={onUpload} onFilesChange={onFilesChange} disabled={disabled || attachmentsDisabled} />;
  return <form className={`codeitz-composer${compact ? " codeitz-composer-compact" : ""}`} onSubmit={submit}>
    <label className="codeitz-composer-label" htmlFor={inputId}>Message Codeitz</label>
    <Textarea id={inputId} value={value} onChange={event => onChange(event.target.value)} onKeyDown={keyDown} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} disabled={disabled} placeholder="Ask Codeitz or describe a task…" rows={3} />
    <div className="codeitz-composer-actions">
      {compact ? <div className="codeitz-composer-toolbar">
        <Button ref={attachmentButton} type="button" variant="ghost" size="icon" aria-label="Attachments" title="Attachments" aria-expanded={attachmentsOpen} aria-controls={`${inputId}-attachments`} disabled={disabled || attachmentsDisabled} onClick={() => setAttachmentsOpen(open => !open)}><Paperclip aria-hidden="true" size={18} /></Button>
        {modeSlot}{coworkerSlot}{optionsSlot}
      </div> : upload}
      <Button type="submit" aria-label={submitLabel} title={submitLabel} disabled={disabled || !canSend}>{submitIcon ?? <Send aria-hidden="true" size={16} />}{!compact && <> {submitLabel}</>}</Button></div>
    {compact && <section id={`${inputId}-attachments`} aria-label="Attachments" hidden={!attachmentsOpen} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setAttachmentsOpen(false); attachmentButton.current?.focus(); } }}>{upload}</section>}
    {ocrResults.length > 0 && <ul aria-label="Attachment text recognition" className="codeitz-ocr">{ocrResults.map(result => <li key={result.id}><strong>{result.name}</strong>: {result.status === "processing" ? "Reading image…" : result.status === "error" ? (result.error || "Text recognition failed.") : "Text recognition complete"}{result.status === "ready" && result.text && <details><summary>Show recognized text</summary><pre>{result.text}</pre></details>}</li>)}</ul>}
    <p className="codeitz-composer-hint">Enter to send · Shift+Enter for a new line</p>
  </form>;
}
