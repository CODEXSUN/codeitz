import { invoke } from "@tauri-apps/api/core";

export type AppRecord = {
  id: string;
  name: string;
  repository: string;
  sourceProjectOwner?: string | null;
  head?: string;
  dirtyFingerprint?: string;
  verificationProfiles?: string[];
};
export type Conversation = {
  id: string;
  title: string;
  appId?: string | null;
  providerThreadId?: string | null;
  createdAt?: string;
};
export type Message = {
  id: string;
  conversationId: string;
  operationId?: string | null;
  role: string;
  text: string;
  state?: string;
  createdAt?: string;
  attachments?: AttachmentMetadata[];
};
export type AttachmentMetadata = {
  id: string;
  conversationId: string;
  name: string;
  mime: string;
  size: number;
  sha256: string;
  text?: string;
  textTruncated?: boolean;
  textBytes?: number;
  sent?: boolean;
  width?: number;
  height?: number;
};
export type Worker = {
  id: string;
  conversationId: string;
  coworkerId?: string | null;
  goal: string;
  digest: string;
  state: string;
  workspace: string;
  result?: string | null;
  approvedAt?: string | null;
  verificationProfile?: VerificationProfile | null;
  changeManifest?: ChangeManifest | null;
  completionAssessment?: CompletionAssessment | null;
  progress?: {
    phase: string;
    message?: string;
    updatedAt?: string;
    sequence?: number;
  } | null;
  executionError?: string | null;
  appliedAt?: string | null;
  applyReceipt?: {
    state: "applying" | "review-required" | "reviewed" | "applied" | "conflict";
    applied?: boolean;
    error?: string;
  } | null;
  repositorySnapshot?: {
    repository: string;
    head: string;
    dirtyFingerprint: string;
    memoryContext?: MemoryContext;
  };
  taskReference?: { authority: string; id: string } | null;
};
export type CompletionAssessment = {
  version: 1;
  status: "needs-work" | "reported-ready" | "legacy-unassessed";
  manifestDigest: string | null;
  summary: string;
  missing: string[];
  blockers: string[];
  evidence: string[];
};
export type Coworker = {
  createdAt?: string;
  id: string;
  conversationId: string;
  name: string;
  providerThreadId?: string | null;
};
export type SourceTask = {
  sourceKind: "runner" | "business" | "todo";
  id: string;
  owner: string | null;
  title: string;
  status: string;
};
export type SourceCatalog = {
  connection: {
    connected: boolean;
    origin: string;
    mode: string;
    message?: string;
  };
  projects: { owner: string; name: string; area: string; purpose?: string }[];
  runnerTasks: SourceTask[];
  businessTasks: SourceTask[];
  todoTasks?: SourceTask[];
};
export type ChangeManifest = {
  digest: string;
  blocked?: boolean | string[];
  files: {
    path: string;
    kind: string;
    beforeHash?: string;
    afterHash?: string;
    beforeText?: string | null;
    afterText?: string | null;
  }[];
};
export type VerificationProfile = {
  id: string;
  hash: string;
  name?: string;
  description?: string;
  images?: Record<string, string>;
  checks?: { id?: string; name: string }[];
  isolation?: string;
  exclusions?: string[];
  commands?: string[];
  timeoutSeconds?: number;
  automaticAfterApproval?: boolean;
  [key: string]: unknown;
};
export type Verification = {
  id: string;
  operationId: string;
  digest: string;
  profile: VerificationProfile;
  manifestDigest: string;
  workspace: string;
  state: "awaiting-approval" | "running" | "passed" | "failed" | "interrupted";
  createdAt?: string;
  approvedAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  receipt?: {
    passed?: boolean;
    manifestDigest?: string;
    profileHash?: string;
    outputUnchanged?: boolean;
    runnerReceiptValid?: boolean;
    runId?: string;
    profileId?: string;
    sourceFingerprint?: string;
    images?: Record<string, string>;
    exclusions?: string[];
    cleanup?: unknown;
    recoveryReference?: string;
    checks?: {
      id?: string;
      name: string;
      status: "passed" | "failed" | "skipped";
      message?: string;
      exitCode?: number;
      durationMs?: number;
      passedTests?: number;
      failedTests?: number;
      skippedTests?: number;
    }[];
    message?: string;
  } | null;
};
export type ActivityItem = {
  id: string;
  operation_id: string;
  type: string;
  data: { message?: string; itemType?: string };
  created_at?: string;
};
export type ActivityPage = {
  items: ActivityItem[];
  cursor: string;
  hasMore: boolean;
};
export type Operation = Worker & {
  kind: "chat" | "worker";
  providerThreadId?: string | null;
  providerTurnId?: string | null;
};
export type RuntimeEvent = {
  id: string;
  conversationId?: string;
  workerId?: string;
  type: string;
  message?: string;
  createdAt?: string;
};
export type RuntimeIssue = {
  kind: string;
  severity: "error" | "warning";
  message: string;
  operationId?: string;
  appId?: string;
};
export type RuntimeState = {
  issues?: RuntimeIssue[];
  conversations: Conversation[];
  apps: AppRecord[];
  coworkers: Coworker[];
  sourceCatalog?: SourceCatalog;
  messages: Message[];
  workers: Worker[];
  operations: Operation[];
  events: RuntimeEvent[];
  attachments?: AttachmentMetadata[];
  verificationProfiles?: VerificationProfile[];
  verifications?: Verification[];
  provider: {
    available: boolean;
    version?: string;
    error?: string;
    busy?: boolean;
    sandbox?: unknown;
    capacity?: {
      limit: number;
      active: number;
      available: number;
      activeWorkers: number;
      activeChats: number;
      maintenance: boolean;
      uncertain?: number;
      reviews?: number;
      operations?: {
        id: string;
        kind: string;
        key: string;
        slot: number;
        uncertain: boolean;
      }[];
    };
  };
};

