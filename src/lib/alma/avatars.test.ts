import assert from "node:assert/strict";
import { test } from "node:test";
import { AVATARS, avatarForPlace, isAvatarId, liveAvatarStorageKey } from "./avatars.ts";

test("Graz and Steiermark pick the Graz face, not Wien/Josefstadt", () => {
  assert.equal(avatarForPlace("Graz", "Steiermark"), "graz");
  assert.equal(avatarForPlace("graz", ""), "graz");
  assert.equal(avatarForPlace("", "Steiermark"), "graz");
});

test("other AT cities map to their face; unknown falls back to Wien; empty stays unset", () => {
  assert.equal(avatarForPlace("Wien", "Wien"), "wien");
  assert.equal(avatarForPlace("Linz", "Oberösterreich"), "linz");
  assert.equal(avatarForPlace("Innsbruck", "Tirol"), "innsbruck");
  assert.equal(avatarForPlace("Salzburg", "Salzburg"), "salzburg");
  assert.equal(avatarForPlace("Knittelfeld", "Steiermark"), "graz");
  assert.equal(avatarForPlace("Villach", "Kärnten"), "wien");
  assert.equal(avatarForPlace("", ""), undefined);
  assert.equal(avatarForPlace("  ", "  "), undefined);
  assert.equal(avatarForPlace(undefined, undefined), undefined);
});

test("Wien face look is Klassisch, not the Huber Josefstadt toponym", () => {
  const wien = AVATARS.find((a) => a.id === "wien");
  assert.equal(wien?.look, "Klassisch");
  assert.equal(AVATARS.some((a) => /josefstadt/i.test(`${a.city} ${a.look}`)), false);
});

test("avatar ids and live storage key stay tenant-scoped", () => {
  assert.equal(isAvatarId("graz"), true);
  assert.equal(isAvatarId("josefstadt"), false);
  assert.equal(isAvatarId(""), false);
  assert.equal(liveAvatarStorageKey("p-1"), "silvia.live-avatar:p-1");
  assert.equal(liveAvatarStorageKey("  "), "");
});
