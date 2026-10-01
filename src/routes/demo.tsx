import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { DemoShell } from "@/components/demo/demo-shell";
import { loadTafelAnzeigeFlag } from "@/lib/practice/holen-login-fn";
import { demoPublicShowsHuber } from "@/lib/practice/tafel-anzeige";

export const Route = createFileRoute("/demo")({
  beforeLoad: async () => {
    if (!demoPublicShowsHuber(await loadTafelAnzeigeFlag())) {
      throw redirect({ to: "/app" });
    }
  },
  component: DemoLayout,
});

function DemoLayout() {
  return (
    <DemoShell>
      <Outlet />
    </DemoShell>
  );
}
