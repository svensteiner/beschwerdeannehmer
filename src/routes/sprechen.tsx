import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { SiteShell } from "@/components/layout/site-footer";
import { SprechenCall } from "@/components/sprechen/sprechen-call";
import {
  trainingKindFromSearch,
  type TrainingKind,
} from "@/lib/alma/train";
import { getPracticeSession } from "@/lib/practice/auth";
import { loadBoard } from "@/lib/practice/board";
import {
  deskBrowserStorage,
  hadDeskSession,
} from "@/lib/practice/desk-session";
import {
  loadPracticeProfile,
  type PracticeProfile,
} from "@/lib/practice/profile";
import { unreadInternCount } from "@/lib/practice/desk-calls";
import {
  takeHolenOutcome,
  TAFEL_HOLEN_SPRECHEN_FAIL_ID,
  TAFEL_HOLEN_WAIT_HREF,
} from "@/lib/practice/desk-storage";
import { peekAppHolenPending } from "@/lib/practice/holen-wait-gate";
import { loadTafelAnzeigeFlag } from "@/lib/practice/holen-login-fn";
import {
  DESK_ANZEIGE_ID,
  SPRECHEN_DEMO_BANNER_ID,
  sprechenAnzeigeAuthLine,
  sprechenLoginDest,
  sprechenStaffShowsLive,
} from "@/lib/practice/tafel-anzeige";
import { useAnzeigeRefresh } from "@/lib/practice/use-anzeige-refresh";
import { useBoardPoll } from "@/lib/practice/use-board-poll";

type SprechenSearch = {
  mode?: "trainieren";
  training?: TrainingKind;
  test?: "ja";
};

export const Route = createFileRoute("/sprechen")({
  validateSearch: (search: Record<string, unknown>): SprechenSearch => ({
    mode: search.mode === "trainieren" ? "trainieren" : undefined,
    training:
      search.training === "wissen" || search.training === "sprache"
        ? search.training
        : undefined,
    test: search.test === "ja" ? "ja" : undefined,
  }),
  staleTime: 0,
  beforeLoad: async () => {
    if (await peekAppHolenPending()) {
      throw redirect({
        to: TAFEL_HOLEN_WAIT_HREF,
        search: { next: "/sprechen" },
      });
    }
  },
  loader: async () => {
    const [profile, session, anzeige] = await Promise.all([
      loadPracticeProfile(),
      getPracticeSession(),
      loadTafelAnzeigeFlag(),
    ]);
    if (session && !sprechenStaffShowsLive(anzeige)) {
      throw redirect({ to: "/app" });
    }
    const board = session ? await loadBoard() : null;
    return { profile, session, board, anzeige };
  },
  component: SprechenPage,
});

function SprechenPage() {
  const { profile, session, anzeige } = Route.useLoaderData();
  const { mode, training, test } = Route.useSearch();
  const initialTrainMode = mode === "trainieren" || Boolean(training);
  const initialTrainingKind = trainingKindFromSearch(training);
  const testMode = test === "ja";
  if (session && sprechenStaffShowsLive(anzeige)) {
    return (
      <StaffSprechenLine
        initialTrainMode={initialTrainMode}
        initialTrainingKind={initialTrainingKind}
        testMode={testMode}
      />
    );
  }
  return (
    <PublicSprechenLine
      profile={profile.ok ? profile.profile : null}
      anzeige={anzeige}
      initialTrainMode={initialTrainMode}
      initialTrainingKind={initialTrainingKind}
      testMode={testMode}
    />
  );
}

