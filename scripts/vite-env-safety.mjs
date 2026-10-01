/** Browser-Variablen mit Geheimnissen dürfen nie in einen Vite-Build gelangen. */
const VITE_PREFIX = "VITE_";
const VITE_SECRET_RE = /(?:API[_-]?KEY|SECRET|TOKEN|PASSWORD|PRIVATE[_-]?KEY|CREDENTIAL)/i;

export function isViteSecretKey(name) {
  const key = String(name ?? "");
  return key.startsWith(VITE_PREFIX) && VITE_SECRET_RE.test(key);
}

export function viteSecretKeys(env = {}) {
  return Object.keys(env)
    .filter((key) => Object.prototype.hasOwnProperty.call(env, key) && isViteSecretKey(key))
    .sort();
}

/** Fails closed; the variable names are safe to show, their values are not. */
export function assertNoViteSecrets(env = {}) {
  const keys = viteSecretKeys(env);
  if (!keys.length) return;
  throw new Error(
    `[silvia] Unsichere Browser-Variable(n): ${keys.join(", ")}. ` +
      "VITE_-Variablen werden an den Browser ausgeliefert; Schlüssel bitte ohne VITE_ setzen.",
  );
}
