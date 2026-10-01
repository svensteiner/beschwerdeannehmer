import { privacyResponseHeaders } from "../../src/lib/security/response-headers";

interface PrivacyHeadersEvent {
  url: URL;
  res: { headers: Headers };
}

/** Keep browser and intermediary caches away from local practice data. */
export default function privacyHeadersMiddleware(event: PrivacyHeadersEvent) {
  for (const [name, value] of Object.entries(privacyResponseHeaders(event.url.pathname))) {
    event.res.headers.set(name, value);
  }
}
