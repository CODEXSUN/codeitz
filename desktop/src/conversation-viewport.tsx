import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { ArrowDown } from "lucide-react";

type Props = {
  conversationId: string | null;
  revision: string;
  messageCount: number;
  children: ReactNode;
};

export function ConversationViewport({
  conversationId,
  revision,
  messageCount,
  children,
}: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const programmatic = useRef(false);
  const last = useRef({ conversationId, revision: "", messageCount: 0 });
  const [atBottom, setAtBottom] = useState(true);
  const [unread, setUnread] = useState(0);

  function bottom(smooth = false) {
    const element = viewport.current;
    if (!element) return;
    following.current = true;
    programmatic.current = smooth;
    setUnread(0);
    setAtBottom(true);
    element.scrollTo({
      top: element.scrollHeight,
      behavior:
        smooth && !window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "smooth"
          : "instant",
    });
  }

  function readPosition() {
    const element = viewport.current;
    if (!element) return;
    const nearBottom =
      element.scrollHeight - element.clientHeight - element.scrollTop < 64;
    if (programmatic.current && !nearBottom) return;
    programmatic.current = false;
    following.current = nearBottom;
    setAtBottom(nearBottom);
    if (nearBottom) setUnread(0);
  }

  function userScroll() {
    programmatic.current = false;
  }

  useLayoutEffect(() => {
    const changedConversation = last.current.conversationId !== conversationId;
    if (changedConversation || last.current.revision === "") bottom();
    else if (last.current.revision !== revision) {
      if (following.current) bottom();
      else {
        const newCount = Math.max(1, messageCount - last.current.messageCount);
        setUnread((current) => current + newCount);
      }
    }
    last.current = { conversationId, revision, messageCount };
  }, [conversationId, revision, messageCount]);

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      if (following.current) bottom();
      else readPosition();
    });
    if (content.current) observer.observe(content.current);
    if (viewport.current) observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="conversation-viewport-wrap">
      <div
        ref={viewport}
        className="message-list"
        aria-label="Conversation history"
        tabIndex={0}
        onScroll={readPosition}
        onWheel={userScroll}
        onPointerDown={userScroll}
        onKeyDown={(event) => {
          if (
            [
              "ArrowUp",
              "PageUp",
              "Home",
              "ArrowDown",
              "PageDown",
              "End",
            ].includes(event.key)
          )
            userScroll();
        }}
      >
        <div ref={content} className="conversation-content">
          {children}
        </div>
      </div>
      {!atBottom && (
        <div className="scroll-to-live">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label={
                  unread
                    ? `Jump to latest updates (${unread} new)`
                    : "Jump to latest updates"
                }
                onClick={() => bottom(true)}
              >
                <ArrowDown />
                {unread > 0 && (
                  <Badge
                    className="unread-badge"
                    aria-label={`${unread} new updates`}
                  >
                    {unread > 99 ? "99+" : unread}
                  </Badge>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Latest updates</TooltipContent>
          </Tooltip>
        </div>
      )}
      <span className="sr-only" role="status">
        {unread > 0 ? `${unread} new updates below` : ""}
      </span>
    </div>
  );
}
