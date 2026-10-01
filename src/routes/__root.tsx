import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { contentSecurityPolicy } from "@/lib/security/response-headers";
import "../styles.css";

export const Route = createRootRoute({
  headers: ({ ssr }) => ssr?.nonce
    ? { "content-security-policy": contentSecurityPolicy(ssr.nonce) }
    : undefined,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { title: "Garagenwächter – Beschwerde melden" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      {
        name: "description",
        content:
          "Garagenwächter nimmt Beschwerden von Garagenkunden strukturiert und nachvollziehbar entgegen.",
      },
      { name: "theme-color", content: "#1F4A3A" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
  }),
  component: () => (
    <html lang="de-AT" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  ),
});
