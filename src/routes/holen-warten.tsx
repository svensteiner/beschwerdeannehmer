import { createFileRoute, redirect } from "@tanstack/react-router";
import { HolenWaitPage } from "@/components/app/holen-wait";
import { holenWaitNext } from "@/lib/practice/desk-session";
import { holenWaitFirstPaint } from "@/lib/practice/desk-storage";
import { peekAppHolenWait } from "@/lib/practice/holen-wait-gate";

export const Route = createFileRoute("/holen-warten")({
  validateSearch: (search: Record<string, unknown>) => ({
    next: holenWaitNext(search.next),
  }),
  loaderDeps: ({ search }) => ({ next: search.next }),
  loader: async ({ deps }) => {
    const paint = holenWaitFirstPaint(await peekAppHolenWait());
    if (paint.kind === "leave") throw redirect({ href: deps.next });
    return { fail: paint.fail };
  },
  component: HolenWartenRoute,
});

function HolenWartenRoute() {
  const { next } = Route.useSearch();
  const { fail } = Route.useLoaderData();
  return <HolenWaitPage next={next} fail={fail} />;
}
