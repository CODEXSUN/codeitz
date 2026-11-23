import { useState } from "react";
import { CircleAlert } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import type { RuntimeIssue } from "./bridge";

export function RuntimeIssues({ issues, canOpen, onOpen }: {
  issues: RuntimeIssue[];
  canOpen: (id: string) => boolean;
  onOpen: (id: string) => boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button size="icon-sm" variant="ghost" className="runtime-issues-trigger" aria-label={`Issues: ${issues.length}`}>
              <CircleAlert size={16} />
              {issues.length > 0 && <span className="runtime-issues-count" aria-hidden="true">{issues.length > 99 ? "99+" : issues.length}</span>}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Issues</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="runtime-issues" aria-label="Issues">
        <strong>Issues</strong>
        {issues.length === 0 ? <p>No issues reported.</p> : (
          <ul tabIndex={0} aria-label="Issue list">
            {issues.map((issue) => (
              <li key={`${issue.kind}:${issue.operationId ?? "global"}`}>
                <span>{issue.message}</span>
                {issue.operationId && canOpen(issue.operationId) && (
                  <Button size="sm" variant="ghost" onClick={() => {
                    if (onOpen(issue.operationId!)) setOpen(false);
                  }}>Open task</Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
