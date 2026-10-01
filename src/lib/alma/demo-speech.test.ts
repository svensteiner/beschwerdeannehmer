import assert from "node:assert/strict";
import { test } from "node:test";
import { DEMO_SPEECH_KEY, normalizeDemoSpeechTerms, readDemoSpeechTerms, writeDemoSpeechTerms } from "./demo-speech.ts";

test("demo vocabulary is bounded, validated and most recent spelling wins", () => {
  assert.deepEqual(normalizeDemoSpeechTerms(["Fip", "  Röntgen  ", "FIP", null, "1234", "x".repeat(41), "<script>"]), ["Röntgen", "FIP"]);
  assert.equal(normalizeDemoSpeechTerms(Array.from({length:50}, (_,i)=>`Begriff ${i}`)).length, 20);
  assert.deepEqual(normalizeDemoSpeechTerms({}), []);
});

test("demo terms survive reload, remain browser-local and can be removed", () => {
  const values = new Map<string,string>();
  const storage = {getItem:(key:string)=>values.get(key) ?? null,setItem:(key:string,value:string)=>{values.set(key,value);}};
  assert.equal(writeDemoSpeechTerms(["Röntgen"], storage), true);
  assert.deepEqual(readDemoSpeechTerms(storage), ["Röntgen"]);
  assert.deepEqual([...values.keys()], [DEMO_SPEECH_KEY]);
  assert.deepEqual(readDemoSpeechTerms({getItem:()=>null,setItem:()=>{}}), []);
  assert.equal(writeDemoSpeechTerms([], storage), true);
  assert.deepEqual(readDemoSpeechTerms(storage), []);
});

test("unavailable or damaged browser storage never claims success", () => {
  const blocked = {getItem:()=>{throw Error("blocked");},setItem:()=>{throw Error("blocked");}};
  assert.equal(writeDemoSpeechTerms(["FIP"], blocked), false);
  assert.deepEqual(readDemoSpeechTerms(blocked), []);
  assert.deepEqual(readDemoSpeechTerms({getItem:()=>"broken",setItem:()=>{}}), []);
});
