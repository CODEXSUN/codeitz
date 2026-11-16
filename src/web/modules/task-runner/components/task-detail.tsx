import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Badge } from '@workspace/ui';
import type { CodingTask } from '../../../../../contracts/task';
export function TaskDetail({ task }: { task: CodingTask }) {
  return <Accordion type="multiple" defaultValue={task.status === 'planned' ? ['plan'] : task.status !== 'completed' && task.result ? ['result'] : []}>
    <AccordionItem value="plan"><AccordionTrigger>Codex plan</AccordionTrigger><AccordionContent><p className="whitespace-pre-wrap break-words leading-relaxed text-muted-foreground">{task.plan || 'No completed plan yet.'}</p></AccordionContent></AccordionItem>
    {task.status !== 'completed' && <AccordionItem value="result"><AccordionTrigger>Result & changed files</AccordionTrigger><AccordionContent><p className="whitespace-pre-wrap break-words leading-relaxed text-muted-foreground">{task.result || 'No coding result yet.'}</p>{task.changedFiles.length > 0 && <ul className="mt-4 space-y-2 rounded-lg bg-muted p-3 font-mono text-xs">{task.changedFiles.map(file => <li key={file} className="break-all">{file}</li>)}</ul>}</AccordionContent></AccordionItem>}
    <AccordionItem value="checks"><AccordionTrigger>Checks <Badge variant="outline">{task.checks.length}</Badge></AccordionTrigger><AccordionContent>{!task.checks.length && <p className="text-muted-foreground">Checks have not run.</p>}{task.checks.map(check => <details key={check.name} className="mb-3 rounded-lg border border-border p-3"><summary className="cursor-pointer text-sm">{check.name} · {check.passed ? 'Passed' : 'Failed'}</summary><pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">{check.output}</pre></details>)}</AccordionContent></AccordionItem>
  </Accordion>;
}
