import { cva } from "class-variance-authority";
export const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        outline: "border border-border text-foreground",
        ok: "bg-ok/12 text-ok",
        warn: "bg-warn/12 text-warn",
        danger: "bg-destructive/12 text-destructive",
      },
    },
    defaultVariants: { variant: "secondary" },
  },
);
