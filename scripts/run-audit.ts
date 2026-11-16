import { runGovernanceAudit } from '../src/api/modules/governance-audit/run.ts';

try {
  const report = await runGovernanceAudit(process.argv[2]);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.passed ? 0 : 1;
} catch {
  process.stderr.write('Audit could not finish. Check workspace location and file access.\n');
  process.exitCode = 2;
}
