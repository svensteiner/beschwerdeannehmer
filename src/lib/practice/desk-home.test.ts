import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DESK_DEMO_BOARD_ID,
  DESK_DEMO_SHELL_ID,
  DESK_HEADER_LOGIN_ID,
  DESK_HEADER_LOGIN_MOBILE_ID,
  DESK_HEADER_TAFEL_ID,
  DESK_HEADER_TAFEL_MOBILE_ID,
  DESK_HOME_DEMO_ID,
  DESK_HOME_SILVIA_ID,
  DESK_HOME_TAFEL_ID,
  deskDemoBoardCopy,
  deskHeaderTafelLabel,
  deskHomeDemoCopy,
} from "./desk-home.ts";

test("logged-in homepage copy names Huber demo and the live Tafel", () => {
  assert.match(deskHomeDemoCopy(), /Huber-Demo/);
  assert.match(deskHomeDemoCopy(), /nicht Ihre Tafel/);
  assert.match(deskDemoBoardCopy(), /Huber-Demo-Tafel/);
  assert.equal(deskHeaderTafelLabel(), "Zur Tafel");
  assert.equal(DESK_HOME_DEMO_ID, "desk-home-demo");
  assert.equal(DESK_DEMO_BOARD_ID, "desk-demo-board");
  assert.equal(DESK_DEMO_SHELL_ID, "desk-demo-shell");
  assert.equal(DESK_HOME_TAFEL_ID, "desk-home-tafel");
  assert.equal(DESK_HOME_SILVIA_ID, "desk-home-silvia");
  assert.equal(DESK_HEADER_TAFEL_ID, "desk-header-tafel");
  assert.equal(DESK_HEADER_LOGIN_ID, "desk-header-login");
  assert.equal(DESK_HEADER_TAFEL_MOBILE_ID, "desk-header-tafel-mobile");
  assert.equal(DESK_HEADER_LOGIN_MOBILE_ID, "desk-header-login-mobile");
});
