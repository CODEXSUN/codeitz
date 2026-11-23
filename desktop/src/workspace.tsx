import { pickAppActors, MAX_APP_COWORKERS } from "../../desktop-runtime/actor-pool.mjs";
import { appVersionLabel } from '../../src/shared/app-version';
import { useCallback, useEffect, useRef, useState } from "react";
import { ThemeSelector } from "@workspace/ui";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Input } from "@workspace/ui/components/input";
import { NativeSelect } from "@workspace/ui/components/native-select";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Textarea } from "@workspace/ui/components/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import {
  AppWindow,
  CheckSquare,
  FolderOpen,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  ChevronDown,
  SlidersHorizontal,
  UsersRound,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  SquareTerminal,
  SquarePen,
} from "lucide-react";
import logo from "../../src/web/assets/brand-logo.svg";
import logoDark from "../../src/web/assets/brand-logo-dark.svg";
import {
  pickRepository,
  reconnectRuntime,
  runtimeRequest,
  type RuntimeState,
  type SourceTask,
  type Worker,
} from "./bridge";
import { MessageList } from "./chat-ui/message-list";
import { CompactText } from "./chat-ui/compact-text";
import {
  ConversationComposer,
  type ConversationDraft,
} from "./conversation-composer";
import { MessageAttachment } from "./message-attachments";
import { ConversationViewport } from "./conversation-viewport";
import { TaskInspector } from "./task-inspector";
import { TaskInbox } from "./task-inbox";
import { TaskFlow } from "./task-flow";
import { LiveOperation } from "./live-operation";
import { RuntimeIssues } from "./runtime-issues";
import { MemoryPanel } from "./memory-panel";

const emptyState: RuntimeState = {
  apps: [],
  coworkers: [],
  conversations: [],
  messages: [],
  workers: [],
  operations: [],
  events: [],
  provider: { available: false },
};
type View = "apps" | "add-app" | "chats" | "tasks" | "settings";
const navigation = [
  { id: "apps", title: "Apps", icon: AppWindow },
  { id: "add-app", title: "Add app", icon: Plus },
  { id: "chats", title: "Supervisor chats", icon: MessageSquare },
  { id: "tasks", title: "Tasks", icon: CheckSquare },
  { id: "settings", title: "Settings", icon: Settings },
] as const;

