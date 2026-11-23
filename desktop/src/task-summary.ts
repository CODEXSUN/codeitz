const MAX_SUMMARY_LENGTH = 120;

export function summarizeTaskGoal(goal: string): string {
  const normalized = goal.replace(/\s+/gu, " ").trim();
  if (!normalized) return "No task goal provided.";

  const characters = Array.from(normalized);
  if (characters.length <= MAX_SUMMARY_LENGTH) return normalized;

  return `${characters.slice(0, MAX_SUMMARY_LENGTH - 1).join("").trimEnd()}…`;
}
