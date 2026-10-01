import { AVATARS, avatarById, type AvatarId } from "@/lib/alma/avatars";
import { useAlmaStore } from "@/lib/alma/store";
import { cn } from "@/lib/utils";
import { writeStoredAvatar } from "./silvia-avatar-storage";

const SIZE = {
  sm: "size-8",
  md: "size-10",
  lg: "size-20",
} as const;

export function SilviaAvatar({
  size = "md",
  pulse = false,
  className,
  avatarId,
}: {
  size?: keyof typeof SIZE;
  pulse?: boolean;
  className?: string;
  avatarId?: AvatarId;
}) {
  const stored = useAlmaStore((s) => s.avatarId);
  const avatar = avatarById(avatarId ?? stored);
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 overflow-hidden rounded-full",
        SIZE[size],
        pulse && "alma-pulse",
        className,
      )}
    >
      <img
        src={avatar.src}
        alt=""
        className="size-full object-cover object-top"
      />
    </span>
  );
}

export function AvatarPicker({
  className,
  preferred,
  persistKey,
  selectedId,
  onSelect,
}: {
  className?: string;
  preferred?: AvatarId;
  persistKey?: string;
  selectedId?: AvatarId;
  onSelect?: (id: AvatarId) => void;
}) {
  const stored = useAlmaStore((s) => s.avatarId);
  const setAvatar = useAlmaStore((s) => s.setAvatar);
  const selected = selectedId ?? stored;

  function pick(id: AvatarId) {
    if (onSelect) {
      onSelect(id);
      writeStoredAvatar(persistKey, id);
      return;
    }
    setAvatar(id);
  }

  return (
    <div
      className={className}
      data-selected-avatar={selected}
      data-preferred-avatar={preferred ?? ""}
    >
      <p className="mb-3 text-xs font-medium tracking-[0.18em] text-primary uppercase">
        Welche Silvia sitzt bei Ihnen?
      </p>
      <div className="flex flex-wrap gap-3">
        {AVATARS.map((a) => (
          <button
            key={a.id}
            id={`sprechen-avatar-${a.id}`}
            type="button"
            onClick={() => pick(a.id as AvatarId)}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-lg p-1.5 text-center transition-colors",
              selected === a.id ? "bg-secondary" : "hover:bg-secondary/60",
            )}
            aria-pressed={selected === a.id}
            aria-label={`Silvia, ${a.city}`}
          >
            <img
              src={a.src}
              alt=""
              className={cn(
                "size-16 rounded-full object-cover object-top ring-2 ring-offset-2 ring-offset-background",
                selected === a.id ? "ring-primary" : "ring-transparent",
              )}
            />
            <span className="text-xs font-medium">{a.city}</span>
            <span className="text-[11px] text-muted-foreground">{a.look}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
