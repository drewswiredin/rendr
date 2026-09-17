import "server-only";

// In-flight replies, kept in memory so a reply outlives the request that
// started it: the response is tee'd here, generation runs to the end even if
// the browser navigates away, and a client that comes back (useChat
// `resume`) replays what it missed and follows the rest. One process, one
// map — fine for a personal app; a multi-instance deploy would need a store.

type Live = {
  chunks: string[];
  done: boolean;
  listeners: Set<() => void>;
  abort: AbortController;
};

const g = globalThis as typeof globalThis & { __rendrLive?: Map<string, Live> };
const live: Map<string, Live> = g.__rendrLive ?? new Map();
g.__rendrLive = live;

// Registers a reply for `chatId` (stopping one already running) and returns
// the controller that `stopLiveStream` fires.
export function beginLiveStream(chatId: string): AbortController {
  stopLiveStream(chatId);
  const entry: Live = {
    chunks: [],
    done: false,
    listeners: new Set(),
    abort: new AbortController(),
  };
  live.set(chatId, entry);
  return entry.abort;
}

// Drains the SSE copy into the entry, then forgets it.
export async function publishLiveStream(
  chatId: string,
  stream: ReadableStream<string>,
) {
  const entry = live.get(chatId);
  if (!entry) {
    return;
  }
  const notify = () => {
    for (const l of entry.listeners) {
      l();
    }
  };
  try {
    const reader = stream.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      entry.chunks.push(value);
      notify();
    }
  } finally {
    entry.done = true;
    notify();
    if (live.get(chatId) === entry) {
      live.delete(chatId);
    }
  }
}

// A stream that replays the reply so far and follows it live; null when
// nothing is in flight.
export function subscribeLiveStream(
  chatId: string,
): ReadableStream<string> | null {
  const entry = live.get(chatId);
  if (!entry) {
    return null;
  }
  let sent = 0;
  let push = () => {};
  return new ReadableStream<string>({
    start(controller) {
      push = () => {
        while (sent < entry.chunks.length) {
          controller.enqueue(entry.chunks[sent++]);
        }
        if (entry.done) {
          entry.listeners.delete(push);
          controller.close();
        }
      };
      entry.listeners.add(push);
      push();
    },
    cancel() {
      entry.listeners.delete(push);
    },
  });
}

export function stopLiveStream(chatId: string): boolean {
  const entry = live.get(chatId);
  if (!entry || entry.done) {
    return false;
  }
  entry.abort.abort();
  return true;
}
