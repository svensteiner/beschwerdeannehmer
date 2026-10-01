const RESERVED = new Set([
  "app",
  "demo",
  "login",
  "sprechen",
  "leitung",
  "registrieren",
  "preise",
  "werkzeuge",
  "impressum",
  "datenschutz",
  "admin",
  "api",
  "silvia",
  "huber",
  "ordination",
]);

export function slugifyPractice(name: string) {
  const mapped = name
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
  let slug = mapped
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  if (!slug) slug = "praxis";
  if (RESERVED.has(slug)) slug = `praxis-${slug}`;
  return slug;
}

export function sanitizeLineSlug(raw: string) {
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "").slice(0, 48);
}
