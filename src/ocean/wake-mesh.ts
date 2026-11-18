import { Constants } from "@babylonjs/core/Engines/constants";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Effect } from "@babylonjs/core/Materials/effect";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Scene } from "@babylonjs/core/scene";
import { foamPixels, type WakeTrail } from "./wake-trail.ts";
import { BowWaveMesh } from "./bow-wave-mesh.ts";

/**
 * Draws a boat's wake: the strips from wake-trail.ts as one small mesh on the sea, with a
 * foam texture and a shader that cuts the foam away where the strip is faint, so it
 * breaks into soft patches as it dies. One shared material; one mesh per boat that moves.
 * The vertex colour carries the strip's across coordinate (red) and its opacity (alpha).
 */
Effect.ShadersStore["wakeFoamVertexShader"] = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
attribute vec4 color;
uniform mat4 worldViewProjection;
varying vec2 vUV;
varying float vAlpha;
varying float vAcross;
varying vec3 vWorld;
void main() {
  vUV = uv;
  vAlpha = color.a;
  vAcross = color.r;
  vWorld = position;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;

Effect.ShadersStore["wakeFoamFragmentShader"] = `
precision highp float;
varying vec2 vUV;
varying float vAlpha;
varying float vAcross;
varying vec3 vWorld;
uniform sampler2D foam;
uniform vec3 cameraPosition;
void main() {
  float across = abs(vAcross * 2.0 - 1.0);
  // Two taps of the same texture at different sizes, turned against each other, so no lattice or
  // tile shows; the second also bends the first a little.
  float f1 = texture2D(foam, vUV).r;
  vec2 turned = vec2(0.8 * vUV.x - 0.6 * vUV.y, 0.6 * vUV.x + 0.8 * vUV.y);
  float f2 = texture2D(foam, turned * 0.53 + 0.31 + (f1 - 0.5) * 0.12).r;
  float f = mix(f1, f2, 0.45);
  // The strip's sides are ragged and soft: the foam thins out toward them, unevenly.
  float profile = 1.0 - smoothstep(0.35, 1.0, across + (f2 - 0.5) * 0.4);
  // The density of the foam here; the fainter the strip, the more of it is cut away (soft
  // patches, then nothing). The cut is wide, so patches have soft edges, not outlines.
  float density = vAlpha * profile;
  float coverage = smoothstep(0.35, 0.75, f + (density - 0.55) * 1.3) * smoothstep(0.0, 0.2, density);
  float a = coverage * 0.94;
  float dist = length(cameraPosition - vWorld);
  a *= 1.0 - smoothstep(90.0, 260.0, dist);
  // Thin foam shows the water through it; thick foam is white.
  vec3 color = mix(vec3(0.72, 0.86, 0.93), vec3(0.95, 0.985, 1.0), smoothstep(0.3, 1.0, f + density * 0.35));
  gl_FragColor = vec4(color, a);
}`;

const materials = new WeakMap<Scene, ShaderMaterial>();
function material(scene: Scene) {
  let found = materials.get(scene);
  if (!found) {
    const pixels = foamPixels(128, 7);
    const texture = new RawTexture(
      pixels,
      128,
      128,
      Constants.TEXTUREFORMAT_LUMINANCE,
      scene,
      true,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
    );
    texture.wrapU = Texture.WRAP_ADDRESSMODE;
    texture.wrapV = Texture.WRAP_ADDRESSMODE;
    // Seen at a slant (the chase camera), the streaks would shimmer without it.
    texture.anisotropicFilteringLevel = 4;
    found = new ShaderMaterial(
      "wake-foam",
      scene,
      { vertex: "wakeFoam", fragment: "wakeFoam" },
      {
        attributes: ["position", "uv", "color"],
        uniforms: ["worldViewProjection", "cameraPosition"],
        samplers: ["foam"],
      },
    );
    found.setTexture("foam", texture);
    found.alphaMode = Constants.ALPHA_COMBINE;
    found.needAlphaBlending = () => true;
    found.backFaceCulling = false;
    found.disableDepthWrite = true;
    materials.set(scene, found);
  }
  return found;
}

/**
 * What is drawn at a moving boat's bow (the crest and the spray, bow-wave-mesh.ts). The white
 * water behind the boat is not a mesh any more: it is the water simulation (ripple-sim.ts) that the
 * sea's shader reads. The material below is still the wake foam's: the bow crest shares it.
 */
export class WakeMesh {
  private readonly bow: BowWaveMesh;

  constructor(scene: Scene) {
    this.bow = new BowWaveMesh(scene, material(scene));
    this.bow.warm();
  }

  /**
   * Draws the bow wave at the boat's current position `at` (the trail's newest point when it is
   * not given; the trail only records every few hundredths of a second, so the game passes the
   * live position and the crest does not stutter against the hull).
   */
  update(trail: WakeTrail, now: number, at?: { x: number; z: number }) {
    const newest = trail.samples[trail.samples.length - 1];
    if (newest)
      this.bow.update(
        at?.x ?? newest.x,
        at?.z ?? newest.z,
        newest.heading,
        newest.speed,
        now,
      );
  }

  dispose() {
    this.bow.dispose();
  }
}
