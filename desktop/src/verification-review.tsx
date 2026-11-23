import { useState } from "react";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { CheckResults } from "@workspace/ui/blocks/check-results";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@workspace/ui/components/dialog";
import {
  runtimeRequest,
  type Verification,
  type VerificationProfile,
  type Worker,
} from "./bridge";
import { latestVerification, verificationPassed } from "./task-state";

export function VerificationScope({
  profile,
}: {
  profile: VerificationProfile;
}) {
  return (
    <section className="verification-scope">
      <h4>{profile.name ?? profile.id}</h4>
      <p>{profile.description}</p>
      <p>{profile.isolation}</p>
      <ul>
        {profile.checks?.map((check) => (
          <li key={check.id ?? check.name}>{check.name}</li>
        ))}
      </ul>
      <details>
        <summary>Exact check scope</summary>
        <span>Profile hash</span>
        <code>{profile.hash}</code>
        {Object.entries(profile.images ?? {}).map(([name, image]) => (
          <p key={name}>
            {name}
            <code>{image}</code>
          </p>
        ))}
        {profile.commands?.map((command, index) => (
          <code key={index}>{command}</code>
        ))}
        {profile.exclusions?.length ? (
          <p>Excluded: {profile.exclusions.join("; ")}</p>
        ) : null}
        <p>
          Timeout: {profile.timeoutSeconds ?? "runner-defined"} seconds. No
          commit, push, deployment or automatic Apply.
        </p>
      </details>
    </section>
  );
}

export function VerificationReview({
  worker,
  verifications,
  eligible,
  busy,
  connected,
  action,
}: {
  worker: Worker;
  verifications: readonly Verification[];
  eligible: boolean;
  busy: boolean;
  connected: boolean;
  allIdle: boolean;
  action: (work: () => Promise<void>) => Promise<void>;
}) {
  const check = latestVerification(worker, verifications);
  const [approval, setApproval] = useState<Verification | null>(null);
  const passed = verificationPassed(worker, check);
  const receipt = check?.receipt;
  return (
    <section className="verification-review" aria-label="Task checks">
      <Badge variant="outline">
        {check
          ? passed
            ? "Passed — matching output"
            : check.state
          : worker.verificationProfile
            ? "Approved checks pending"
            : "Not checked"}
      </Badge>
      {worker.verificationProfile ? (
        <p>
          The task approval includes one automatic run of this fixed profile.
          Applying the result always needs a separate review.
        </p>
      ) : (
        <p>
          This task did not include automatic checks. Its original approval
          policy is unchanged.
        </p>
      )}
      {(worker.verificationProfile ?? check?.profile) && (
        <VerificationScope
          profile={(worker.verificationProfile ?? check?.profile)!}
        />
      )}
      {receipt && (
        <>
          <CheckResults
            items={(receipt.checks ?? [])
              .filter((item) => item.status !== "skipped")
              .map((item) => ({
                name: item.name,
                passed: item.status === "passed",
                output:
                  item.message ??
                  `Exit ${item.exitCode ?? "unknown"} · ${item.durationMs ?? 0} ms · ${item.passedTests ?? 0} passed / ${item.failedTests ?? 0} failed`,
              }))}
          />
          {receipt.checks
            ?.filter((item) => item.status === "skipped")
            .map((item) => (
              <p key={item.id ?? item.name}>
                {item.name}: skipped — {item.message ?? "Not executed"}
              </p>
            ))}
          <p>{receipt.message}</p>
          <details>
            <summary>Verification receipt</summary>
            <code>Run: {receipt.runId}</code>
            <code>Manifest: {receipt.manifestDigest}</code>
            <code>Profile: {receipt.profileHash}</code>
            <code>Source: {receipt.sourceFingerprint}</code>
            <p>
              Output unchanged: {String(receipt.outputUnchanged)} · Valid runner
              receipt: {String(receipt.runnerReceiptValid)}
            </p>
            <pre>
              {JSON.stringify(
                {
                  images: receipt.images,
                  cleanup: receipt.cleanup,
                  exclusions: receipt.exclusions,
                  recoveryReference: receipt.recoveryReference,
                },
                null,
                2,
              )}
            </pre>
          </details>
        </>
      )}
      {!eligible && !worker.verificationProfile && (
        <p>
          Not configured for this app. The pilot supports only the trusted
          Codeitz Desktop runtime repository.
        </p>
      )}
      {eligible && worker.state === "completed" && !worker.appliedAt && (
        <Button
          variant="outline"
          disabled={busy || !connected || check?.state === "running"}
          onClick={() =>
            void action(async () => {
              const value = await runtimeRequest<Verification>(
                `/api/runtime/workers/${worker.id}/verification/prepare`,
                {},
              );
              const raw = value as Verification & {
                operation_id?: string;
                manifest_digest?: string;
              };
              setApproval({
                ...raw,
                operationId: raw.operation_id ?? raw.operationId,
                manifestDigest: raw.manifest_digest ?? raw.manifestDigest,
              });
            })
          }
        >
          {check ? "Review another check attempt" : "Review check scope"}
        </Button>
      )}
      <Dialog
        open={!!approval}
        onOpenChange={(open: boolean) => {
          if (!open) setApproval(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve fixed local checks</DialogTitle>
            <DialogDescription>
              This runs only the displayed profile against this task’s captured
              output. It does not apply changes.
            </DialogDescription>
          </DialogHeader>
          {approval && (
            <>
              <VerificationScope profile={approval.profile} />
              <code>Output: {approval.manifestDigest}</code>
              <code>Approval: {approval.digest}</code>
            </>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproval(null)}>
              Cancel
            </Button>
            <Button
              disabled={
                !approval ||
                busy ||
                !connected ||
                approval.state !== "awaiting-approval"
              }
              onClick={() =>
                void action(async () => {
                  if (!approval) return;
                  await runtimeRequest(
                    `/api/runtime/workers/${worker.id}/verification/approve`,
                    { digest: approval.digest },
                  );
                  setApproval(null);
                })
              }
            >
              Approve verification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
