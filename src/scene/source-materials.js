import * as THREE from "three";

// These adaptations are deliberately scoped to versioned FORMAI assets. Arbitrary
// imported GLTFs keep their original materials and shader behavior.
const nativeMaps = {
  _BumpTex: "normalMap", _BumpMap: "normalMap", _OcclusionTex: "aoMap",
  _SpecTex: "specularColorMap", _velvetMask: "sheenColorMap",
};
const colorSlots = new Set(["_SpecTex", "_WetSpecTex", "_SSSColor", "_velvetMask"]);

export async function hydrateSourceMaterials(result) {
  const materials = new Set();
  result.scene.traverse((mesh) => {
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
      if (material?.userData.formaiMaterial?.version === 1) materials.add(material);
  });
  await Promise.all([...materials].map(async (material) => {
    const data = material.userData.formaiMaterial;
    const maps = {};
    for (const [slot, index] of Object.entries(data.maps)) {
      if (!Number.isInteger(index) || index < 0) throw new Error("Некорректная карта материала FORMAI.");
      const texture = nativeMaps[slot] && material[nativeMaps[slot]]
        ? material[nativeMaps[slot]] : await result.parser.getDependency("texture", index);
      texture.colorSpace = colorSlots.has(slot) || (data.kind === "detail" && slot === "_microTex1")
        ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.flipY = false;
      if (slot === "_BSSRDF") texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
      // Direct properties let disposeObject release all custom texture resources.
      material[`formaiMap${slot}`] = maps[slot] = texture;
    }
    configureSourceMaterial(material, maps);
  }));
}

