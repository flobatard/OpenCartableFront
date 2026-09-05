/**
 * Réponse `fetch` streamant les chunks donnés (découpables au milieu d'un
 * événement) — pour stubber `fetch` dans les specs des clients SSE.
 */
export function sseResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, { status, headers: { 'Content-Type': 'text/event-stream' } });
}
