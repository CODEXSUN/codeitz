import {
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { Button } from "@workspace/ui/components/button";
import type {
  FileUploadHandler,
  FileUploadItem,
} from "@workspace/ui/blocks/file-upload";
import { Composer } from "./chat-ui/composer";
import { runtimeRequest, type AttachmentMetadata } from "./bridge";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { MessageAttachment } from "./message-attachments";
import { Send, SquareTerminal } from "lucide-react";

export type ConversationDraft = { text: string; requestKey: string };
type Recognition = {
  id: string;
  name: string;
  status: "processing" | "ready" | "error";
  text?: string;
  error?: string;
};
type Props = {
  conversationId: string;
  drafts: MutableRefObject<Map<string, ConversationDraft>>;
  disabled: boolean;
  canExecute: boolean;
  savedAttachments?: readonly AttachmentMetadata[];
  onAccepted: () => Promise<void>;
  onError: (message: string) => void;
  onAttachmentBoundaryChange: (blocked: boolean) => void;
  mode?: "chat" | "task";
  modeSlot?: ReactNode;
  coworkerSlot?: ReactNode;
  optionsSlot?: ReactNode;
  taskContext?: {
    verificationProfile?: string;
    coworkerId?: string;
    taskReference?: { authority: string; id: string };
  };
  onTaskPrepared?: (id: string) => void;
};

function readSelectedFile(file: File, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const cancel = () => reader.abort();
    reader.onload = () => {
      signal.removeEventListener("abort", cancel);
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => {
      signal.removeEventListener("abort", cancel);
      reject(new Error("The selected file could not be read."));
    };
    reader.onabort = () => {
      signal.removeEventListener("abort", cancel);
      reject(new Error("Attachment staging canceled."));
    };
    if (signal.aborted) {
      reject(new Error("Attachment staging canceled."));
      return;
    }
    signal.addEventListener("abort", cancel, { once: true });
    reader.readAsDataURL(file);
  });
}

