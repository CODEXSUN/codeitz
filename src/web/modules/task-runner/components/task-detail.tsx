import { CheckResults } from '@workspace/ui/blocks/check-results';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Badge } from '@workspace/ui';
import type { CodingTask } from '../../../../../contracts/task';
export function TaskDetail({ task }: { task: CodingTask }) {
  return <>{task.sourceChat&&<p className="mb-3 text-sm text-muted-foreground">Plan approved in agent chat · <a className="text-primary underline underline-offset-4" href={`/agent-chat/${task.sourceChat.conversationId}`}>View source chat</a></p>}<Accordion type="multiple" defaultValue={task.status === 'planned' ? ['plan'] : task.status !== 'completed' && task.result ? ['result'] : []}>
    <AccordionItem value="plan"><AccordionTrigger>Codex plan</AccordionTrigger><AccordionContent><p className="whitespace-pre-wrap break-words leading-relaxed text-muted-foreground">{task.plan || 'No completed plan yet.'}</p></AccordionContent></AccordionItem>
    {task.status !== 'completed' && <AccordionItem value="result"><AccordionTrigger>Result & changed files</AccordionTrigger><AccordionContent><p className="whitespace-pre-wrap break-words leading-relaxed text-muted-foreground">{task.result || 'No coding result yet.'}</p>{task.changedFiles.length > 0 && <ul className="mt-4 space-y-2 rounded-lg bg-muted p-3 font-mono text-xs">{task.changedFiles.map(file => <li key={file} className="break-all">{file}</li>)}</ul>}</AccordionContent></AccordionItem>}
    <AccordionItem value="checks"><AccordionTrigger>Checks <Badge variant="outline">{task.checks.length}</Badge></AccordionTrigger><AccordionContent><CheckResults items={task.checks}/></AccordionContent></AccordionItem>
  </Accordion></>;
}
