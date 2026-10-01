import { defineEventHandler, getRouterParam, setResponseHeader, setResponseStatus } from "h3";
import { getAsset, readAsset } from "#nitro/virtual/public-assets";

const AUDIO_ASSETS = {
  ring: "/sounds/ring.mp3",
  ara: "/sounds/voices/ara.mp3",
} as const;

function rangeFor(header: string | null, size: number): { start: number; end: number } | null {
  if (!header) return { start: 0, end: size - 1 };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return null;

  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    start >= size ||
    requestedEnd < start
  ) {
    return null;
  }
  return { start, end: Math.min(requestedEnd, size - 1) };
}

export default defineEventHandler(async (event) => {
  const method = event.req.method?.toUpperCase() ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    setResponseStatus(event, 405);
    setResponseHeader(event, "Allow", "GET, HEAD");
    return "";
  }

  const id = getRouterParam(event, "id");
  const assetId = id && Object.hasOwn(AUDIO_ASSETS, id)
    ? AUDIO_ASSETS[id as keyof typeof AUDIO_ASSETS]
    : undefined;
  if (!assetId) {
    setResponseStatus(event, 404);
    return "";
  }

  const asset = getAsset(assetId);
  if (!asset || asset.size <= 0) {
    setResponseStatus(event, 404);
    return "";
  }

  const rangeHeader = event.req.headers.get("range");
  const range = rangeFor(rangeHeader, asset.size);
  setResponseHeader(event, "Accept-Ranges", "bytes");
  setResponseHeader(event, "Content-Type", "audio/mpeg");

  if (!range) {
    setResponseStatus(event, 416);
    setResponseHeader(event, "Content-Range", `bytes */${asset.size}`);
    return "";
  }

  const length = range.end - range.start + 1;
  const partial = rangeHeader !== null;
  if (partial) {
    setResponseStatus(event, 206);
    setResponseHeader(event, "Content-Range", `bytes ${range.start}-${range.end}/${asset.size}`);
  }
  setResponseHeader(event, "Content-Length", String(length));

  if (event.req.method === "HEAD") return null;
  const bytes = await readAsset(assetId);
  return bytes.subarray(range.start, range.end + 1);
});
