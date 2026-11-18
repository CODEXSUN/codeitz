import { useEffect, useRef, useState, type ReactNode } from "react";
import { Input, Textarea } from "@workspace/ui";
import {
  UpsertForm,
  UpsertFormField,
  UpsertFormSection,
  UpsertFormSave,
  UpsertFormValidationSummary,
} from "@workspace/ui/blocks/upsert-form";
import {
  FormLookup,
  FormSelect,
  FormDatePicker,
} from "@workspace/ui/blocks/form-controls";
import { RecordList } from "@workspace/ui/blocks/record-list";
import {
  taskInput,
  type TaskInput,
  type TaskDetail,
  type TaskOptions,
  type WorkTask,
  type Option,
} from "../../../../../contracts/work-task";
import { taskApi } from "./services";
import { navigate } from "../../../navigation";
export function TaskForm({
  detail,
  options,
  recent,
  onSaved,
  onHeader,
  onOptions,
  showAside = true,
}: {
  detail?: TaskDetail;
  options: TaskOptions;
  recent: WorkTask[];
  onSaved: (value: TaskDetail) => void;
  onHeader: (node: ReactNode) => void;
  onOptions: () => void;
  showAside?: boolean;
}) {
  const [value, setValue] = useState<TaskInput>(() =>
    detail
      ? {
          title: detail.task.title,
          details: detail.task.details,
          contactId: detail.task.contactId,
          contactName: "",
          mobile: detail.task.mobile,
          listId: detail.task.listId,
          assignedUserId: detail.task.assignedUserId,
          priorityId: detail.task.priorityId,
          statusId: detail.task.statusId,
          dueDate: detail.task.dueDate,
        }
      : {
          title: "",
          details: "",
          contactId: "",
          contactName: "",
          mobile: "",
          listId: "",
          assignedUserId: "",
          priorityId:
            options.priorities.find((item) => item.code === "normal")?.id ?? "",
          statusId:
            options.statuses.find((item) => item.code === "new")?.id ?? "",
          dueDate: "",
        },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const attempt = useRef({ value: "", id: "" });
  const initial = useRef(JSON.stringify(value));
  useEffect(() => {
    onHeader(
      <UpsertFormSave
        formId="work-task-form"
        saving={busy}
        label="Save task"
      />,
    );
    return () => onHeader(null);
  }, [busy, onHeader]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (JSON.stringify(value) !== initial.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [value]);
  const change = (patch: Partial<TaskInput>) =>
    setValue((previous) => ({ ...previous, ...patch }));
  const choices = (items: Option[]) =>
    items.map((item) => ({
      value: item.id,
      label: item.name,
      description: item.role ?? item.mobile,
    }));
  const field = (name: keyof TaskInput, label: string, children: ReactNode, required=false) => (
    <UpsertFormField name={name} label={label} required={required} error={errors[name]}>{children}</UpsertFormField>
  );
  async function save(event: React.FormEvent) {
    event.preventDefault();
    const parsed = taskInput.safeParse(value);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues)
        next[String(issue.path[0])] = issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    setError("");
    const body = JSON.stringify(parsed.data);
    if (attempt.current.value !== body)
      attempt.current = { value: body, id: crypto.randomUUID() };
    try {
      const result = await taskApi<TaskDetail>(
        detail ? "/" + detail.task.id : "",
        {
          input: parsed.data,
          requestId: attempt.current.id,
          ...(detail ? { revision: detail.task.revision } : {}),
        },
        detail ? "PATCH" : "POST",
      );
      initial.current = JSON.stringify(value);
      onSaved(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }
  return <>
    <UpsertFormValidationSummary errors={errors}/>
    <UpsertForm id="work-task-form" saving={busy} error={error} onSubmit={save} keyboardNavigation uniformControlHeight density="compact"
      aside={showAside && recent.length ? <RecordList items={recent.slice(0,5).map(task=>({id:task.id,title:task.title,eyebrow:task.list||'No list',status:task.status}))} onSelect={id=>navigate('/work-tasks/'+id)}/> : undefined}>
      <UpsertFormSection label="Task and contact">
        {field('title','Task title',<Input autoFocus value={value.title} maxLength={255} onChange={event=>change({title:event.target.value})}/>,true)}
        {field('details','Task details',<Textarea rows={5} fixedRows slimScrollbar value={value.details} maxLength={20000} onChange={event=>change({details:event.target.value})}/>)}
        {field('mobile','Mobile no',<Input value={value.mobile} maxLength={30} onChange={event=>change({mobile:event.target.value,contactId:'',contactName:''})}/>)}
        {field('contactId','Contact',<FormLookup ariaLabel="Contact" allowTextValue={false} value={value.contactId} options={choices(options.contacts)} onValueChange={contactId=>change({contactId,contactName:'',mobile:options.contacts.find(item=>item.id===contactId)?.mobile??''})}/>)}
      </UpsertFormSection>
      <UpsertFormSection label="Task properties">
        {field('listId','List in',<FormLookup ariaLabel="List in" allowTextValue={false} createMode="inline" createLabel="Add list" value={value.listId} options={choices(options.lists)} onValueChange={listId=>change({listId})} onCreate={async name=>{const row=await taskApi<Option>('/lists',{name});onOptions();return {value:row.id,label:row.name};}}/>)}
        {field('assignedUserId','Assigned to',<FormLookup ariaLabel="Assigned to" allowTextValue={false} value={value.assignedUserId} options={choices(options.users)} onValueChange={assignedUserId=>change({assignedUserId})}/>)}
        {field('priorityId','Priority',<FormSelect ariaLabel="Priority" value={value.priorityId} options={choices(options.priorities)} onValueChange={priorityId=>change({priorityId})}/>,true)}
        {field('statusId','Status',<FormSelect ariaLabel="Status" value={value.statusId} options={choices(options.statuses.filter(item=>item.code!=='closed'||detail?.task.statusCode==='closed'))} onValueChange={statusId=>change({statusId})}/>,true)}
        {field('dueDate','Due date',<FormDatePicker ariaLabel="Due date" allowManualInput value={value.dueDate} onValueChange={dueDate=>change({dueDate})}/>)}
      </UpsertFormSection>
    </UpsertForm>
  </>;
}