export function configureSourceMaterial(material, maps) {
  const data = material.userData.formaiMaterial;
  if (data?.version !== 1) return;
  const { kind, floats: f = {}, colors: c = {} } = data;
  const number = (key, fallback) => Number.isFinite(f[key]) ? f[key] : fallback;
  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
  if (kind === "cornea") {
    // Original corneas use premultiplied-style additive reflections over zero
    // alpha. Do not enable premultipliedAlpha: that would erase those reflections.
    material.transparent = true;
    material.depthWrite = false;
    material.blending = THREE.CustomBlending;
    material.blendSrc = THREE.OneFactor;
    material.blendDst = THREE.OneMinusSrcAlphaFactor;
    material.blendEquation = THREE.AddEquation;
    material.premultipliedAlpha = false;
    material.ior = clamp(number("_IOR", 1.33), 1, 2.333);
    material.specularIntensity = clamp(number("_indSpecBoost", 1), 0, 1);
  }
  const uniforms = {
    fmMicroScale: { value: number("_microScaleAmount", 32) },
    fmMicroScaleGreen: { value: number("_microGreenScaleAmount", 32) },
    fmMicroAmount: { value: number("_microAmount", .3) },
    fmMicroAmountGreen: { value: number("_microGreenAmount", 1) },
    fmFadeDistance: { value: Math.max(.1, number("_fadeDistance", 1)) },
    fmCavity: { value: clamp(c._components?.[1] ?? .5, 0, 1) },
    // Source wetness painting lived in a runtime RenderTexture. A subtle global
    // blend retains the supplied dry/wet response without inventing a paint mask.
    fmWet: { value: clamp(number("_wetBlend", 0), 0, 1) * .25 },
    fmDryRoughness: { value: clamp(number("_Shininess", .8), .08, 1) },
    fmWetRoughness: { value: clamp(number("_Shininess2", .3), .04, 1) },
    fmScattering: { value: clamp(number("_skinScattering", 1), 0, 1) * .35 },
  };
  const names = {};
  for (const [slot, map] of Object.entries(maps)) {
    names[slot] = nativeMaps[slot] || `fm${slot}`;
    if (!nativeMaps[slot]) uniforms[names[slot]] = { value: map };
  }
  const sample = (slot, uv = "vMapUv") => names[slot] ? `texture2D(${names[slot]}, ${uv})` : "vec4(1.0)";
  const customDeclarations = Object.keys(maps).filter((slot) => !nativeMaps[slot])
    .map((slot) => `uniform sampler2D ${names[slot]};`).join("\n");
  material.customProgramCacheKey = () => `formai-pbr-v1:${kind}:${Object.keys(maps).sort().join(",")}`;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    let declarations = `${customDeclarations}
      uniform float fmMicroScale, fmMicroScaleGreen, fmMicroAmount, fmMicroAmountGreen;
      uniform float fmFadeDistance, fmCavity, fmWet, fmDryRoughness, fmWetRoughness, fmScattering;
    `;
    if (kind === "skin") declarations += `
      vec4 fmMicro(vec2 uv) {
        vec3 mask = ${sample("_MicroMixMap", "uv")}.rgb;
        float green = mask.g / max(dot(mask, vec3(1.0)), 0.001);
        vec4 a = ${sample("_microTex1", "uv * fmMicroScale")};
        vec4 b = ${sample("_microTex3", "uv * fmMicroScaleGreen")};
        a.xy = (a.xy * 2.0 - 1.0) * fmMicroAmount;
        b.xy = (b.xy * 2.0 - 1.0) * fmMicroAmountGreen;
        return mix(a, b, green);
      }
      float fmWetness(vec2 uv) { return fmWet ${maps._WetBlendTex ? `* ${sample("_WetBlendTex", "uv")}.r` : ""}; }
    `;
    // Insert after native map declarations but before the lighting functions.
    shader.fragmentShader = shader.fragmentShader.replace("#include <lights_physical_pars_fragment>", `${declarations}\n#include <lights_physical_pars_fragment>`);
    if (kind === "detail") {
      shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `
        #include <map_fragment>
        float fmFade = 1.0 - smoothstep(fmFadeDistance, fmFadeDistance * 3.0, length(vViewPosition));
        vec3 fmDetail = ${sample("_microTex1", "vMapUv * fmMicroScale")}.rgb;
        diffuseColor.rgb *= mix(vec3(1.0), clamp(fmDetail * 2.0, vec3(0.4), vec3(1.6)), clamp(fmMicroAmount, 0.0, 1.0) * fmFade);
      `);
    }
    if (kind === "cornea") {
      shader.fragmentShader = shader.fragmentShader.replace("#include <roughnessmap_fragment>", `
        float roughnessFactor = clamp(1.0 - ${sample("_SpecTex")}.a, 0.12, 1.0);
      `);
    }
    if (kind === "skin") {
      shader.fragmentShader = shader.fragmentShader.replace("#include <roughnessmap_fragment>", `
        float roughnessFactor = clamp(mix(${sample("_SpecTex")}.a * fmDryRoughness,
          ${sample("_WetSpecTex")}.a * fmWetRoughness, fmWetness(vMapUv)), 0.08, 1.0);
      `);
      shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_maps>",
        THREE.ShaderChunk.normal_fragment_maps.replace("mapN.xy *= normalScale;", `
          mapN.xy *= normalScale;
          vec4 fmMicroN = fmMicro(vMapUv);
          float fmMicroFade = 1.0 - smoothstep(fmFadeDistance, fmFadeDistance * 3.0, length(vViewPosition));
          mapN = normalize(vec3(mapN.xy + fmMicroN.xy * fmMicroFade * 0.35, mapN.z));
        `));
      shader.fragmentShader = shader.fragmentShader.replace("#include <lights_physical_fragment>",
        THREE.ShaderChunk.lights_physical_fragment.replace(
          "specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;",
          `specularColorFactor *= mix(${sample("_SpecTex")}.rgb, ${sample("_WetSpecTex")}.rgb, fmWetness(vMapUv));`,
        ));
      // The original diffusion lookup is indexed by lighting angle and local
      // curvature. Keep Three's GGX specular, shadowing and environment lighting.
      const lighting = THREE.ShaderChunk.lights_physical_pars_fragment.replace(
        "void RE_Direct_Physical(", "void FM_Original_Direct_Physical(",
      );
      shader.fragmentShader = shader.fragmentShader.replace("#include <lights_physical_pars_fragment>", `${lighting}
        void FM_Direct(const in IncidentLight light, const in vec3 position,
          const in vec3 normal, const in vec3 viewDir, const in vec3 coatNormal,
          const in PhysicalMaterial material, inout ReflectedLight reflected) {
          vec3 previousDiffuse = reflected.directDiffuse;
          FM_Original_Direct_Physical(light, position, normal, viewDir, coatNormal, material, reflected);
          float ndl = dot(normal, light.direction);
          float curvature = ${sample("_OcclusionTex")}.b;
          vec3 diffusion = clamp(${sample("_BSSRDF", "vec2(ndl * 0.5 + 0.5, clamp(curvature, 0.01, 0.99))")}.rgb, 0.0, 1.0);
          vec3 backscatter = ${sample("_SSSColor")}.rgb * max(-ndl, 0.0) * 0.1;
          vec3 softened = light.color * BRDF_Lambert(material.diffuseColor) * min(diffusion + backscatter, vec3(1.0));
          reflected.directDiffuse = previousDiffuse + mix(reflected.directDiffuse - previousDiffuse, softened, fmScattering);
        }
        #undef RE_Direct
        #define RE_Direct FM_Direct
      `);
      shader.fragmentShader = shader.fragmentShader.replace("#include <lights_fragment_end>", `
        #include <lights_fragment_end>
        float fmCavityFactor = mix(1.0, ${sample("_OcclusionTex")}.g, fmCavity);
        fmCavityFactor *= mix(1.0, fmMicro(vMapUv).a, 0.15 * fmMicroFade);
        reflectedLight.indirectDiffuse *= fmCavityFactor;
        reflectedLight.directDiffuse *= mix(1.0, fmCavityFactor, 0.3);
      `);
    }
  };
  material.needsUpdate = true;
}