export type MemoryRecord = {
  id: string;
  appId: string;
  conversationId: string | null;
  kind: "fact" | "decision" | "constraint" | "next-action";
  title: string;
  content: string;
  status: "active" | "archived";
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type MemoryContext = { version: 1; entries: MemoryRecord[]; digest: string };

export async function runtimeRequest<T>(
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await invoke<unknown>("runtime_request", {
    method: body === undefined ? "GET" : "POST",
    path,
    body: body === undefined ? null : body,
  });
  if (path !== "/api/runtime/state") return response as T;
  const state = response as Record<string, any>;
  return {
    ...state,
    apps: (state.apps ?? []).map((item: any) => ({
      ...item,
      sourceProjectOwner: item.source_project_owner,
      dirtyFingerprint: item.dirty_fingerprint,
    })),
    coworkers: (state.coworkers ?? []).map((item: any) => ({
      ...item,
      conversationId: item.conversation_id,
      createdAt: item.created_at ?? item.createdAt,
      providerThreadId: item.provider_thread_id,
    })),
    conversations: state.conversations.map((item: any) => ({
      ...item,
      appId: item.app_id,
      createdAt: item.created_at ?? item.createdAt,
      providerThreadId: item.provider_thread_id,
    })),
    messages: state.messages.map((item: any) => ({
      ...item,
      conversationId: item.conversation_id,
      operationId: item.operation_id,
    })),
    workers: state.workers.map((item: any) => ({
      ...item,
      conversationId: item.conversation_id,
      coworkerId: item.coworker_id,
      repositorySnapshot: item.repository_snapshot,
      taskReference: item.task_reference,
      applyReceipt: item.apply_receipt,
      appliedAt: item.applied_at,
      executionError: item.execution_error ?? item.executionError,
      approvedAt: item.approved_at,
      verificationProfile: item.verification_profile,
      changeManifest: item.change_manifest,
      completionAssessment: item.completion_assessment ?? item.completionAssessment,
    })),
    operations: (state.operations ?? []).map((item: any) => ({
      ...item,
      conversationId: item.conversation_id,
      providerThreadId: item.provider_thread_id,
      providerTurnId: item.provider_turn_id,
      coworkerId: item.coworker_id,
      executionError: item.execution_error ?? item.executionError,
      repositorySnapshot: item.repository_snapshot,
      applyReceipt: item.apply_receipt,
      appliedAt: item.applied_at,
      approvedAt: item.approved_at,
      verificationProfile: item.verification_profile,
      changeManifest: item.change_manifest,
      completionAssessment: item.completion_assessment ?? item.completionAssessment,
    })),
    events: state.events.map((item: any) => ({
      ...item,
      message:
        typeof item.data?.message === "string" ? item.data.message : undefined,
    })),
    verificationProfiles: Array.isArray(state.verificationProfiles)
      ? state.verificationProfiles
      : [],
    verifications: (state.verifications ?? []).map((item: any) => ({
      ...item,
      operationId: item.operation_id ?? item.operationId,
      manifestDigest: item.manifest_digest ?? item.manifestDigest,
      createdAt: item.created_at ?? item.createdAt,
      approvedAt: item.approved_at,
      startedAt: item.started_at,
      finishedAt: item.finished_at,
    })),
  } as T;
}

export async function reconnectRuntime(): Promise<void> {
  await invoke("ensure_runtime");
}

export async function pickRepository(): Promise<string | null> {
  return invoke<string | null>("pick_repository");
}