function preference(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function DesktopWorkspace() {
  const [state, setState] = useState<RuntimeState>(emptyState);
  const [selected, setSelected] = useState<string | null>(() =>
    preference("codeitz.desktop.conversation"),
  );
  const [selectedApp, setSelectedApp] = useState<string | null>(() =>
    preference("codeitz.desktop.app"),
  );
  const appSelection = useRef(selectedApp);
  const [view, setView] = useState<View>("chats");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<"chat" | "task">("chat");
  const [activityRevisions, setActivityRevisions] = useState<
    Record<string, number>
  >({});
  const recordActivityRevision = useCallback(
    (id: string, revision: number) =>
      setActivityRevisions((current) =>
        current[id] === revision ? current : { ...current, [id]: revision },
      ),
    [],
  );
  const [verificationProfile, setVerificationProfile] = useState("");
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [manageCoworkers, setManageCoworkers] = useState(false);
  const inspectorToggle = useRef<HTMLButtonElement>(null);
  const sidebarToggle = useRef<HTMLButtonElement>(null);
  const inspector = useRef<HTMLElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const drafts = useRef(new Map<string, ConversationDraft>());
  const [attachmentDraftOpen, setAttachmentDraftOpen] = useState(false);
  const newChatPending = useRef(false);
  const [coworkerName, setCoworkerName] = useState("");
  const [selectedCoworker, setSelectedCoworker] = useState("");
  const [selectedTask, setSelectedTask] = useState("");
  const [appName, setAppName] = useState("");
  const [repositoryPath, setRepositoryPath] = useState("");
  const [sourceOwner, setSourceOwner] = useState("");
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [reviewedInterruptions, setReviewedInterruptions] = useState<
    Record<string, boolean>
  >({});
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);

  const app = state.apps.find((item) => item.id === selectedApp);
  const repositoryKey = (value: string) => value.replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase();
  const duplicateApp = repositoryPath
    ? state.apps.find((item) => repositoryKey(item.repository) === repositoryKey(repositoryPath))
    : undefined;
  const chats = state.conversations.filter(
    (item) => (item.appId ?? "") === (selectedApp ?? ""),
  );
  const actorPool = pickAppActors(selectedApp ?? "", state.conversations, state.coworkers);
  const historical = !!selected && !!selectedApp && selected !== actorPool.supervisorId;
  const conversation = state.conversations.find((item) => item.id === selected);
  const coworkers = state.coworkers.filter(
    (item) => item.conversationId === selected && actorPool.activeCoworkerIds.includes(item.id),
  );
  const coworkerId = coworkers.some((item) => item.id === selectedCoworker)
    ? selectedCoworker
    : (coworkers[0]?.id ?? "");
  const messages = state.messages.filter(
    (item) => item.conversationId === selected,
  );
  const workers = state.workers.filter(
    (item) => item.conversationId === selected,
  );
  const appWorkers = state.workers.filter((item) =>
    chats.some((chat) => chat.id === item.conversationId),
  );
  const focusedWorker =
    workers.find((item) => item.id === reviewId) ?? workers.at(-1);
  const profiles = (state.verificationProfiles ?? []).filter((item) =>
    app?.verificationProfiles?.includes(item.id),
  );
  const interruptions = state.operations.filter(
    (item) =>
      item.state === "interrupted" ||
      item.applyReceipt?.state === "review-required",
  );
  const providerBusy = state.provider.busy === true;
  const activeOperations = state.operations.filter(
    (item) => item.state === "running",
  );
  const capacity: NonNullable<RuntimeState["provider"]["capacity"]> = state
    .provider.capacity ?? {
    limit: 1,
    active: providerBusy ? 1 : 0,
    available: providerBusy ? 0 : 1,
    activeWorkers: activeOperations.filter((item) => item.kind === "worker")
      .length,
    activeChats: activeOperations.filter((item) => item.kind === "chat").length,
    maintenance: false,
  };
  const activeIds =
    capacity.operations?.map((item) => item.id) ??
    activeOperations.map((item) => item.id);
  const chatRunning = activeOperations.some(
    (item) => item.kind === "chat" && item.conversationId === selected,
  );
  const threadActivity = state.operations.filter(
    (item) => item.conversationId === selected && activeIds.includes(item.id),
  );
  const sandbox =
    typeof state.provider.sandbox === "string"
      ? state.provider.sandbox
      : ((state.provider.sandbox as { state?: string; status?: string } | null)
          ?.state ??
        (state.provider.sandbox as { status?: string } | null)?.status);
  const sandboxBlocked = !!sandbox && sandbox !== "ready";
  const source = state.sourceCatalog;
  const projectGroups = [
    { label: "Business apps", prefix: "apps/" },
    { label: "Devkits", prefix: "devkit/" },
    { label: "Other projects", prefix: null },
  ].map((group) => ({
    ...group,
    projects: (source?.projects ?? [])
      .filter((project) => project.owner !== "devkit/project-manager")
      .filter((project) => !state.apps.some((item) => item.sourceProjectOwner === project.owner))
      .filter((project) => group.prefix
        ? project.owner.startsWith(group.prefix)
        : !project.owner.startsWith("apps/") && !project.owner.startsWith("devkit/"))
      .sort((left, right) => left.name.localeCompare(right.name)),
  }));
  const runnerTasks = (source?.runnerTasks ?? []).filter(
    (item) => app?.sourceProjectOwner && item.owner === app.sourceProjectOwner,
  );
  const businessTasks = (source?.businessTasks ?? []).filter(
    (item) =>
      item.owner === null ||
      (!!app?.sourceProjectOwner && item.owner === app.sourceProjectOwner),
  );
  const todoTasks = (source?.todoTasks ?? []).filter(
    (item) =>
      item.owner === null ||
      (!!app?.sourceProjectOwner && item.owner === app.sourceProjectOwner),
  );
  const tasks = [...runnerTasks, ...businessTasks, ...todoTasks];
  const taskKey = (task: SourceTask) => `${task.sourceKind}:${task.id}`;
  const task = tasks.find((item) => taskKey(item) === selectedTask);
  const ownChatInterrupted = interruptions.some(
    (item) =>
      item.kind === "chat" &&
      item.conversationId === selected &&
      item.state === "interrupted",
  );
  const visibleRecoveries = interruptions.filter(
    (item) => item.conversationId === selected,
  );
  const executionBlocked =
    historical ||
    busy ||
    chatRunning ||
    capacity.available === 0 ||
    capacity.maintenance ||
    sandboxBlocked ||
    ownChatInterrupted ||
    !connected;
  const taskPreparationBlocked =
    historical || busy || !connected || capacity.maintenance || (!!app && !coworkerId);
  const allIdle =
    capacity.active === 0 &&
    !(capacity.reviews ?? 0) &&
    !(capacity.uncertain ?? 0) &&
    !capacity.maintenance;
  const revision = `${threadActivity.map((item) => `${item.id}:${activityRevisions[item.id] ?? 0}`).join("|")}#${messages.map((item) => `${item.id}:${item.text.length}:${item.attachments?.map((attachment) => attachment.id).join(",") ?? ""}`).join("|")}#${threadActivity.map((item) => `${item.id}:${item.progress?.sequence ?? ""}:${item.progress?.phase ?? ""}:${item.progress?.message ?? ""}`).join("|")}`;

  function approvalReason(worker: Worker): string | null {
    const workerAppId = state.conversations.find(item => item.id === worker.conversationId)?.appId;
    if (workerAppId) {
      const actors = pickAppActors(workerAppId, state.conversations, state.coworkers);
      if (worker.conversationId !== actors.supervisorId || (worker.coworkerId && !actors.activeCoworkerIds.includes(worker.coworkerId)))
        return "History is read-only; prepare new work with an active app coworker.";
    }
    if (!connected) return "Reconnect the local runtime first.";
    if (busy) return "A local request is being saved.";
    if (sandboxBlocked) return "The Windows sandbox is not ready.";
    if (capacity.maintenance) return "Repository maintenance is in progress.";
    const unknownApply = state.operations.find(
      (item) =>
        item.applyReceipt?.state === "review-required" &&
        !!worker.repositorySnapshot?.repository &&
        item.repositorySnapshot?.repository
          ?.replaceAll("\\", "/")
          .toLowerCase() ===
          worker.repositorySnapshot.repository
            .replaceAll("\\", "/")
            .toLowerCase(),
    );
    if (unknownApply)
      return "Review the unresolved apply for this repository before approving another task.";
    const occupied = state.operations.find(
      (item) =>
        item.id !== worker.id &&
        item.kind === "worker" &&
        (activeIds.includes(item.id) || item.state === "interrupted") &&
        (worker.coworkerId
          ? item.coworkerId === worker.coworkerId
          : !item.coworkerId && item.conversationId === worker.conversationId),
    );
    if (occupied)
      return occupied.state === "interrupted"
        ? "Review this coworker’s interruption or request a stop if its turn is still active."
        : "This coworker is already working. Another coworker can use a free slot.";
    if (capacity.available === 0)
      return "All model slots are occupied. Wait for capacity, then approve explicitly.";
    return null;
  }

  function canApprove(worker: Worker) {
    return approvalReason(worker) === null;
  }

  useEffect(() => {
    const compact = window.matchMedia("(max-width: 1100px)");
    const update = () => {
      if (compact.matches) setInspectorOpen(false);
    };
    compact.addEventListener("change", update);
    return () => compact.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        document.querySelector(
          '[role="dialog"][data-state="open"], [role="menu"][data-state="open"]',
        )
      )
        return;
      if (
        inspectorOpen &&
        inspector.current?.contains(document.activeElement)
      ) {
        setInspectorOpen(false);
        inspectorToggle.current?.focus({ preventScroll: true });
      } else if (
        sidebarOpen &&
        sidebar.current?.contains(document.activeElement)
      ) {
        setSidebarOpen(false);
        sidebarToggle.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [inspectorOpen, sidebarOpen]);

  useEffect(() => {
    if (!inspectorOpen || !manageCoworkers) return;
    const frame = requestAnimationFrame(() =>
      inspector.current
        ?.querySelector<HTMLInputElement>('input[aria-label="Coworker name"]')
        ?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(frame);
  }, [inspectorOpen, manageCoworkers]);

  useEffect(() => {
    try {
      if (selected)
        localStorage.setItem("codeitz.desktop.conversation", selected);
      else localStorage.removeItem("codeitz.desktop.conversation");
      if (selectedApp !== null)
        localStorage.setItem("codeitz.desktop.app", selectedApp);
    } catch {
      /* Preferences do not replace the durable database records. */
    }
  }, [selected, selectedApp]);

  function chooseApp(id: string, nextState = state) {
    if (attachmentDraftOpen && id !== selectedApp) {
      setError(
        "Send or remove the selected attachments before switching conversations.",
      );
      return;
    }
    setVerificationProfile("");
    setReviewId(null);
    appSelection.current = id;
    setSelectedApp(id);
    setSelected(
      pickAppActors(id, nextState.conversations, nextState.coworkers).supervisorId,
    );
    setSelectedCoworker("");
    setSelectedTask("");
  }

  function chooseConversation(id: string) {
    if (attachmentDraftOpen && id !== selected) {
      setError(
        "Send or remove the selected attachments before switching conversations.",
      );
      return;
    }
    setSelected(id);
    setSelectedCoworker("");
  }

  async function refresh() {
    if (pending.current) return;
    pending.current = true;
    try {
      const next = await runtimeRequest<RuntimeState>("/api/runtime/state");
      setState(next);
      if (appSelection.current && !next.apps.some((item) => item.id === appSelection.current)) {
        appSelection.current = "";
        setSelectedApp("");
      }
      setSelected((current) => {
        const saved = next.conversations.find((item) => item.id === current);
        if (appSelection.current === null) {
          const initial = saved ?? next.conversations[0];
          const id = initial?.appId ?? next.apps[0]?.id ?? "";
          appSelection.current = id;
          setSelectedApp(id);
        }
        if (saved && (saved.appId ?? "") === appSelection.current)
          return saved.id;
        return (
          next.conversations.find(
            (item) => (item.appId ?? "") === appSelection.current,
          )?.id ?? null
        );
      });
      setConnected(true);
      setConnectionError("");
    } catch (cause) {
      setConnected(false);
      setConnectionError(String(cause));
    } finally {
      pending.current = false;
    }
  }

  useEffect(() => {
    void reconnectRuntime()
      .then(refresh)
      .catch((cause) => setConnectionError(String(cause)));
    const timer = window.setInterval(refresh, 1200);
    return () => window.clearInterval(timer);
  }, []);

  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
      await refresh();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  const appSelector = (
    <label className="field">
      {view !== "apps" && <span>App</span>}
      <NativeSelect
        aria-label="Selected app"
        value={selectedApp ?? ""}
        onChange={(event) => chooseApp(event.target.value)}
      >
        <option value="">Select an app</option>
        {state.apps.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </NativeSelect>
    </label>
  );

  const chatHistory = app && (
    <section className="app-chat-history" aria-label="App supervisor chats">
      <div className="app-chat-heading">
        <span>Chats</span>
        <Tooltip><TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Open supervisor"
            disabled={busy || !connected || attachmentDraftOpen}
            onClick={() => {
              if (newChatPending.current) return;
              newChatPending.current = true;
              void action(async () => {
                try {
                  const created = await runtimeRequest<{ id: string }>("/api/runtime/conversations", { title: "supervisor", appId: app.id });
                  if (appSelection.current === app.id) {
                    setSelected(created.id);
                    setSelectedCoworker("");
                    setReviewId(null);
                    setInspectorOpen(false);
                  }
                } finally { newChatPending.current = false; }
              });
            }}><SquarePen size={15} /></Button>
        </TooltipTrigger><TooltipContent>Open supervisor</TooltipContent></Tooltip>
      </div>
      <nav aria-label="Conversations" className="chat-navigation">
        {chats.filter(item => item.id === actorPool.supervisorId).map((item) => (
          <Button key={item.id} variant={selected === item.id ? "secondary" : "ghost"}
            className="conversation-item" title={item.title}
            aria-current={selected === item.id ? "page" : undefined}
            onClick={() => chooseConversation(item.id)}>
            <MessageSquare size={14} /><span>supervisor</span>
          </Button>
        ))}
      </nav>
      {(actorPool.historyConversationIds.length > 0 || actorPool.historyCoworkerIds.length > 0) && (
        <details className="app-chat-archive"><summary>History · {actorPool.historyConversationIds.length + actorPool.historyCoworkerIds.length}</summary>
          {chats.filter(item => actorPool.historyConversationIds.includes(item.id)).map(item => (
            <Button key={item.id} variant="ghost" className="conversation-item" onClick={() => chooseConversation(item.id)}><MessageSquare size={14}/><span>{item.title}</span></Button>
          ))}
          {state.coworkers.filter(item => actorPool.historyCoworkerIds.includes(item.id)).map(item => (
            <Button key={item.id} variant="ghost" className="conversation-item" onClick={() => { chooseConversation(item.conversationId); const task = [...state.workers].reverse().find(task => task.coworkerId === item.id); if(task) {setReviewId(task.id);setInspectorOpen(true);} }}><span>{item.name} · coworker</span></Button>
          ))}
        </details>
      )}
      {historical && <p role="status">Read-only history. Open supervisor to continue.</p>}
    </section>
  );

  const taskSelector = (
    <label className="field">
      <span>Existing Codeitz task · optional</span>
      <NativeSelect
        aria-label="Linked Codeitz task"
        value={selectedTask}
        onChange={(event) => setSelectedTask(event.target.value)}
      >
        <option value="">No linked task</option>
        {runnerTasks.length > 0 && (
          <optgroup label="This project's runner tasks">
            {runnerTasks.map((item) => (
              <option key={taskKey(item)} value={taskKey(item)}>
                {item.title} · {item.status}
              </option>
            ))}
          </optgroup>
        )}
        {businessTasks.length > 0 && (
          <optgroup label="Business tasks · no project ownership inferred">
            {businessTasks.map((item) => (
              <option key={taskKey(item)} value={taskKey(item)}>
                {item.title} · {item.status}
              </option>
            ))}
          </optgroup>
        )}
        {todoTasks.length > 0 && (
          <optgroup label="Existing To-dos · unassigned unless explicitly mapped">
            {todoTasks.map((item) => (
              <option key={taskKey(item)} value={taskKey(item)}>
                {item.title} · {item.owner ?? "Unassigned"}
              </option>
            ))}
          </optgroup>
        )}
      </NativeSelect>
    </label>
  );

  const modeSlot = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Composer mode"
          title={
            composerMode === "chat"
              ? "Chat mode: read-only conversation"
              : "Task mode: prepare an approval request"
          }
          disabled={attachmentDraftOpen}
        >
          <span>
            {composerMode === "chat" ? (
              <MessageSquare size={15} />
            ) : (
              <SquareTerminal size={15} />
            )}
          </span>
          {composerMode === "chat" ? "Chat" : "Task"}
          <ChevronDown size={12} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start">
        <DropdownMenuLabel>Compose</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={composerMode}
          onValueChange={(value: string) => {
            if (!attachmentDraftOpen)
              setComposerMode(value === "task" ? "task" : "chat");
          }}
        >
          <DropdownMenuRadioItem value="chat">
            Chat · read-only
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="task">
            Coworker task · approval first
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const coworkerSlot =
    composerMode === "task" && app ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Selected coworker"
            title="Select a coworker for this proposal"
            disabled={attachmentDraftOpen}
          >
            <UsersRound size={15} />
            <span className="composer-coworker-name">
              {coworkers.find((item) => item.id === coworkerId)?.name ??
                "Select coworker"}
            </span>
            <ChevronDown size={12} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top">
          <DropdownMenuLabel>In this supervisor chat</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={coworkerId}
            onValueChange={setSelectedCoworker}
          >
            {coworkers.map((item) => (
              <DropdownMenuRadioItem key={item.id} value={item.id}>
                {item.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={historical || coworkers.length >= MAX_APP_COWORKERS}
            onSelect={() => {
              setInspectorOpen(true);
              setManageCoworkers(true);
            }}
          >
            <Plus size={14} />
            Add coworker
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;
  const optionsSlot = (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Composer options"
              disabled={attachmentDraftOpen}
            >
              <SlidersHorizontal size={16} />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Composer options</TooltipContent>
      </Tooltip>
      <PopoverContent side="top" align="start" className="composer-options">
        {composerMode === "task" ? (
          <>
            {taskSelector}
            <label className="field">
              <span>Checks after approved work</span>
              <NativeSelect
                aria-label="Verification profile"
                value={
                  profiles.some((item) => item.id === verificationProfile)
                    ? verificationProfile
                    : ""
                }
                onChange={(event) => setVerificationProfile(event.target.value)}
              >
                <option value="">
                  {profiles.length
                    ? "No automatic checks"
                    : "Not configured for this app"}
                </option>
                {profiles.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name ?? item.id} — automatic after approval
                  </option>
                ))}
              </NativeSelect>
            </label>
            <p className="panel-caption">
              The task link is read-only. Preparing a proposal never executes it
              automatically.
            </p>
          </>
        ) : (
          <>
            <h3>Read-only supervisor</h3>
            <p>
              Files are staged locally. Send is the only action that shares
              their content with Codex.
            </p>
            {conversation?.providerThreadId && (
              <details>
                <summary>Conversation identity</summary>
                <code>{conversation.providerThreadId}</code>
              </details>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );

  return (
    <TooltipProvider>
      <div className="desktop-shell">
        <header className="desktop-header">
          <div className="app-header-identity">
            <div className="brand">
              <img className="logo-light" src={logo} alt="" />
              <img className="logo-dark" src={logoDark} alt="" />
            </div>
            <div>
              <span className="app-header-project">
                {app?.name ?? "Codeitz Desktop"}
              </span>
              <h1>
                {conversation?.title ??
                  (app ? "New supervisor conversation" : "Local workspace")}
              </h1>
            </div>
          </div>
          <div className="header-actions">
            {app && <MemoryPanel appId={app.id} conversationId={conversation?.appId === app.id ? conversation.id : null} />}
            {(state.issues?.length ?? 0) > 0 && <RuntimeIssues
              issues={state.issues ?? []}
              canOpen={(id) => state.workers.some(
                (worker) => worker.id === id && state.conversations.some(
                  (chat) => chat.id === worker.conversationId && chat.appId,
                ),
              )}
              onOpen={(id) => {
                const worker = state.workers.find((item) => item.id === id);
                const chat = state.conversations.find((item) => item.id === worker?.conversationId);
                if (!worker || !chat?.appId) return false;
                if (attachmentDraftOpen && selected !== chat.id) {
                  setError("Finish or remove selected attachments before switching conversations.");
                  return false;
                }
                chooseApp(chat.appId);
                chooseConversation(chat.id);
                setReviewId(worker.id);
                setView("tasks");
                setInspectorOpen(true);
                return true;
              }}
            />}
            {capacity.active > 0 && <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  aria-label={`Model capacity: ${capacity.active} of ${capacity.limit} active`}
                >
                  {capacity.active}
                  <span className="muted-divider">/</span>
                  {capacity.limit}
                  <span className="capacity-label">active</span>
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                {capacity.available} model slots available ·{" "}
                {capacity.activeWorkers} workers · {capacity.activeChats} chats
                {capacity.uncertain
                  ? ` · ${capacity.uncertain} uncertain reserved slots`
                  : ""}
                {capacity.maintenance ? " · repository maintenance" : ""}
                {capacity.reviews
                  ? ` · ${capacity.reviews} verification/review operations`
                  : ""}
              </TooltipContent>
            </Tooltip>}
            <span
              className={`connection-dot ${connected ? "connected" : ""}`}
              title={
                connected ? "Local runtime connected" : "Runtime disconnected"
              }
              aria-label={
                connected ? "Local runtime connected" : "Runtime disconnected"
              }
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Reconnect runtime"
                  onClick={() => void action(reconnectRuntime)}
                >
                  <RefreshCw size={15} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reconnect runtime</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  ref={inspectorToggle}
                  size="icon-sm"
                  variant="ghost"
                  aria-label={
                    inspectorOpen
                      ? "Hide coworker panel"
                      : "Show coworker panel"
                  }
                  aria-expanded={inspectorOpen}
                  aria-controls="coworker-inspector"
                  onClick={() => {
                    const opening = !inspectorOpen;
                    setInspectorOpen(opening);
                    if (opening)
                      requestAnimationFrame(() =>
                        inspector.current
                          ?.querySelector<HTMLElement>("h2")
                          ?.focus({ preventScroll: true }),
                      );
                    else
                      inspectorToggle.current?.focus({ preventScroll: true });
                  }}
                >
                  {inspectorOpen ? (
                    <PanelRightClose size={17} />
                  ) : (
                    <PanelRightOpen size={17} />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Coworkers & task review</TooltipContent>
            </Tooltip>
          </div>
        </header>
        <div
          className={`desktop-columns ${sidebarOpen ? "" : "sidebar-collapsed"} ${inspectorOpen ? "" : "inspector-collapsed"}`}
        >
          <nav className="main-rail" aria-label="Main navigation">
            <TooltipProvider>
              {navigation.map((item) => (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant={view === item.id ? "secondary" : "ghost"}
                      aria-label={item.title}
                      aria-current={view === item.id ? "page" : undefined}
                      onClick={() => {
                        setView(item.id);
                        setSidebarOpen(true);
                      }}
                    >
                      <item.icon />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">{item.title}</TooltipContent>
                </Tooltip>
              ))}
              <div className="rail-spacer" />
              <Button
                size="icon"
                variant="ghost"
                ref={sidebarToggle}
                aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
                title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
                onClick={() => {
                  const opening = !sidebarOpen;
                  setSidebarOpen(opening);
                  if (opening)
                    requestAnimationFrame(() =>
                      sidebar.current
                        ?.querySelector<HTMLElement>("h2")
                        ?.focus({ preventScroll: true }),
                    );
                  else sidebarToggle.current?.focus({ preventScroll: true });
                }}
              >
                {sidebarOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
              </Button>
            </TooltipProvider>
          </nav>
          <aside
            ref={sidebar}
            className="conversation-panel"
            aria-label="Workspace navigation"
            aria-hidden={!sidebarOpen}
            inert={!sidebarOpen}
          >
            <div className={`drawer-inner ${view === "apps" ? "apps-drawer" : ""}`}>
              {view !== "apps" && (
              <h2 className="sidebar-title" tabIndex={-1}>
                {navigation.find((item) => item.id === view)?.title}
              </h2>
              )}
              {view !== "settings" && view !== "add-app" && appSelector}
              {view === "apps" && (
                <>
                  {app && (
                    <div className="sidebar-repository">
                      <p className="panel-caption">
                        {app.sourceProjectOwner ??
                          app.repository.replaceAll("\\", "/").split("/").slice(-2).join("/")}
                      </p>
                    </div>
                  )}
                </>
              )}
              {view === "add-app" && (
                  <form
                    className="stacked-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (duplicateApp) return;
                      void action(async () => {
                        const created = await runtimeRequest<{ id: string }>(
                          "/api/runtime/apps",
                          {
                            name: appName.trim(),
                            repositoryPath,
                            ...(sourceOwner
                              ? { sourceProjectOwner: sourceOwner }
                              : {}),
                          },
                        );
                        appSelection.current = created.id;
                        setSelectedApp(created.id);
                        setSelected(null);
                        setAppName("");
                        setRepositoryPath("");
                        setSourceOwner("");
                        setView("apps");
                      });
                    }}
                  >
                    <label className="field">
                      <span>Project (optional)</span>
                      <Select
                        value={sourceOwner || "__standalone__"}
                        onValueChange={(value: string) => {
                          const owner = value === "__standalone__" ? "" : value;
                          setSourceOwner(owner);
                          if (!appName)
                            setAppName(
                              source?.projects.find(
                                (item) => item.owner === owner,
                              )?.name ?? "",
                            );
                        }}
                      >
                        <SelectTrigger aria-label="Existing Codeitz project"><SelectValue /></SelectTrigger>
                        <SelectContent className="desktop-project-picker">
                          <SelectItem value="__standalone__">Standalone app</SelectItem>
                          {projectGroups.filter((group) => group.projects.length > 0).map((group) => (
                            <SelectGroup key={group.label}>
                              {group.projects.map((item) => (
                                <SelectItem key={item.owner} value={item.owner}>{item.name}</SelectItem>
                              ))}
                            </SelectGroup>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                    <label className="field">
                      <span>App name</span>
                      <Input
                        aria-label="App name"
                        value={appName}
                        onChange={(event) => setAppName(event.target.value)}
                        required
                        maxLength={120}
                      />
                    </label>
                    <label className="field">
                      <span>Git repository</span>
                      <Input
                        aria-label="Selected repository"
                        value={repositoryPath}
                        readOnly
                        placeholder="Choose a repository folder"
                      />
                    </label>
                    <Button
                      variant="outline"
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          const path = await pickRepository();
                          if (path) setRepositoryPath(path);
                        })
                      }
                    >
                      <FolderOpen />
                      Choose folder
                    </Button>
                    {duplicateApp && <p role="status" className="panel-caption">Already added as {duplicateApp.name}. Select it in Apps.</p>}
                    <Button
                      disabled={
                        !connected ||
                        busy ||
                        attachmentDraftOpen ||
                        !appName.trim() ||
                        !repositoryPath ||
                        !!duplicateApp
                      }
                    >
                      Validate and add
                    </Button>
                  </form>
              )}
              {view === "chats" && (
                chatHistory
              )}
              {view === "apps" && chatHistory}
              {view === "tasks" && (
                <>
                  <p className="panel-caption">
                    Existing task records are read-only. Linking one does not
                    edit or execute it.
                  </p>
                  {taskSelector}
                  <div className="source-task-list">
                    {tasks.map((item) => (
                      <Button
                        key={taskKey(item)}
                        className="task-item"
                        variant={
                          selectedTask === taskKey(item) ? "secondary" : "ghost"
                        }
                        onClick={() => setSelectedTask(taskKey(item))}
                      >
                        <span>
                          {item.title}
                          <small>
                            {item.sourceKind} · {item.status}
                            {item.owner ? ` · ${item.owner}` : " · unscoped"}
                          </small>
                        </span>
                      </Button>
                    ))}
                  </div>
                </>
              )}
              {view === "settings" && (
                <>
                  <ThemeSelector />
                  <div className="repository-summary">
                    <h3>Local Codeitz records</h3>
                    <p>
                      {source?.connection.connected
                        ? "Connected · read-only"
                        : "Not connected"}
                    </p>
                    <code>
                      {source?.connection.origin ?? "http://127.0.0.1:14305"}
                    </code>
                    <p className="panel-caption">
                      {source?.connection.message ??
                        "The broker owns the protected connection. No credentials are available to this interface."}
                    </p>
                  </div>
                  <p className="panel-caption">
                    Desktop agent history uses its separate local database.
                    Existing Codeitz records and cloud sending settings remain
                    unchanged.
                  </p>
                </>
              )}
              {view === "tasks" && app && (
                <TaskInbox
                  workers={appWorkers}
                  coworkers={state.coworkers}
                  verifications={state.verifications ?? []}
                  selectedId={focusedWorker?.id ?? null}
                  onSelect={(worker) => {
                    if (
                      attachmentDraftOpen &&
                      selected !== worker.conversationId
                    ) {
                      setError(
                        "Finish or remove selected attachments before switching conversations.",
                      );
                      return;
                    }
                    setSelected(worker.conversationId);
                    setReviewId(worker.id);
                    setInspectorOpen(true);
                  }}
                />
              )}
              {view !== "settings" && view !== "apps" && view !== "add-app" && app && (
                <p className="panel-caption source-connection">
                  {source?.connection.connected
                    ? `${source.projects.length} local projects · read-only`
                    : (source?.connection.message ??
                      "Local project connection not configured")}
                </p>
              )}
            </div>
          </aside>

          <main className="conversation-main">
            {(error || connectionError) && (
              <div role="alert" className="error-notice">
                {error || connectionError}
              </div>
            )}
            {sandboxBlocked && (
              <div role="status" className="error-notice">
                Codex Windows sandbox: {sandbox}. Worker execution remains
                blocked until local setup is ready.
              </div>
            )}
            {focusedWorker && (
              <div className="task-flow-center">
                <TaskFlow
                  worker={focusedWorker}
                  verifications={state.verifications ?? []}
                />
              </div>
            )}
            <ConversationViewport
              conversationId={selected}
              revision={revision}
              messageCount={messages.length}
            >
              {visibleRecoveries.map((operation) => (
                <article
                  key={operation.id}
                  className="worker-card"
                  aria-label={
                    operation.applyReceipt?.state === "review-required"
                      ? `Uncertain apply: ${operation.goal}`
                      : `Interrupted ${operation.kind}: ${operation.goal}`
                  }
                >
                  <Badge variant="outline">
                    {operation.applyReceipt?.state === "review-required"
                      ? "Apply review required"
                      : `Interrupted ${operation.kind}`}
                  </Badge>
                  <p>{operation.goal}</p>
                  <span className="panel-caption">Workspace</span>
                  <code>{operation.workspace}</code>
                  {operation.applyReceipt?.state === "review-required" && (
                    <>
                      <p>
                        {operation.applyReceipt.error ??
                          "The repository apply outcome is uncertain. Inspect the actual repository and retained recovery receipt before continuing."}
                      </p>
                      {operation.repositorySnapshot && (
                        <>
                          <span className="panel-caption">
                            Destination repository
                          </span>
                          <code>{operation.repositorySnapshot.repository}</code>
                        </>
                      )}
                    </>
                  )}
                  <p>
                    {operation.result ??
                      "The outcome is uncertain. Review the workspace and provider history before continuing."}
                  </p>
                  {operation.providerThreadId && (
                    <>
                      <span className="panel-caption">
                        Provider conversation
                      </span>
                      <code>{operation.providerThreadId}</code>
                    </>
                  )}
                  {operation.providerTurnId && (
                    <>
                      <span className="panel-caption">Provider turn</span>
                      <code>{operation.providerTurnId}</code>
                    </>
                  )}
                  <p className="approval-description">
                    Marking this reviewed only clears the interruption. It does
                    not rerun the operation or approve another attempt.
                  </p>
                  <label className="interruption-acknowledgement">
                    <Checkbox
                      checked={reviewedInterruptions[operation.id] === true}
                      onCheckedChange={(checked: boolean | "indeterminate") =>
                        setReviewedInterruptions((current) => ({
                          ...current,
                          [operation.id]: checked === true,
                        }))
                      }
                    />
                    <span>
                      I've reviewed this interruption and its workspace. Do not
                      rerun it.
                    </span>
                  </label>
                  <Button
                    variant="outline"
                    disabled={
                      !reviewedInterruptions[operation.id] ||
                      busy ||
                      !allIdle ||
                      !connected
                    }
                    onClick={() =>
                      void action(async () => {
                        await runtimeRequest(
                          `/api/runtime/operations/${operation.id}/resolve`,
                          {
                            digest: operation.digest,
                            acknowledgement: "reviewed-no-replay",
                          },
                        );
                      })
                    }
                  >
                    Mark reviewed — do not rerun
                  </Button>
                </article>
              ))}
              {!messages.length && (
                <div className="empty-conversation">
                  <div className="brand empty-brand">
                    <img src={logo} className="logo-light" alt="" />
                    <img src={logoDark} className="logo-dark" alt="" />
                  </div>
                  <h2>Codeitz Desktop</h2>
                  {!app && <Button variant="outline" onClick={() => { setView("add-app"); setSidebarOpen(true); }}>
                    <Plus size={16} /> Add app
                  </Button>}
                </div>
              )}
              <MessageList
                messages={messages.map((message) => ({
                  id: message.id,
                  label:
                    message.role === "user"
                      ? "You"
                      : (state.coworkers.find(
                          (item) =>
                            item.id ===
                            state.operations.find(
                              (operation) =>
                                operation.id === message.operationId,
                            )?.coworkerId,
                        )?.name ?? "Codeitz"),
                  role:
                    message.role === "user"
                      ? "user"
                      : message.role === "agent"
                        ? "agent"
                        : message.role === "system"
                          ? "system"
                          : "assistant",
                  content: (
                    <>
                      <CompactText text={message.text} markdown={message.role !== "user"} streaming={message.state === "running"} />
                      {(message.attachments ?? []).map((attachment) => (
                        <MessageAttachment
                          key={attachment.id}
                          conversationId={message.conversationId}
                          attachment={attachment}
                        />
                      ))}
                    </>
                  ),
                }))}
              />
              {threadActivity.map((operation) => (
                <LiveOperation
                  key={operation.id}
                  operation={operation}
                  name={
                    state.coworkers.find(
                      (item) => item.id === operation.coworkerId,
                    )?.name ?? "Codex supervisor"
                  }
                  onRevision={recordActivityRevision}
                />
              ))}
            </ConversationViewport>
            {selected ? (
              <ConversationComposer
                key={selected}
                conversationId={selected}
                drafts={drafts}
                disabled={!connected || busy || capacity.maintenance}
                canExecute={
                  composerMode === "chat"
                    ? !executionBlocked
                    : !taskPreparationBlocked
                }
                mode={composerMode}
                modeSlot={modeSlot}
                coworkerSlot={coworkerSlot}
                optionsSlot={optionsSlot}
                taskContext={{
                  ...(profiles.some((item) => item.id === verificationProfile)
                    ? { verificationProfile }
                    : {}),
                  ...(app ? { coworkerId } : {}),
                  ...(task
                    ? {
                        taskReference: {
                          authority:
                            task.sourceKind === "runner"
                              ? "codeitz-runner-task"
                              : task.sourceKind === "todo"
                                ? "codeitz-todo"
                                : "codeitz-work-task",
                          id: task.id,
                        },
                      }
                    : {}),
                }}
                onTaskPrepared={(id) => {
                  setReviewId(id);
                  setInspectorOpen(true);
                }}
                savedAttachments={(state.attachments ?? []).filter(
                  (attachment) => attachment.conversationId === selected,
                )}
                onAccepted={refresh}
                onError={setError}
                onAttachmentBoundaryChange={setAttachmentDraftOpen}
              />
            ) : (
              app ? <div className="composer-placeholder">Start a new chat.</div> : null
            )}
          </main>
          <aside
            ref={inspector}
            id="coworker-inspector"
            className="worker-panel"
            aria-label="Coworkers and task review"
            aria-hidden={!inspectorOpen}
            inert={!inspectorOpen}
          >
            <div className="inspector-inner">
              <div className="inspector-heading">
                <div>
                  <h2 tabIndex={-1}>Coworkers</h2>
                  <span>
                    {workers.filter((item) => item.state === "running").length}{" "}
                    active in this chat
                  </span>
                </div>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Add coworker"
                  disabled={!app || !selected || historical || coworkers.length >= MAX_APP_COWORKERS}
                  onClick={() => setManageCoworkers((current) => !current)}
                >
                  <Plus size={16} />
                </Button>
              </div>
              {app && (
                <details
                  className="coworker-management"
                  open={manageCoworkers}
                  onToggle={(event) =>
                    setManageCoworkers(event.currentTarget.open)
                  }
                >
                  <summary>
                    Manage coworkers <span>{coworkers.length}</span>
                  </summary>
                  <div className="coworker-name-list">
                    {coworkers.map((item) => (
                      <Button
                        key={item.id}
                        variant={coworkerId === item.id ? "secondary" : "ghost"}
                        size="sm"
                        disabled={attachmentDraftOpen}
                        onClick={() => setSelectedCoworker(item.id)}
                      >
                        {item.name}
                      </Button>
                    ))}
                  </div>
                  {coworkers.length >= MAX_APP_COWORKERS && <p>Reuse a coworker for the next task.</p>}
                  <form
                    className="coworker-create"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!selected || historical || coworkers.length >= MAX_APP_COWORKERS || !coworkerName.trim()) return;
                      void action(async () => {
                        const created = await runtimeRequest<{ id: string }>(
                          `/api/runtime/conversations/${selected}/coworkers`,
                          { name: coworkerName.trim() },
                        );
                        setSelectedCoworker(created.id);
                        setCoworkerName("");
                      });
                    }}
                  >
                    <Input
                      aria-label="Coworker name"
                      placeholder="New coworker name"
                      value={coworkerName}
                      onChange={(event) => setCoworkerName(event.target.value)}
                      maxLength={100}
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant="outline"
                          type="submit"
                          aria-label="Create coworker"
                          disabled={!selected || busy || historical || coworkers.length >= MAX_APP_COWORKERS || !coworkerName.trim()}
                        >
                          <Plus size={16} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Create coworker</TooltipContent>
                    </Tooltip>
                  </form>
                </details>
              )}
              <TaskInspector
                worker={focusedWorker}
                verifications={state.verifications ?? []}
                eligible={profiles.some(
                  (item) => item.id === "desktop-runtime",
                )}
                coworkers={state.coworkers}
                operations={state.operations}
                activeIds={activeIds}
                busy={busy}
                connected={connected}
                allIdle={allIdle}
                canApprove={canApprove}
                approvalReason={approvalReason}
                action={action}
              />
            </div>
          </aside>
        </div>
        <footer className="desktop-footer">
          <span>Local preview · original records stay read-only</span>
          <span>
            {state.provider.available
              ? `Codex ${state.provider.version ?? "available"}`
              : "Codex not ready"}
          </span>
          <span>{appVersionLabel}</span>
        </footer>
      </div>
    </TooltipProvider>
  );
}
