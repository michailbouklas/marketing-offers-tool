/** Browser side: yields the `data:` JSON of each frame of an SSE response body. */
export async function* readSse<T>(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, "\n");
    let separator: number;
    while ((separator = buffer.indexOf("\n\n")) !== -1) {
      const data = buffer
        .slice(0, separator)
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      buffer = buffer.slice(separator + 2);
      if (data) yield JSON.parse(data) as T;
    }
    if (done) return;
  }
}
