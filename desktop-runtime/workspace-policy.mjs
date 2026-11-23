import path from "node:path";

/** Product app snapshots must not inherit a synthetic acceptance workspace's policy. */
export function appWorkspaceRoot(config) {
  const developmentRoot = config.allowedRepositoryRoots?.[0];
  const selected =
    config.appWorkspaceRoot ??
    (typeof developmentRoot === "string" && path.isAbsolute(developmentRoot)
      ? path.join(developmentRoot, ".local", "codeitz-desktop", "workspaces")
      : null);
  if (typeof selected !== "string" || !path.isAbsolute(selected))
    throw new Error("Set an absolute appWorkspaceRoot for Codeitz Desktop");
  return path.resolve(selected);
}

/** Retained snapshots are review-only; new proposals always use the active root. */
export function retainedAppWorkspaceRoots(config) {
  const roots = config.retainedAppWorkspaceRoots ?? [];
  if (!Array.isArray(roots) || roots.length > 8)
    throw new Error("Retained workspace roots must be a bounded explicit list");
  if (roots.some((root) => typeof root !== "string" || !path.isAbsolute(root)))
    throw new Error("Retained workspace roots must be absolute paths");
  return [...new Set(roots.map((root) => path.resolve(root)))];
}
