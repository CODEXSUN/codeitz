import { useEffect, useRef, useState } from "react";
import { Button } from "@workspace/ui/components/button";
import { runtimeRequest, type AttachmentMetadata } from "./bridge";

export function MessageAttachment({
  conversationId,
  attachment,
}: {
  conversationId: string;
  attachment: AttachmentMetadata;
}) {
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const objectUrl = useRef("");
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );

  async function togglePreview() {
    if (preview) {
      URL.revokeObjectURL(preview);
      objectUrl.current = "";
      setPreview("");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const received = await runtimeRequest<
        AttachmentMetadata & { base64: string }
      >(
        `/api/runtime/conversations/${conversationId}/attachments/${attachment.id}`,
      );
      if (
        received.id !== attachment.id ||
        received.conversationId !== conversationId ||
        !["image/png", "image/jpeg", "image/webp"].includes(received.mime) ||
        received.base64.length > 7 * 1024 * 1024
      )
        throw new Error("This attachment preview is invalid.");
      const bytes = Uint8Array.from(atob(received.base64), (character) =>
        character.charCodeAt(0),
      );
      if (bytes.length !== received.size || bytes.length > 5 * 1024 * 1024)
        throw new Error("This attachment preview exceeded its size limit.");
      if (!mounted.current) return;
      objectUrl.current = URL.createObjectURL(
        new Blob([bytes], { type: received.mime }),
      );
      setPreview(objectUrl.current);
    } catch {
      setError("This saved attachment preview could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="saved-attachment">
      <span>
        {attachment.name} · {Math.ceil(attachment.size / 1024)} KiB
      </span>
      {attachment.mime.startsWith("image/") && (
        <Button
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={() => void togglePreview()}
        >
          {loading
            ? "Loading preview…"
            : preview
              ? "Hide preview"
              : "View image"}
        </Button>
      )}
      {preview && <img src={preview} alt={attachment.name} />}
      <span className="panel-caption">
        {attachment.mime.startsWith("image/")
          ? "Image and extracted text"
          : "Text attachment"}{" "}
        · untrusted chat context
      </span>
      {attachment.text && (
        <details>
          <summary>
            Show attachment text{attachment.textTruncated ? " preview" : ""}
          </summary>
          <pre>{attachment.text}</pre>
          {attachment.textTruncated && (
            <small>
              Preview is shortened; the original file remains preserved.
            </small>
          )}
        </details>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
