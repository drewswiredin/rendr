// Models miscount brackets on long single-line JSON patches (a 2k-char
// element with nested arrays is enough), and json-render's transform silently
// drops any line that doesn't parse. This stage sits in front of it: inside a
// ```spec fence it buffers text per line, repairs unbalanced brackets, and
// re-emits the line. Prose outside the fence streams through untouched.

type TextChunk = { type: string; id?: string; delta?: string };

const FENCE_OPEN = /^```spec\s*$/;
const FENCE_CLOSE = /^```\s*$/;

// Closes what's open (in order) or trims stray closers at the end. Strings and
// escapes are respected so brackets inside text don't count.
export function repairJsonLine(line: string): string {
  const trimmed = line.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) {
    return line;
  }
  try {
    JSON.parse(trimmed);
    return line;
  } catch {
    // fall through to repair
  }

  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let end = trimmed.length;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      stack.push("}");
    } else if (ch === "[") {
      stack.push("]");
    } else if (ch === "}" || ch === "]") {
      if (stack.length === 0) {
        // Extra closer: everything from here on is noise.
        end = i;
        break;
      }
      stack.pop();
    }
  }

  let candidate = trimmed.slice(0, end);
  if (inString) {
    candidate += '"';
  }
  candidate += stack.reverse().join("");

  try {
    JSON.parse(candidate);
    return candidate;
  } catch {
    return line; // still broken; let the parser drop it as before
  }
}

export function repairSpecLines<T>(
  stream: ReadableStream<T>,
): ReadableStream<T> {
  let inFence = false;
  let buffer = "";
  let textId: string | undefined;

  const emit = (
    controller: TransformStreamDefaultController<T>,
    delta: string,
  ) => {
    if (delta) {
      controller.enqueue({ type: "text-delta", id: textId, delta } as T);
    }
  };

  const flushLines = (
    controller: TransformStreamDefaultController<T>,
    final: boolean,
  ) => {
    for (;;) {
      const nl = buffer.indexOf("\n");
      if (nl === -1) {
        break;
      }
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (!inFence) {
        if (FENCE_OPEN.test(line)) {
          inFence = true;
        }
        emit(controller, `${line}\n`);
      } else if (FENCE_CLOSE.test(line)) {
        inFence = false;
        emit(controller, `${line}\n`);
      } else {
        emit(controller, `${repairJsonLine(line)}\n`);
      }
    }
    if (final && buffer) {
      emit(controller, inFence ? repairJsonLine(buffer) : buffer);
      buffer = "";
    }
  };

  return stream.pipeThrough(
    new TransformStream<T, T>({
      transform(chunk, controller) {
        const c = chunk as TextChunk;
        if (c.type === "text-delta" && typeof c.delta === "string") {
          textId = c.id;
          buffer += c.delta;
          // Complete lines first (this may enter or leave the fence)…
          flushLines(controller, false);
          // …then the partial tail: inside the fence it waits for its
          // newline; outside it streams unless it could be a fence opener.
          if (!inFence && buffer) {
            const tail = buffer.slice(buffer.lastIndexOf("\n") + 1);
            if (!"```spec".startsWith(tail)) {
              emit(controller, buffer);
              buffer = "";
            }
          }
          return;
        }
        if (c.type === "text-end") {
          flushLines(controller, true);
          inFence = false;
        }
        controller.enqueue(chunk);
      },
      flush(controller) {
        flushLines(controller, true);
      },
    }),
  );
}
