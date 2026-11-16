import type { CodingTask } from '../../../../../contracts/task.ts';

export function completionResult(task: CodingTask) {
  const implementation = (task.codingResult ?? task.result)
    .replace(/(?:Runner\s+)?(?:Typecheck, build, and browser checks|Typecheck, build, and checks|Checks|Runner checks)\s+(?:remain(?:s)?|are|were)?\s*(?:pending|not run|not yet run)[^.!?]*(?:[.!?]|$)/gi, '')
    .replace(/\b(?:No|None of the) checks (?:were |have been )?run[.!]?/gi, '')
    .trim();
  const checks = task.checks.length ? task.checks.map(check => `${check.name}: ${check.passed ? 'passed' : 'failed'}`).join('; ') : 'No checks completed.';
  return `${implementation || 'See changed files for implementation details.'}\n\nFinal checks: ${checks}\n${task.status === 'completed' ? task.review?.decision === 'accepted' ? 'Checks passed. Result accepted.' : task.review?.decision === 'changes_requested' ? 'Checks passed. Changes requested; linked follow-up awaits planning.' : 'Checks passed. Awaiting result review.' : task.error || 'Review the failed check before continuing.'}`;
}
