import {appFetch} from '../../../platform-client';
export async function taskApi<T>(
  path = "",
  body?: unknown,
  method = "POST",
  signal?: AbortSignal,
): Promise<T> {
  const response = await appFetch(
    "/api/v1/work-tasks" + path,
    body === undefined
      ? { cache: "no-store", signal }
      : {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal,
        },
  );
  const value = await response.json();
  if (!response.ok)
    throw new Error(
      value.message || `Task request failed (${response.status}).`,
    );
  return value;
}
