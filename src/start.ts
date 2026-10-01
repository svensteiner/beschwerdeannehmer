import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";
import { inspectRequestBodyLimit, matchesServerFunctionPath } from "@/lib/alma/request-size-guard";

type ServerFunctionUrl = { url: string };

let almaLimitsByPath: Promise<Map<string, number>> | undefined;

// Diese zwei Wege werden aus der angemeldeten Silvia-Oberfläche ausgelöst.
// Externe Telefonie-/Gateway-Endpunkte bleiben davon ausgenommen und prüfen
// ihren eigenen Zugangstoken.
const BROWSER_MUTATION_API_PATHS = new Set([
  "/api/tafel-holen",
  "/api/pms-sync",
]);

function csrfProtectedRequest({ handlerType, pathname, request }: {
  handlerType: string;
  pathname: string;
  request: Request;
}) {
  if (request.method !== "POST") return false;
  return handlerType === "serverFn" ||
    (handlerType === "router" && BROWSER_MUTATION_API_PATHS.has(pathname));
}

function pathOf(serverFunction: ServerFunctionUrl) {
  return new URL(serverFunction.url, "http://silvia.local").pathname;
}

function loadAlmaLimits() {
  return (almaLimitsByPath ??= Promise.all([
    import("@/lib/alma/ask-alma"),
    import("@/lib/alma/speak"),
    import("@/lib/alma/transcribe"),
  ]).then(([{ askAlma }, { speakAlma }, { transcribeAlma }]) => new Map([
    [pathOf(askAlma), 64 * 1024],
    [pathOf(speakAlma), 16 * 1024],
    [pathOf(transcribeAlma), 5 * 1024 * 1024],
  ])));
}

export const startInstance = createStart(() => ({
  requestMiddleware: [
    // Browser-Schreibwege dürfen nur von derselben Website kommen. Der
    // Framework-Standard prüft Sec-Fetch-Site, Origin und als Fallback Referer.
    createCsrfMiddleware({
      filter: csrfProtectedRequest,
    }),
    createMiddleware().server(async ({ request, pathname, handlerType, next }) => {
      if (handlerType !== "serverFn" || request.method !== "POST") return next();
      const limit = [...(await loadAlmaLimits())].find(([functionPath]) =>
        matchesServerFunctionPath(pathname, functionPath),
      )?.[1];
      if (!limit) return next();
      const result = await inspectRequestBodyLimit(request, limit);
      if (result !== "ok") {
        void request.body?.cancel().catch(() => {});
        return new Response("Request body too large", { status: 413 });
      }
      return next();
    }),
  ],
}));
