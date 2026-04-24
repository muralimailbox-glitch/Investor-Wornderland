/**
 * Typed client wrapper for /api/v1/ask — streams Server-Sent Events from the
 * concierge and yields parsed frames. Consumers (the Concierge component)
 * import this instead of writing fetch + parsing logic inline.
 */
export type AskMetaFrame = {
  event: 'meta';
  sessionId: string;
  refused?: boolean;
  refusalReason?: string;
  fallback?: boolean;
};

export type AskDeltaFrame = { event: 'delta'; text: string };

export type AskDoneFrame = {
  event: 'done';
  citations: Array<{ section: string; version: string; similarity: number }>;
  model?: string;
  promptVersion?: string;
};

export type AskErrorFrame = { event: 'error'; message: string };

export type AskFrame = AskMetaFrame | AskDeltaFrame | AskDoneFrame | AskErrorFrame;

export type AskInput = {
  question: string;
  sessionId: string;
  signal?: AbortSignal;
};

export async function* streamAsk(input: AskInput): AsyncGenerator<AskFrame> {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: input.question, sessionId: input.sessionId }),
  };
  if (input.signal) init.signal = input.signal;
  const res = await fetch('/api/v1/ask', init);
  if (!res.ok || !res.body) {
    throw new Error(`ask_failed_${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const raw = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const frame = parseFrame(raw);
      if (frame) yield frame;
      boundary = buffer.indexOf('\n\n');
    }
  }
}

function parseFrame(raw: string): AskFrame | null {
  const lines = raw.split('\n');
  let event = 'message';
  let data = '';
  for (const line of lines) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data += line.slice(5).trim();
  }
  if (!data) return null;
  try {
    const parsed = JSON.parse(data) as Record<string, unknown>;
    return { event, ...parsed } as AskFrame;
  } catch {
    return null;
  }
}
