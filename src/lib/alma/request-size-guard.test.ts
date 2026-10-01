import assert from "node:assert/strict";
import test from "node:test";
import { inspectRequestBodyLimit, matchesServerFunctionPath } from "./request-size-guard";

function stream(...chunks: Uint8Array[]) {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[index++];
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
  });
}

function request(body: ReadableStream<Uint8Array>, headers?: HeadersInit, signal?: AbortSignal) {
  return new Request("http://silvia.test/_serverFn/example", {
    method: "POST", body, headers, signal, duplex: "half",
  } as RequestInit);
}

const bytes = (size: number) => new Uint8Array(size);

test("allows a valid body, including exactly the limit", async () => {
  assert.equal(await inspectRequestBodyLimit(request(stream(bytes(4))), 4), "ok");
});

test("rejects an oversized or chunked body even with a forged header", async () => {
  assert.equal(await inspectRequestBodyLimit(request(stream(bytes(5))), 4), "too-large");
  assert.equal(await inspectRequestBodyLimit(request(stream(bytes(3), bytes(3))), 4), "too-large");
  assert.equal(await inspectRequestBodyLimit(request(stream(bytes(5)), { "content-length": "1" }), 4), "too-large");
  assert.equal(await inspectRequestBodyLimit(request(stream(bytes(4)), { "content-length": "999" }), 4), "too-large");
});

test("leaves the original request readable after a valid clone check", async () => {
  const original = request(stream(new TextEncoder().encode("keep me")));
  assert.equal(await inspectRequestBodyLimit(original, 16), "ok");
  assert.equal(await original.text(), "keep me");
});

test("fails closed when the clone stalls or the request aborts", async () => {
  const stalled = new ReadableStream<Uint8Array>({ start() {} });
  assert.equal(await inspectRequestBodyLimit(request(stalled), 4, { timeoutMs: 5 }), "unreadable");
  const controller = new AbortController();
  const pending = inspectRequestBodyLimit(
    request(new ReadableStream<Uint8Array>({ start() {} }), {}, controller.signal), 4, { timeoutMs: 100 },
  );
  controller.abort();
  assert.equal(await pending, "unreadable");
});

test("only matches a target server-function path and its handler alias", () => {
  const functionPath = "/_serverFn/function-id";
  assert.equal(matchesServerFunctionPath(functionPath, functionPath), true);
  assert.equal(matchesServerFunctionPath(`${functionPath}/extra`, functionPath), true);
  assert.equal(matchesServerFunctionPath(new URL(`http://silvia.test${functionPath}/extra?x=1`).pathname, functionPath), true);
  assert.equal(matchesServerFunctionPath("/_serverFn/other", functionPath), false);
});
