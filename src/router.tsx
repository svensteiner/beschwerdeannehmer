import { createRouter } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { createCspNonce } from "@/lib/security/response-headers";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const nonce = import.meta.env.SSR ? createCspNonce() : undefined;
  return createRouter({
    routeTree,
    defaultErrorComponent: AppErrorComponent,
    ...(nonce ? { ssr: { nonce } } : {}),
  });
}