export function ConversationComposer({
  conversationId,
  drafts,
  disabled,
  canExecute,
  savedAttachments = [],
  onAccepted,
  onError,
  onAttachmentBoundaryChange,
  mode = "chat",
  modeSlot,
  coworkerSlot,
  optionsSlot,
  taskContext,
  onTaskPrepared,
}: Props) {
  const [draft, setDraft] = useState<ConversationDraft>(
    () =>
      drafts.current.get(conversationId) ?? {
        text: "",
        requestKey: crypto.randomUUID(),
      },
  );
  const [items, setItems] = useState<readonly FileUploadItem[]>([]);
  const [generation, setGeneration] = useState(0);
  const [sending, setSending] = useState(false);
  const [uncertainSend, setUncertainSend] = useState(false);
  const [savedSelection, setSavedSelection] = useState<Record<string, boolean>>(
    {},
  );
  const [metadata, setMetadata] = useState<Record<string, AttachmentMetadata>>(
    {},
  );
  const [cleanupPending, setCleanupPending] = useState<
    Record<string, AttachmentMetadata>
  >({});
  const currentItems = useRef<readonly FileUploadItem[]>([]);
  const uploadKeys = useRef(new WeakMap<File, string>());
  const staged = useRef(new Map<string, AttachmentMetadata>());
  const accepted = useRef(new Set<string>());
  const pendingSubmission = useRef<{
    kind: "chat" | "task";
    path: string;
    body: Record<string, unknown>;
    attachmentIds: string[];
  } | null>(null);

  useEffect(() => {
    drafts.current.set(conversationId, draft);
  }, [conversationId, draft, drafts]);
  useEffect(() => {
    onAttachmentBoundaryChange(
      items.length > 0 ||
        sending ||
        uncertainSend ||
        Object.values(savedSelection).some(Boolean),
    );
  }, [
    items.length,
    sending,
    uncertainSend,
    savedSelection,
    onAttachmentBoundaryChange,
  ]);

  async function removeDraftAttachment(attachment: AttachmentMetadata) {
    if (accepted.current.has(attachment.id)) return;
    try {
      await runtimeRequest(
        `/api/runtime/conversations/${conversationId}/attachments/${attachment.id}/remove`,
        {},
      );
      setSavedSelection((current) => {
        const next = { ...current };
        delete next[attachment.id];
        return next;
      });
      setCleanupPending((current) => {
        const next = { ...current };
        delete next[attachment.id];
        return next;
      });
    } catch {
      setCleanupPending((current) => ({
        ...current,
        [attachment.id]: attachment,
      }));
      onError(
        "A canceled attachment is still staged locally. Retry its cleanup before staging more files. Sent history is unchanged.",
      );
    }
  }

  const upload: FileUploadHandler = async (file, context) => {
    if (mode !== "chat")
      throw new Error("Attachments are available only in Chat mode.");
    const requestKey = uploadKeys.current.get(file) ?? crypto.randomUUID();
    uploadKeys.current.set(file, requestKey);
    context.onProgress(0);
    const base64 = await readSelectedFile(file, context.signal);
    if (context.signal.aborted) throw new Error("Attachment staging canceled.");
    const attachment = await runtimeRequest<AttachmentMetadata>(
      `/api/runtime/conversations/${conversationId}/attachments`,
      {
        requestKey,
        name: file.name,
        mime:
          file.type ||
          (file.name.toLowerCase().endsWith(".txt") ? "text/plain" : ""),
        base64,
      },
    );
    if (attachment.conversationId !== conversationId || !attachment.id)
      throw new Error(
        "The attachment response did not match this conversation.",
      );
    staged.current.set(requestKey, attachment);
    if (
      context.signal.aborted ||
      !currentItems.current.some((item) => item.file === file)
    ) {
      await removeDraftAttachment(attachment);
      throw new Error("Attachment staging canceled.");
    }
    setMetadata((current) => ({ ...current, [requestKey]: attachment }));
    context.onProgress(100);
    return { id: attachment.id };
  };

  function filesChanged(next: readonly FileUploadItem[]) {
    for (const item of next)
      if (!uploadKeys.current.has(item.file))
        uploadKeys.current.set(item.file, item.id);
    const nextFiles = new Set(next.map((item) => item.file));
    for (const removed of currentItems.current) {
      if (nextFiles.has(removed.file)) continue;
      const key = uploadKeys.current.get(removed.file);
      const attachment = key ? staged.current.get(key) : undefined;
      if (attachment) void removeDraftAttachment(attachment);
    }
    currentItems.current = next;
    setItems(next);
  }

  const uploadedSelections = items.flatMap((item) => {
    const key = uploadKeys.current.get(item.file);
    const attachment = key ? metadata[key] : undefined;
    return attachment ? [attachment] : [];
  });
  const currentIds = new Set(
    [...staged.current.values()].map((item) => item.id),
  );
  const restoredDrafts = savedAttachments.filter(
    (item) =>
      item.conversationId === conversationId &&
      !item.sent &&
      !accepted.current.has(item.id) &&
      !currentIds.has(item.id),
  );
  const selectedAttachments = [
    ...new Map(
      [
        ...uploadedSelections,
        ...restoredDrafts.filter((item) => savedSelection[item.id]),
      ].map((item) => [item.id, item]),
    ).values(),
  ];
  const filesReady = items.every(
    (item) => item.status === "success" && !!item.result?.id,
  );
  const canSend =
    canExecute &&
    !sending &&
    !uncertainSend &&
    filesReady &&
    selectedAttachments.length <= 5 &&
    (mode === "task"
      ? draft.text.trim().length > 0 && selectedAttachments.length === 0
      : draft.text.trim().length > 0 || selectedAttachments.length > 0);
  const recognition = items.flatMap<Recognition>((item) => {
    if (!item.file.type.startsWith("image/")) return [];
    const key = uploadKeys.current.get(item.file);
    const attachment = key ? metadata[key] : undefined;
    if (attachment)
      return [
        {
          id: item.id,
          name: item.file.name,
          status: "ready" as const,
          text: attachment.text,
        },
      ];
    if (item.status === "uploading")
      return [
        { id: item.id, name: item.file.name, status: "processing" as const },
      ];
    if (item.status === "error")
      return [
        {
          id: item.id,
          name: item.file.name,
          status: "error" as const,
          error:
            "Image decoding or text recognition failed. Retry or remove the file.",
        },
      ];
    return [];
  });

  async function send() {
    if (!canSend && !uncertainSend) return;
    setSending(true);
    onError("");
    try {
      const attachmentIds = selectedAttachments.map((item) => item.id);
      const submission =
        pendingSubmission.current ??
        (mode === "chat"
          ? {
              kind: "chat" as const,
              path: `/api/runtime/conversations/${conversationId}/messages`,
              body: {
                text: draft.text.trim(),
                requestKey: draft.requestKey,
                attachmentIds,
              },
              attachmentIds,
            }
          : {
              kind: "task" as const,
              path: "/api/runtime/workers",
              body: {
                conversationId,
                goal: draft.text.trim(),
                requestKey: draft.requestKey,
                ...taskContext,
              },
              attachmentIds: [],
            });
      pendingSubmission.current = submission;
      const result = await runtimeRequest<{ id: string }>(
        submission.path,
        submission.body,
      );
      if (submission.kind === "task") onTaskPrepared?.(result.id);
      for (const id of submission.attachmentIds) accepted.current.add(id);
      pendingSubmission.current = null;
      setUncertainSend(false);
      setSavedSelection({});
      const nextDraft = { text: "", requestKey: crypto.randomUUID() };
      drafts.current.set(conversationId, nextDraft);
      setDraft(nextDraft);
      currentItems.current = [];
      setItems([]);
      setMetadata({});
      setGeneration((current) => current + 1);
      await onAccepted();
    } catch (cause) {
      // The same draft and key survive an uncertain response; a retry cannot create a second turn.
      const uncertain = /unavailable|interrupted|invalid response/i.test(
        String(cause),
      );
      setUncertainSend(uncertain);
      if (!uncertain) pendingSubmission.current = null;
      onError(String(cause));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="conversation-composer-host">
      <Composer
        key={`${conversationId}:${generation}`}
        value={draft.text}
        onChange={(text) => setDraft((current) => ({ ...current, text }))}
        disabled={disabled || sending || uncertainSend}
        canSend={canSend}
        onSend={send}
        onUpload={upload}
        onFilesChange={filesChanged}
        ocrResults={recognition}
        compact
        attachmentsDisabled={mode !== "chat"}
        modeSlot={
          <fieldset
            disabled={sending || uncertainSend}
            className="composer-slot-fields"
          >
            {modeSlot}
          </fieldset>
        }
        coworkerSlot={
          <fieldset
            disabled={sending || uncertainSend}
            className="composer-slot-fields"
          >
            {coworkerSlot}
          </fieldset>
        }
        optionsSlot={
          <fieldset
            disabled={sending || uncertainSend}
            className="composer-slot-fields"
          >
            {optionsSlot}
          </fieldset>
        }
        submitLabel={mode === "task" ? "Prepare task" : "Send"}
        submitIcon={
          mode === "task" ? (
            <SquareTerminal aria-hidden="true" size={17} />
          ) : (
            <Send aria-hidden="true" size={17} />
          )
        }
      />
      {uncertainSend && (
        <div className="attachment-cleanup">
          <span>
            The previous send was not confirmed. Retry the same saved submission
            without sending it twice.
          </span>
          <Button
            variant="outline"
            disabled={!canExecute || sending}
            onClick={() => void send()}
          >
            Retry previous send
          </Button>
        </div>
      )}
      {mode === "chat" && restoredDrafts.length > 0 && (
        <details className="saved-draft-attachments">
          <summary>Previously staged unsent attachments</summary>
          {restoredDrafts.map((attachment) => (
            <div key={attachment.id}>
              <label className="interruption-acknowledgement">
                <Checkbox
                  checked={savedSelection[attachment.id] === true}
                  disabled={sending || uncertainSend}
                  onCheckedChange={(checked: boolean | "indeterminate") =>
                    setSavedSelection((current) => ({
                      ...current,
                      [attachment.id]: checked === true,
                    }))
                  }
                />
                <span>Include {attachment.name} in the next message</span>
              </label>
              <MessageAttachment
                conversationId={conversationId}
                attachment={attachment}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={sending || uncertainSend}
                onClick={() => void removeDraftAttachment(attachment)}
              >
                Remove staged file
              </Button>
            </div>
          ))}
        </details>
      )}
      {Object.values(cleanupPending).map((attachment) => (
        <div className="attachment-cleanup" key={attachment.id}>
          <span>{attachment.name} · local staging cleanup pending</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void removeDraftAttachment(attachment)}
          >
            Retry cleanup
          </Button>
        </div>
      ))}
    </div>
  );
}
