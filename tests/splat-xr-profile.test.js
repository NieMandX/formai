import test from "node:test";
import assert from "node:assert/strict";
import { rendererAntialias, SplatXRProfile } from "../src/scene/splat-xr-profile.js";

test("MSAA is disabled on Quest and its dev emulator, while desktop keeps its existing context", () => {
  assert.equal(rendererAntialias("Mozilla/5.0 (X11; Linux x86_64; Quest 3) OculusBrowser/39.2 VR Safari/537.36"), false);
  assert.equal(rendererAntialias("Quest 3 Mobile VR"), false);
  assert.equal(rendererAntialias("OculusBrowser/39.2"), false);
  assert.equal(rendererAntialias("Chrome/140 Safari/537.36"), true);
  assert.equal(rendererAntialias("Chrome/140", true), false);
});

test("XR splats avoid shadow passes and excessive foveation, restoring desktop on exit", () => {
  let foveation = 1;
  const renderer = { shadowMap: { enabled: true, needsUpdate: false }, xr: {
    getFoveation: () => foveation, setFoveation: value => { foveation = value; },
  } };
  const profile = new SplatXRProfile(renderer);
  const spark = { maxStdDev: Math.sqrt(8), enableLod: false };
  profile.update(spark, false);
  assert.equal(renderer.shadowMap.enabled, true); assert.equal(foveation, 1);
  profile.update(spark, true); profile.update(spark, true);
  assert.equal(renderer.shadowMap.enabled, false); assert.equal(foveation, .35);
  assert.equal(spark.maxStdDev, Math.sqrt(5)); assert.equal(spark.enableLod, false);
  profile.update(spark, false);
  assert.equal(renderer.shadowMap.enabled, true); assert.equal(renderer.shadowMap.needsUpdate, true);
  assert.equal(spark.maxStdDev, Math.sqrt(8)); assert.equal(foveation, 1);
});

test("loading and unloading mid-session restores the prior profile and supports replacement renderers", () => {
  let foveation = .5;
  const renderer = { shadowMap: { enabled: false }, xr: {
    getFoveation: () => foveation, setFoveation: value => { foveation = value; },
  } };
  const profile = new SplatXRProfile(renderer), a = { maxStdDev: 2.8 }, b = { maxStdDev: 3 };
  profile.update(null, true); assert.equal(foveation, .5);
  profile.update(a, true); profile.update(b, true);
  assert.equal(a.maxStdDev, 2.8); assert.equal(b.maxStdDev, Math.sqrt(5));
  profile.update(null, true);
  assert.equal(b.maxStdDev, 3); assert.equal(renderer.shadowMap.enabled, false); assert.equal(foveation, .5);
  profile.update(a, true); assert.equal(a.maxStdDev, Math.sqrt(5));
});
