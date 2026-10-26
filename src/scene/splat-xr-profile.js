// This is a browser-specific GPU workaround, not a WebXR capability test.
// MSAA is fixed when the context is created, before an immersive session exists.
export function rendererAntialias(userAgent = "", emulateQuest = false) {
  return !emulateQuest && !/OculusBrowser|\bQuest(?:\s|\/|\))/i.test(userAgent);
}

// Quest reports hangs with Spark + MSAA + a per-frame shadow depth pass:
// https://github.com/sparkjsdev/spark/issues/400
// Keep source splats/SH3 and the XR framebuffer resolution unchanged.
export class SplatXRProfile {
  constructor(renderer) {
    this.renderer = renderer;
    this.saved = null;
    this.spark = null;
  }
  update(spark, immersive) {
    const { renderer } = this;
    const active = !!spark && immersive;
    if (active && !this.saved) {
      this.saved = {
        shadows: renderer.shadowMap.enabled,
        foveation: renderer.xr.getFoveation(),
      };
      // Avoid the extra depth pass and render-target switches entirely.
      renderer.shadowMap.enabled = false;
      renderer.xr.setFoveation(0.35);
    }
    if (this.spark !== (active ? spark : null)) {
      if (this.spark) {
        this.spark.maxStdDev = this.stdDev;
        this.spark.premultipliedAlpha = this.premultipliedAlpha;
      }
      this.spark = active ? spark : null;
      if (this.spark) {
        this.stdDev = spark.maxStdDev;
        this.premultipliedAlpha = spark.premultipliedAlpha;
        // Avoid low-opacity RGB premultiplication before framebuffer blending.
        // Spark's documented posterization workaround; this is the material
        // blend mode, not the canvas/XR compositor alpha convention.
        // https://github.com/sparkjsdev/spark/issues/36#issuecomment-3444040846
        spark.premultipliedAlpha = false;
        // Spark's recommended VR footprint: less transparent overdraw,
        // with all splats and the same SH/color data still present.
        spark.maxStdDev = Math.sqrt(5);
      }
    }
    if (!active && this.saved) {
      renderer.shadowMap.enabled = this.saved.shadows;
      renderer.shadowMap.needsUpdate = this.saved.shadows;
      renderer.xr.setFoveation(this.saved.foveation ?? 1);
      this.saved = null;
    }
  }
}
