import { z } from 'zod';
export const noteFieldsSchema = z.object({
  title: z.string().trim().min(1, 'Enter a note title.').max(200, 'Use 200 characters or fewer.'),
  content: z.string().max(10 * 1024 * 1024, 'Note content exceeds 10 MiB.'),
  status: z.string().trim().min(1, 'Choose a status.').max(100),
  properties: z.object({
    category: z.string().trim().min(1, 'Choose a category.').max(100),
    assignedTo: z.string().trim().max(200, 'Use 200 characters or fewer for assignment.'),
  }).strict(),
}).strict();
export type NoteFields = z.infer<typeof noteFieldsSchema>;

export type NoteOptionKind = 'category' | 'status';
export type NoteOption = { value: string; label: string };
export type NoteOptions = { category: NoteOption[]; status: NoteOption[] };