function PublicSprechenLine({
  profile,
  anzeige,
  initialTrainMode,
  initialTrainingKind,
  testMode,
}: {
  profile: PracticeProfile | null;
  anzeige: boolean;
  initialTrainMode: boolean;
  initialTrainingKind: TrainingKind;
  testMode: boolean;
}) {
  const navigate = useNavigate();
  const [expired, setExpired] = useState<boolean | null>(
    anzeige ? false : null,
  );
  const anzeigeLine = sprechenAnzeigeAuthLine(anzeige);

  useEffect(() => {
    if (anzeige) return;
    const desk = hadDeskSession(deskBrowserStorage());
    setExpired(desk);
    if (desk) {
      void navigate({ to: "/login", search: { next: "/sprechen" } });
    }
  }, [anzeige, navigate]);

  if (anzeigeLine) {
    return (
      <SiteShell anzeige={anzeige}>
        <main className="mx-auto max-w-lg px-4 py-16 sm:px-6">
          <p id={DESK_ANZEIGE_ID} className="text-sm text-muted-foreground">
            {anzeigeLine}
          </p>
          <Link
            to="/login"
            search={{
              next: sprechenLoginDest({ dest: "/sprechen", anzeige }) || "/app",
            }}
            className="mt-4 inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline"
          >
            Anmelden
          </Link>
        </main>
      </SiteShell>
    );
  }

  if (expired === null) {
    return (
      <SiteShell anzeige={anzeige}>
        <p id="sprechen-demo-pending" className="sr-only">
          Leitung wird geladen.
        </p>
      </SiteShell>
    );
  }

  if (expired) {
    return (
      <SiteShell anzeige={anzeige}>
        <main className="mx-auto max-w-lg px-4 py-16 sm:px-6">
          <p
            id="sprechen-session-expired"
            className="text-sm text-muted-foreground"
          >
            Ihre Sitzung ist abgelaufen. Bitte anmelden, damit der Anruf auf
            Ihrer Tafel landet — nicht in der Huber-Demo.
          </p>
          <Link
            to="/login"
            search={{ next: "/sprechen" }}
            className="mt-4 inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline"
          >
            Anmelden
          </Link>
        </main>
      </SiteShell>
    );
  }

  return (
    <SiteShell anzeige={anzeige}>
      <div
        id={SPRECHEN_DEMO_BANNER_ID}
        className="border-b border-border bg-secondary/60 px-4 py-3 text-center text-sm text-muted-foreground sm:px-6"
      >
        Das ist die Demo-Leitung (Huber). Ihre Ordination:{" "}
        <Link
          to="/login"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Anmelden
        </Link>
      </div>
      <SprechenCall
        profile={profile}
        initialTrainMode={initialTrainMode}
        initialTrainingKind={initialTrainingKind}
        testMode={testMode}
      />
    </SiteShell>
  );
}

function StaffSprechenLine({
  initialTrainMode,
  initialTrainingKind,
  testMode,
}: {
  initialTrainMode: boolean;
  initialTrainingKind: TrainingKind;
  testMode: boolean;
}) {
  const { profile, session, board } = Route.useLoaderData();
  const holenError = board && board.ok ? board.holenError : null;
  useEffect(() => {
    const outcome = takeHolenOutcome({
      storage: typeof localStorage === "undefined" ? null : localStorage,
      holenError,
    });
    if (outcome?.kind === "ok") toast.success(outcome.text);
    if (outcome?.kind === "error") toast.error(outcome.text);
  }, [holenError]);
  useBoardPoll();
  useAnzeigeRefresh(
    Boolean(board && board.ok && board.anzeige),
    board && board.ok ? (board.writerCopySeq ?? 0) : 0,
  );
  if (!session) return null;
  const unreadProtocol =
    board && board.ok ? unreadInternCount(board.threads) : 0;
  return (
    <AppShell
      session={session}
      contact={
        board && board.ok
          ? {
              practiceName: board.contact.practiceName,
              city: board.contact.city,
            }
          : null
      }
      unreadProtocol={unreadProtocol}
      anzeige={board && board.ok ? Boolean(board.anzeige) : false}
      writerCopySeq={board && board.ok ? (board.writerCopySeq ?? 0) : 0}
      restart={board && board.ok ? (board.restart ?? null) : null}
    >
      {holenError ? (
        <p
          id={TAFEL_HOLEN_SPRECHEN_FAIL_ID}
          className="px-4 pt-3 text-sm sm:px-6"
        >
          {holenError}
        </p>
      ) : null}
      <SprechenCall
        profile={profile.ok ? profile.profile : null}
        anzeige={Boolean(board && board.ok && board.anzeige)}
        initialTrainMode={initialTrainMode}
        initialTrainingKind={initialTrainingKind}
        testMode={testMode}
      />
    </AppShell>
  );
}
