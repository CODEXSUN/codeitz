import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Activity,
  BellRing,
  CalendarClock,
  ClipboardList,
  LogIn,
  MessageSquare,
  Plus,
  ReceiptText,
  Settings2,
  Timer,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Textarea,
  WorkspaceEditor,
} from "@workspace/ui";
import {
  MasterListV1,
  type MasterListColumn,
} from "@workspace/ui/blocks/data-table";
import {
  FormAnimatedTabs,
  FormDateRangeFilter,
  FormSelect,
} from "@workspace/ui/blocks/form-controls";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@workspace/ui/components/table";
import { AsyncState } from "@workspace/ui/blocks/async-state";
import type {
  TaskAction,
  TaskDetail,
  TaskOptions,
  WorkTask,
  WorkflowRow,
} from "../../../../../contracts/work-task";
import { TaskForm } from "./form";
import { taskApi } from "./services";
import { navigate, setQuery, useLocation } from "../../../navigation";
const plain = (value: string | undefined) =>
  (value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim();
const time = (value?: string) =>
  value ? new Date(value).toLocaleString() : "—";
const duration = (start?: string, end?: string, now = Date.now()) => {
  if (!start) return "—";
  const seconds = Math.max(
    0,
    Math.floor(
      ((end ? new Date(end).getTime() : now) - new Date(start).getTime()) /
        1000,
    ),
  );
  return [
    Math.floor(seconds / 3600),
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
};
type Popup = {
  kind: "charge" | "schedule" | "request-closure" | "review-closure";
  recordId?: string;
};
export function WorkTasksPage({
  onHeader,
}: {
  onHeader: (node: ReactNode) => void;
}) {
  const location = useLocation();
  const { workId, workMode } = location;
  const tab = location.params.get("tab") ?? "actions";
  const [options, setOptions] = useState<TaskOptions | null>(null);
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [body, setBody] = useState("");
  const [parent, setParent] = useState("");
  const [popup, setPopup] = useState<Popup | null>(null);
  const [readComment, setReadComment] = useState<WorkflowRow | null>(null);
  const [actionError, setActionError] = useState("");
  const [clock, setClock] = useState(Date.now());
  const [decision, setDecision] = useState("");
  const pending = useRef({ key: "", id: "" });
  useEffect(() => {
    setBody("");
    setParent("");
    setPopup(null);
    setReadComment(null);
    setActionError("");
    pending.current = { key: "", id: "" };
  }, [workId]);
  const from = location.params.get("from") ?? "";
  const to = location.params.get("to") ?? "";
  useEffect(() => {
    const timer = setInterval(
      () => setClock(Date.now()),
      detail?.task.runningJob ? 1000 : 10000,
    );
    return () => clearInterval(timer);
  }, [detail?.task.runningJob]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    if (!workId) setDetail(null);
    void Promise.all([
      taskApi<TaskOptions>(
        "/options",
        undefined,
        "GET",
        controller.signal,
      ).then((value) => {
        if (!controller.signal.aborted) setOptions(value);
        return value;
      }),
      workId
        ? taskApi<TaskDetail>("/" + workId, undefined, "GET", controller.signal)
        : Promise.resolve(null),
      taskApi<{ tasks: WorkTask[] }>(
        "" +
          (!workId && workMode === "list" && (from || to)
            ? "?" +
              new URLSearchParams({
                ...(from ? { from } : {}),
                ...(to ? { to } : {}),
              })
            : ""),
        undefined,
        "GET",
        controller.signal,
      ),
    ])
      .then(([nextOptions, nextDetail, list]) => {
        if (!controller.signal.aborted) {
          setOptions(nextOptions);
          setDetail(nextDetail);
          setTasks(list.tasks);
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [workId, workMode, refresh, from, to]);
  useEffect(() => {
    if (workMode !== "show" || !workId || tab === "properties" || busy) return;
    const controller = new AbortController();
    const refreshSaved = () => {
      void taskApi<TaskDetail>(
        "/" + workId,
        undefined,
        "GET",
        controller.signal,
      )
        .then((value) => {
          if (!controller.signal.aborted)
            setDetail((current) =>
              !current || value.task.revision >= current.task.revision
                ? value
                : current,
            );
        })
        .catch(() => {});
    };
    const timer = setInterval(refreshSaved, 15000);
    window.addEventListener("focus", refreshSaved);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("focus", refreshSaved);
    };
  }, [workMode, workId, tab, busy]);
  const task = detail?.task.id === workId ? detail.task : null;
  const isForm =
    workMode === "new" ||
    workMode === "edit" ||
    (workMode === "show" && tab === "properties");
  useEffect(() => {
    if (isForm) return;
    onHeader(
      <div className="flex gap-2">
        {workMode !== "list" && <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => setRefresh((value) => value + 1)}
        >
          Refresh
        </Button>}
        {workMode === "list" ? (
          <Button size="sm" onClick={() => navigate("/work-tasks/new")}>
            <Plus aria-hidden="true"/>New task
          </Button>
        ) : task ? (
          <Button
            size="sm"
            onClick={() => navigate("/work-tasks/" + task.id + "/edit")}
          >
            Edit task
          </Button>
        ) : null}
      </div>,
    );
    return () => onHeader(null);
  }, [workMode, isForm, task?.id, busy, onHeader]);
  const loadOptions = useCallback(() => {
    void taskApi<TaskOptions>("/options")
      .then(setOptions)
      .catch((reason) => setError(reason.message));
  }, []);
  function saved(value: TaskDetail) {
    setDetail(value);
    navigate("/work-tasks/" + value.task.id);
    setRefresh((count) => count + 1);
  }
  async function act(input: TaskAction) {
    if (!task || busy) return false;
    setBusy(true);
    setActionError("");
    const key = task.id + JSON.stringify(input);
    if (pending.current.key !== key)
      pending.current = { key, id: crypto.randomUUID() };
    try {
      const next = await taskApi<TaskDetail>("/" + task.id + "/actions", {
        revision: task.revision,
        requestId: pending.current.id,
        input,
      });
      setDetail(next);
      pending.current = { key: "", id: "" };
      return true;
    } catch (reason) {
      setActionError(
        reason instanceof Error ? reason.message : "Task action failed.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function popupSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!popup) return;
    const fields = new FormData(event.currentTarget);
    let input: TaskAction;
    if (popup.kind === "charge")
      input = {
        action: "charge",
        description: String(fields.get("description")),
        amount: String(fields.get("amount")),
        currency: String(fields.get("currency")).toUpperCase(),
      };
    else if (popup.kind === "schedule") {
      const value = String(fields.get("scheduledAt"));
      if (!value || Number.isNaN(new Date(value).getTime())) {
        setActionError("Choose a valid schedule date and time.");
        return;
      }
      input = {
        action: "schedule",
        title: String(fields.get("title")),
        scheduledAt: new Date(value).toISOString(),
      };
    } else if (popup.kind === "request-closure")
      input = {
        action: "request-closure",
        reason: String(fields.get("reason")),
      };
    else
      input = {
        action: "review-closure",
        recordId: popup.recordId!,
        decision: String(fields.get("decision")) as "approved" | "rejected",
        note: String(fields.get("note")),
      };
    if (await act(input)) setPopup(null);
  }
  const columns: MasterListColumn<WorkTask>[] = [
    {
      id: "title",
      label: "Task",
      value: (row) => row.title,
      render: (row) => (
        <div>
          <p className="font-medium">{row.title}</p>
          <p className="max-w-sm truncate text-xs text-muted-foreground">
            {plain(row.details)}
          </p>
        </div>
      ),
    },
    { id: "list", label: "List in", value: (row) => row.list },
    { id: "contact", label: "Contact", value: (row) => row.contactName },
    { id: "mobile", label: "Mobile", value: (row) => row.mobile },
    {
      id: "assigned",
      label: "Assigned to",
      value: (row) => row.assignedTo || "Unassigned",
    },
    {
      id: "priority",
      label: "Priority",
      value: (row) => row.priority,
      render: (row) => <Badge variant="outline">{row.priority}</Badge>,
    },
    {
      id: "status",
      label: "Status",
      value: (row) => row.status,
      render: (row) => (
        <div className="flex gap-1">
          <Badge variant="outline">{row.status}</Badge>
          {row.closurePending && (
            <Badge variant="outline">Closure pending</Badge>
          )}
        </div>
      ),
    },
    { id: "due", label: "Due date", value: (row) => row.dueDate },
    {
      id: "created",
      label: "Created",
      value: (row) => row.createdAt,
      render: (row) => time(row.createdAt),
    },
  ];
  const rows = (
    label: string,
    items: WorkflowRow[],
    cols: MasterListColumn<WorkflowRow>[],
    actions: Parameters<typeof MasterListV1<WorkflowRow>>[0]["actions"] = [],
  ) => (
    <MasterListV1
      label={label}
      data={items}
      columns={cols}
      getRowId={(row) => row.id}
      actions={actions}
    />
  );
  const byTime: MasterListColumn<WorkflowRow>[] = [
    { id: "by", label: "By", value: (row) => row.createdBy },
    {
      id: "created",
      label: "Created",
      value: (row) => row.createdAt,
      render: (row) => time(row.createdAt),
    },
  ];
  if ((workMode !== "list" && (loading || error)) || !options)
    return (
      <main className="mx-auto w-[90%] py-8">
        <AsyncState
          loading={loading}
          error={error}
          onRetry={() => setRefresh((value) => value + 1)}
        >
          {null}
        </AsyncState>
      </main>
    );
  if (workMode === "list")
    return (
      <main className="workspace-list-content">
        <MasterListV1
          label="Tasks"
          openOnRowClick
          loading={loading}
          error={error}
          onRetry={() => setRefresh((value) => value + 1)}
          data={tasks}
          columns={columns}
          getRowId={(row) => row.id}
          onOpen={(row) => navigate("/work-tasks/" + row.id)}
          actions={[
            {
              id: "edit",
              label: "Edit task",
              onSelect: (row) => navigate("/work-tasks/" + row.id + "/edit"),
            },
          ]}
          filterOptions={[
            ...options.statuses.map((status) => ({
              id: status.id,
              label: status.name,
              matches: (row: WorkTask) => row.statusId === status.id,
            })),
            {
              id: "pending",
              label: "Closure pending",
              matches: (row) => row.closurePending,
            },
            {
              id: "running",
              label: "Running jobs",
              matches: (row) => row.runningJob,
            },
          ]}
          toolbarActions={<FormDateRangeFilter from={from} to={to} onChange={range=>setQuery({from:range.from||undefined,to:range.to||undefined})}/>}

        />
      </main>
    );
  if (workMode === "new" || workMode === "edit")
    return (
      <main className="mx-auto w-[calc(100%-2rem)] pt-6 pb-4 sm:w-[90%] sm:pt-8">
        <TaskForm
          key={workId || "new"}
          detail={workMode === "new" ? undefined : (detail ?? undefined)}
          options={options}
          recent={tasks}
          onOptions={loadOptions}
          onSaved={saved}
          onHeader={onHeader}
        />
      </main>
    );
  if (!task || !detail)
    return (
      <p role="alert" className="p-8">
        Task not found.
      </p>
    );
  const closed = task.statusCode === "closed";
  const commentComposer = (
    <div className="mb-5 space-y-3">
      {parent && (
        <p className="text-xs text-muted-foreground">
          Replying to a comment{" "}
          <Button size="sm" variant="ghost" onClick={() => setParent("")}>
            Cancel reply
          </Button>
        </p>
      )}
      <WorkspaceEditor
        readOnly={closed || busy}
        content={body}
        onChange={setBody}
        placeholder="Write an update or comment…"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy || closed || !plain(body)}
          onClick={() => {
            void act({
              action: "comment",
              body,
              ...(parent ? { parentId: parent } : {}),
            }).then((ok) => {
              if (ok) {
                setBody("");
                setParent("");
              }
            });
          }}
        >
          Comment
        </Button>
        {tab === "actions" && (
          <>
            <Button
              variant="outline"
              disabled={busy || closed}
              onClick={() =>
                void act(
                  detail.checkpoints.some((row) => !row.stoppedAt)
                    ? { action: "check-out" }
                    : { action: "check-in", note: "" },
                )
              }
            >
              {detail.checkpoints.some((row) => !row.stoppedAt)
                ? "Check out"
                : "Check in"}
            </Button>
            <Button
              variant="outline"
              disabled={busy || closed}
              onClick={() =>
                void act(
                  task.runningJob
                    ? { action: "stop-job" }
                    : { action: "start-job", note: "" },
                )
              }
            >
              {task.runningJob ? "Stop job" : "Start job"}
            </Button>
            <Button
              variant="outline"
              disabled={busy || closed || task.closurePending}
              onClick={() => {
                setActionError("");
                setPopup({ kind: "request-closure" });
              }}
            >
              Request closure
            </Button>
          </>
        )}
      </div>
    </div>
  );
  const tabs = [
    {
      value: "actions",
      label: "Actions",
      icon: <Activity />,
      count: detail.actions.length,
      content: (
        <>
          {commentComposer}
          {rows("Task actions", detail.actions, [
            { id: "kind", label: "Action", value: (row) => row.kind },
            {
              id: "details",
              label: "Details",
              value: (row) => plain(row.details),
            },
            ...byTime,
          ])}
        </>
      ),
    },
    {
      value: "comments",
      label: "Comments",
      icon: <MessageSquare />,
      count: detail.comments.length,
      content: (
        <>
          {commentComposer}
          {rows(
            "Task comments",
            detail.comments,
            [
              { id: "body", label: "Comment", value: (row) => plain(row.body) },
              {
                id: "reply",
                label: "Reply to",
                value: (row) => row.parentId ?? "",
              },
              ...byTime,
            ],
            [
              {
                id: "view",
                label: "Read comment",
                onSelect: (row) => setReadComment(row),
              },
              {
                id: "reply",
                label: "Reply",
                disabled: (row) => closed || !!row.parentId,
                onSelect: (row) => setParent(row.id),
              },
            ],
          )}
        </>
      ),
    },
    {
      value: "checkpoints",
      label: "Check in / out",
      icon: <LogIn />,
      count: detail.checkpoints.length,
      content: (
        <div className="space-y-4">
          <Button
            disabled={busy || closed}
            onClick={() =>
              void act(
                detail.checkpoints.some((row) => !row.stoppedAt)
                  ? { action: "check-out" }
                  : { action: "check-in", note: "" },
              )
            }
          >
            {detail.checkpoints.some((row) => !row.stoppedAt)
              ? "Check out"
              : "Check in"}
          </Button>
          {rows("Task check-ins", detail.checkpoints, [
            {
              id: "in",
              label: "Checked in",
              value: (row) => row.startedAt,
              render: (row) => time(row.startedAt),
            },
            {
              id: "out",
              label: "Checked out",
              value: (row) => row.stoppedAt,
              render: (row) => time(row.stoppedAt),
            },
            ...byTime,
          ])}
        </div>
      ),
    },
    {
      value: "jobs",
      label: "Jobs",
      icon: <Timer />,
      count: detail.jobs.length,
      content: (
        <div className="space-y-4">
          <Button
            disabled={busy || closed}
            onClick={() =>
              void act(
                task.runningJob
                  ? { action: "stop-job" }
                  : { action: "start-job", note: "" },
              )
            }
          >
            {task.runningJob ? "Stop job" : "Start job"}
          </Button>
          {rows("Task jobs", detail.jobs, [
            {
              id: "start",
              label: "Started",
              value: (row) => row.startedAt,
              render: (row) => time(row.startedAt),
            },
            {
              id: "stop",
              label: "Stopped",
              value: (row) => row.stoppedAt,
              render: (row) =>
                row.stoppedAt ? time(row.stoppedAt) : "Running",
            },
            {
              id: "duration",
              label: "Duration",
              value: (row) => duration(row.startedAt, row.stoppedAt, clock),
            },
            ...byTime,
          ])}
        </div>
      ),
    },
    {
      value: "charges",
      label: "Charges",
      icon: <ReceiptText />,
      count: detail.charges.length,
      content: (
        <div className="space-y-4">
          <Button
            disabled={closed || busy}
            onClick={() => {
              setActionError("");
              setPopup({ kind: "charge" });
            }}
          >
            Add charge
          </Button>
          {rows("Task charges", detail.charges, [
            {
              id: "description",
              label: "Description",
              value: (row) => row.description,
            },
            { id: "amount", label: "Amount", value: (row) => row.amount },
            { id: "currency", label: "Currency", value: (row) => row.currency },
            ...byTime,
          ])}
        </div>
      ),
    },
    {
      value: "schedules",
      label: "Schedules",
      icon: <CalendarClock />,
      count: detail.schedules.length,
      content: (
        <div className="space-y-4">
          <Button
            disabled={closed || busy}
            onClick={() => {
              setActionError("");
              setPopup({ kind: "schedule" });
            }}
          >
            Add schedule
          </Button>
          {rows(
            "Task schedules",
            detail.schedules,
            [
              { id: "title", label: "Title", value: (row) => row.title },
              {
                id: "at",
                label: "Scheduled",
                value: (row) => row.scheduledAt,
                render: (row) => time(row.scheduledAt),
              },
              { id: "state", label: "State", value: (row) => row.state },
              {
                id: "reminded",
                label: "Reminder",
                value: (row) => (row.remindedAt ? "Due" : "Pending"),
              },
            ],
            [
              {
                id: "complete",
                label: "Mark completed",
                disabled: (row) => busy || closed || row.state !== "pending",
                onSelect: (row) =>
                  void act({
                    action: "schedule-state",
                    recordId: row.id,
                    state: "completed",
                  }),
              },
              {
                id: "cancel",
                label: "Cancel schedule",
                disabled: (row) => busy || closed || row.state !== "pending",
                onSelect: (row) =>
                  void act({
                    action: "schedule-state",
                    recordId: row.id,
                    state: "cancelled",
                  }),
              },
            ],
          )}
        </div>
      ),
    },
    {
      value: "properties",
      label: "Properties",
      icon: <Settings2 />,
      content: (
        <TaskForm
          detail={detail}
          options={options}
          recent={tasks}
          showAside={false}
          onOptions={loadOptions}
          onSaved={saved}
          onHeader={onHeader}
        />
      ),
    },
    {
      value: "closure",
      label: "Closure approvals",
      icon: <BellRing />,
      count: detail.closures.length,
      content: (
        <div className="space-y-4">
          <Button
            disabled={busy || closed || task.closurePending}
            onClick={() => {
              setActionError("");
              setPopup({ kind: "request-closure" });
            }}
          >
            Request closure
          </Button>
          {rows(
            "Closure approvals",
            detail.closures,
            [
              { id: "reason", label: "Reason", value: (row) => row.reason },
              { id: "state", label: "State", value: (row) => row.state },
              {
                id: "note",
                label: "Review note",
                value: (row) => row.reviewNote,
              },
              {
                id: "reviewer",
                label: "Reviewed by",
                value: (row) => row.reviewedBy,
              },
              ...byTime,
            ],
            [
              {
                id: "review",
                label: "Review closure",
                disabled: (row) => busy || row.state !== "pending",
                onSelect: (row) => {
                  setActionError("");
                  setDecision("");
                  setPopup({ kind: "review-closure", recordId: row.id });
                },
              },
            ],
          )}
        </div>
      ),
    },
  ];
  return (
    <main className="mx-auto w-[90%] space-y-5 py-6">
      <Card variant="default" className="border-primary/30 shadow-none">
        <CardContent className="space-y-4 pt-5">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-lg font-semibold">
              #{task.id} · {task.title}
            </h1>
            <div className="flex flex-wrap gap-2">
              {task.list && (
                <Badge variant="outline">List in · {task.list}</Badge>
              )}
              <Badge variant="outline">{task.status}</Badge>
              <Badge variant="outline">{task.priority}</Badge>
              {task.closurePending && (
                <Badge variant="outline">Closure pending</Badge>
              )}
            </div>
          </header>
          <p className="whitespace-pre-wrap text-sm">
            {task.details || "No details yet."}
          </p>
          <Table aria-label="Task properties">
            <TableBody>
              {[
                [
                  "Contact",
                  task.contactName || "—",
                  "Mobile",
                  task.mobile || "—",
                ],
                [
                  "Assigned to",
                  task.assignedTo || "Unassigned",
                  "Due date",
                  task.dueDate || "—",
                ],
                ["Created by", task.createdBy, "Created", time(task.createdAt)],
              ].map(([a, b, c, d]) => (
                <TableRow key={a}>
                  <TableCell className="text-muted-foreground">{a}</TableCell>
                  <TableCell>{b}</TableCell>
                  <TableCell className="text-muted-foreground">{c}</TableCell>
                  <TableCell>{d}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {actionError && !popup && (
        <p role="alert" className="text-sm text-destructive">
          {actionError} Refresh to load any newer changes.
        </p>
      )}
      <FormAnimatedTabs
        value={tab}
        onValueChange={(value) => {
          setParent("");
          setQuery({ tab: value === "actions" ? undefined : value });
        }}
        tabs={tabs}
      />
      <Dialog
        open={!!popup}
        onOpenChange={(open) => {
          if (!open && !busy) setPopup(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {popup?.kind === "charge"
                ? "Add charge"
                : popup?.kind === "schedule"
                  ? "Add schedule"
                  : popup?.kind === "review-closure"
                    ? "Review closure"
                    : "Request closure"}
            </DialogTitle>
            <DialogDescription>
              {popup?.kind === "review-closure"
                ? "You are reviewing as the local owner. Stop jobs and check out before approval."
                : "Save a record linked to this task."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={popupSubmit} className="space-y-4">
            <fieldset disabled={busy} className="space-y-3">
              {popup?.kind === "charge" ? (
                <>
                  <label className="block space-y-1 text-sm">
                    Description
                    <Input name="description" required maxLength={255} />
                  </label>
                  <label className="block space-y-1 text-sm">
                    Amount
                    <Input
                      name="amount"
                      required
                      inputMode="decimal"
                      pattern="(?:0|[1-9][0-9]{0,11})(?:[.][0-9]{1,2})?"
                    />
                  </label>
                  <label className="block space-y-1 text-sm">
                    Currency
                    <Input
                      name="currency"
                      required
                      defaultValue="INR"
                      maxLength={3}
                      pattern="[A-Z]{3}"
                    />
                  </label>
                </>
              ) : popup?.kind === "schedule" ? (
                <>
                  <label className="block space-y-1 text-sm">
                    Title
                    <Input name="title" required maxLength={255} />
                  </label>
                  <label className="block space-y-1 text-sm">
                    Date and time
                    <Input name="scheduledAt" type="datetime-local" required />
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Uses this device’s timezone. In-app reminder only.
                  </p>
                </>
              ) : popup?.kind === "review-closure" ? (
                <>
                  <div className="space-y-1 text-sm">
                    <p>Decision</p>
                    <FormSelect
                      ariaLabel="Closure decision"
                      name="decision"
                      required
                      value={decision}
                      onValueChange={setDecision}
                      options={[
                        { value: "approved", label: "Approve" },
                        { value: "rejected", label: "Reject" },
                      ]}
                    />
                  </div>
                  <label className="block space-y-1 text-sm">
                    Review note
                    <Textarea name="note" required maxLength={4000} />
                  </label>
                </>
              ) : (
                <label className="block space-y-1 text-sm">
                  Reason
                  <Textarea name="reason" required maxLength={4000} />
                </label>
              )}
            </fieldset>
            {actionError && (
              <p role="alert" className="text-sm text-destructive">
                {actionError}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setPopup(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!readComment}
        onOpenChange={(open) => {
          if (!open) setReadComment(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Comment</DialogTitle>
            <DialogDescription>
              {readComment?.createdBy} · {time(readComment?.createdAt)}
            </DialogDescription>
          </DialogHeader>
          <WorkspaceEditor readOnly content={readComment?.body} />
        </DialogContent>
      </Dialog>
    </main>
  );
}
