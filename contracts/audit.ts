export type AuditReport = {
  passed: boolean;
  productsChecked: number;
  ownersChecked: number;
  violations: { owner: string; rule: string; message: string }[];
  checkedAt: string;
  durationMs: number;
};

export type Product = { owner: string; name: string };
export const productCheckCatalog = [
  { id: 'governance', label: 'Central governance', description: 'Central governance document exists inside the workspace.' },
  { id: 'folder:contracts', label: 'Public contracts folder', description: 'Checks the folder for shared request, response, and event definitions; it does not validate their contents.' },
  { id: 'folder:src/api/modules', label: 'Backend modules', description: 'Checks the location reserved for backend business logic and data access.' },
  { id: 'folder:src/web/modules', label: 'Frontend modules', description: 'Checks the location reserved for frontend screens, forms, and API clients.' },
  { id: 'folder:tests', label: 'Tests folder', description: 'The product has a tests folder; this does not execute its tests.' },
  { id: 'folder:docs', label: 'Documentation folder', description: 'Checks the folder for app guides, decisions, and work records; document quality is not reviewed.' },
  { id: 'legacy-modules', label: 'Outdated module location', description: 'The old product src/modules folder is absent.' },
  { id: 'instructions', label: 'Agent instructions', description: 'Checks that AGENTS.md exists for agents working on this product.' },
  { id: 'governance-link', label: 'Central governance link', description: 'Checks that AGENTS.md points only to the central rulebook, rather than separate guides.' },
] as const;
export type ProductCheckId = typeof productCheckCatalog[number]['id'];
export type AuditCheck = { id: string; label: string; passed: boolean; message: string };
export type ProductAuditReport = {
  owner: string; passed: boolean; checks: AuditCheck[];
  violations: AuditReport['violations']; checkedAt: string; durationMs: number;
  selectedCheckIds: ProductCheckId[];
};
export type ProductAuditEvent =
  | { type: 'run-start'; owners: string[] }
  | { type: 'owner-start'; owner: string; totalChecks: number }
  | { type: 'check'; owner: string; check: AuditCheck; completedChecks: number; totalChecks: number }
  | { type: 'owner-complete'; owner: string; report: ProductAuditReport }
  | { type: 'owner-error'; owner: string; message: string }
  | { type: 'run-error'; message: string }
  | { type: 'run-complete' };
