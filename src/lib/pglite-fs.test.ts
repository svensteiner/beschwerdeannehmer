import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isRetryableFsError,
  rmDirRetry,
  rmDirRetrySync,
  RM_RETRY_ATTEMPTS,
} from "./pglite-fs.ts";

test("isRetryableFsError covers Windows lock codes only", () => {
  assert.equal(isRetryableFsError({ code: "EBUSY" }), true);
  assert.equal(isRetryableFsError({ code: "EPERM" }), true);
  assert.equal(isRetryableFsError({ code: "EACCES" }), true);
  assert.equal(isRetryableFsError({ code: "ENOENT" }), false);
  assert.equal(isRetryableFsError(new Error("no")), false);
  assert.equal(isRetryableFsError(null), false);
});

test("rmDirRetry retries EBUSY then drops the folder", async () => {
  let n = 0;
  const waits: number[] = [];
  await rmDirRetry("/tafel.prev", {
    rm: async () => {
      n += 1;
      if (n < 3) {
        const err = new Error("busy") as Error & { code: string };
        err.code = "EBUSY";
        throw err;
      }
    },
    waitMs: async (ms) => {
      waits.push(ms);
    },
  });
  assert.equal(n, 3);
  assert.deepEqual(waits, [40, 80]);
});

test("rmDirRetry throws a non-lock error immediately", async () => {
  await assert.rejects(
    () =>
      rmDirRetry("/tafel", {
        rm: async () => {
          const err = new Error("missing") as Error & { code: string };
          err.code = "ENOENT";
          throw err;
        },
      }),
    /missing/,
  );
});

test("rmDirRetrySync retries EBUSY then drops", () => {
  let n = 0;
  rmDirRetrySync("/anzeige", {
    rmSync: () => {
      n += 1;
      if (n < 2) {
        const err = new Error("busy") as Error & { code: string };
        err.code = "EBUSY";
        throw err;
      }
    },
  });
  assert.equal(n, 2);
});

test("rmDirRetry gives up after the last lock", async () => {
  let n = 0;
  await assert.rejects(
    () =>
      rmDirRetry("/stuck", {
        rm: async () => {
          n += 1;
          const err = new Error("busy") as Error & { code: string };
          err.code = "EBUSY";
          throw err;
        },
        waitMs: async () => undefined,
      }),
    /busy/,
  );
  assert.equal(n, RM_RETRY_ATTEMPTS);
});
