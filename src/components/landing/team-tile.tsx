import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

type TeamTileLink = {
  label: string;
  href: string;
};

type TeamTileProps = {
  name: string;
  role: string;
  photo: string;
  initials: string;
  intro: string;
  cv: string[];
  links?: TeamTileLink[];
};

/**
 * A team member card that reveals the Lebenslauf (CV) as an overlay panel
 * on hover, keyboard focus, or tap (touch devices have no hover, so a tap
 * toggles the panel instead).
 */
export function TeamTile({
  name,
  role,
  photo,
  initials,
  intro,
  cv,
  links,
}: TeamTileProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const [tapped, setTapped] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // A 404 often resolves before hydration attaches the (non-bubbling) error
  // listener, so the onError handler alone can miss it. Catch that race by
  // checking the image state once we mount.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) {
      setImgFailed(true);
    }
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setTapped((value) => !value);
    } else if (event.key === "Escape") {
      setTapped(false);
      event.currentTarget.blur();
    }
  }

  return (
    <article
      className="group relative overflow-hidden rounded bg-card ring-1 ring-border outline-none focus-visible:ring-2 focus-visible:ring-primary"
      tabIndex={0}
      aria-expanded={tapped}
      aria-label={`${name} – Lebenslauf anzeigen`}
      onClick={() => setTapped((value) => !value)}
      onKeyDown={handleKeyDown}
    >
      <div className="aspect-square w-full overflow-hidden bg-[#EDE7D9]">
        {imgFailed ? (
          <div className="flex h-full w-full items-center justify-center font-display text-5xl font-semibold text-[#C9C1AE]">
            {initials}
          </div>
        ) : (
          <img
            ref={imgRef}
            src={photo}
            alt=""
            className="h-full w-full object-cover object-top"
            onError={() => setImgFailed(true)}
          />
        )}
      </div>
      <div className="p-[18px]">
        <p className="font-display text-lg font-semibold tracking-[-0.015em]">
          {name}
        </p>
        <p className="mt-1 text-[13px] text-muted-foreground">{role}</p>
      </div>

      <div
        className={cn(
          "pointer-events-none absolute inset-0 flex flex-col justify-end overflow-y-auto bg-[#1B1A16]/94 p-5 text-[#F4F0E6] opacity-0 translate-y-1 backdrop-blur-[1px] transition-all duration-200 ease-out",
          "group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100",
          "group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100",
          tapped && "pointer-events-auto translate-y-0 opacity-100",
        )}
      >
        <p className="text-xs font-semibold tracking-[0.14em] text-[#C9C1AE] uppercase">
          Lebenslauf
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-[#F4F0E6]/90">
          {intro}
        </p>
        <ul className="mt-3 space-y-1.5 text-[13px] leading-relaxed">
          {cv.map((item) => (
            <li key={item} className="flex gap-2">
              <span aria-hidden="true" className="text-[#C9C1AE]">
                •
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
        {links && links.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-white/15 pt-3 text-[13px]">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-white"
                onClick={(event) => event.stopPropagation()}
              >
                {link.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
