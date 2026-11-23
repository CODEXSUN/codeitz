type StreamOptions = {
  onOpen: () => void;
  onMessage: (data: string) => void;
  onError: (status?: number) => void;
  retryMs?: number;
};

// Use the app client for every connection so authentication remains tab-scoped.
// Reconnects receive a fresh server snapshot; no credentials enter stream URLs.
export function openLiveStream(request: typeof fetch, path: string, options: StreamOptions) {
  const controller = new AbortController();
  const { signal } = controller;
  const limit = 1024 * 1024;

  async function read(response: Response) {
    const reader = response.body!.getReader();
    const cancel = () => { void reader.cancel().catch(() => {}); };
    signal.addEventListener('abort', cancel, { once: true });
    const decoder = new TextDecoder();
    let buffer = '';
    let data: string[] = [];
    let size = 0;
    let event = '';
    function line(value: string) {
      if (!value) {
        if (data.length && (!event || event === 'message') && !signal.aborted) options.onMessage(data.join('\n'));
        data = []; size = 0; event = '';
      } else if (value.startsWith('data:')) {
        const text = value.slice(5).replace(/^ /, '');
        size += text.length;
        if (size > limit) throw Error('Stream event exceeds the limit.');
        data.push(text);
      } else if (value.startsWith('event:')) event = value.slice(6).trim();
    }
    try {
      while (!signal.aborted) {
        const part = await reader.read();
        if (signal.aborted || part.done) return;
        buffer += decoder.decode(part.value, { stream: true });
        let boundary: RegExpExecArray | null;
        while ((boundary = /\r\n|\r|\n/.exec(buffer))) {
          // A CR at a chunk boundary may be the first half of CRLF.
          if (boundary[0] === '\r' && boundary.index === buffer.length - 1) break;
          line(buffer.slice(0, boundary.index));
          buffer = buffer.slice(boundary.index + boundary[0].length);
        }
        if (buffer.length > limit) throw Error('Stream line exceeds the limit.');
      }
    } finally {
      signal.removeEventListener('abort', cancel);
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }

  const done = (async () => {
    while (!signal.aborted) {
      try {
        const response = await request(path, { signal, headers: { Accept: 'text/event-stream' }, cache: 'no-store' });
        if (signal.aborted) { await response.body?.cancel(); return; }
        if (!response.ok) {
          await response.body?.cancel();
          if (signal.aborted) return;
          options.onError(response.status);
          // Login/session recovery owns these failures; do not retry old identity.
          if ([401, 403].includes(response.status)) return;
        } else if (response.headers.get('content-type')?.split(';')[0].trim() !== 'text/event-stream' || !response.body) {
          await response.body?.cancel();
          options.onError(response.status);
          return;
        } else {
          options.onOpen();
          await read(response);
          if (!signal.aborted) options.onError();
        }
      } catch {
        if (signal.aborted) return;
        options.onError();
      }
      if (signal.aborted) return;
      await new Promise<void>(resolve => {
        const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
        const timer = setTimeout(finish, options.retryMs ?? 1500);
        signal.addEventListener('abort', finish, { once: true });
      });
    }
  })();
  return { close: () => controller.abort(), done };
}
