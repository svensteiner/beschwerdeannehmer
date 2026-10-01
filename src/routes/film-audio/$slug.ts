import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createFileRoute } from "@tanstack/react-router";

const AUDIO_FILES: Record<string, string> = {
  ring: "sounds/ring.mp3",
  ara: "sounds/voices/ara.mp3",
};

export const Route = createFileRoute("/film-audio/$slug")({
  server: {
    handlers: {
      GET: ({ params, request }) => serveAudio(params.slug, request),
      HEAD: ({ params, request }) => serveAudio(params.slug, request),
      POST: () => new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } }),
    },
  },
});

async function serveAudio(name: string, request: Request): Promise<Response> {
  const relativePath = AUDIO_FILES[name];
  if (!relativePath) return new Response("Not found", { status: 404 });
  let bytes: Buffer;
  try {
    bytes = await readFile(join(process.cwd(), ".output", "public", relativePath));
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    bytes = await readFile(join(process.cwd(), "public", relativePath));
  }
  const headers = new Headers({ "Accept-Ranges": "bytes", "Content-Type": "audio/mpeg" });
  const range = request.headers.get("range");
  if (!range) {
    headers.set("Content-Length", String(bytes.length));
    return new Response(request.method === "HEAD" ? null : new Uint8Array(bytes), { status: 200, headers });
  }
  const match = /^bytes=(?:(\d+)-(\d*)|-(\d+))$/.exec(range);
  const suffixLength = match?.[3] ? Number(match[3]) : 0;
  const start = match?.[3]
    ? suffixLength > 0 ? Math.max(bytes.length - suffixLength, 0) : -1
    : match ? Number(match[1]) : -1;
  const end = match?.[3]
    ? suffixLength > 0 ? bytes.length - 1 : -1
    : match ? Math.min(match[2] ? Number(match[2]) : bytes.length - 1, bytes.length - 1) : -1;
  if (start < 0 || start >= bytes.length || end < start) {
    return new Response(null, { status: 416, headers: { "Accept-Ranges": "bytes", "Content-Range": `bytes */${bytes.length}`, "Content-Length": "0" } });
  }
  const body = bytes.subarray(start, end + 1);
  headers.set("Content-Length", String(body.length));
  headers.set("Content-Range", `bytes ${start}-${end}/${bytes.length}`);
  return new Response(request.method === "HEAD" ? null : new Uint8Array(body), { status: 206, headers });
}
