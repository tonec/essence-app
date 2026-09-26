import type { Shader as ShaderType } from "pixi.js";

// Unit quad in local space: positions span -1..1 so the mesh's scale is its
// half-size in pixels; UVs span 0..1.
export const SUN_QUAD_POSITIONS = new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]);
export const SUN_QUAD_UVS = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
export const SUN_QUAD_INDICES = new Uint32Array([0, 1, 2, 0, 2, 3]);

const vertex = /* glsl */ `
  in vec2 aPosition;
  in vec2 aUV;
  out vec2 vUV;

  uniform mat3 uProjectionMatrix;
  uniform mat3 uWorldTransformMatrix;
  uniform mat3 uTransformMatrix;

  void main() {
    mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
    gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
    vUV = aUV;
  }
`;

// Procedural star close-up: granulated surface with limb darkening inside the
// disc, and a pulsing corona with slowly rotating rays outside it. All
// distances are in quad half-size units, so `uCoreFrac` is the disc radius.
const fragment = /* glsl */ `
  in vec2 vUV;
  out vec4 finalColor;

  uniform float uTime;
  uniform vec3 uColor;
  uniform float uFade;
  uniform float uCoreFrac;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = p * 2.03 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 p = vUV * 2.0 - 1.0;
    float d = length(p);
    float pulse = 1.0 + 0.08 * sin(uTime * 1.3);
    vec3 hot = mix(uColor, vec3(1.0), 0.45);

    // Surface: spherical-ish warp so granules bunch toward the limb.
    float rel = d / uCoreFrac;
    float mu = sqrt(max(0.0, 1.0 - rel * rel));
    vec2 sp = p / uCoreFrac / (0.6 + 0.4 * mu);
    vec2 warp = vec2(fbm(sp * 3.0 + uTime * 0.05), fbm(sp * 3.0 - uTime * 0.04));
    float gran = fbm(sp * 5.0 + warp * 1.5 + uTime * 0.08);
    float limb = 0.35 + 0.65 * pow(mu, 0.5);
    vec3 surface = mix(uColor * 0.8, hot * 1.15, smoothstep(0.25, 0.8, gran)) * limb;
    float discMask = 1.0 - smoothstep(uCoreFrac * 0.97, uCoreFrac, d);

    // Corona: exponential falloff modulated by angular noise rays.
    float ang = atan(p.y, p.x) + uTime * 0.04;
    vec2 ring = vec2(cos(ang), sin(ang));
    float rays = fbm(ring * 3.0 + vec2(0.0, uTime * 0.12));
    rays = pow(rays, 2.0) * 2.2;
    float t = max(0.0, d - uCoreFrac) / (1.0 - uCoreFrac);
    float corona = exp(-t * 5.0) * (0.35 + rays * 0.8) * pulse;
    corona += exp(-t * 18.0) * 0.5; // tight inner halo hugging the limb
    corona *= 1.0 - smoothstep(0.85, 1.0, d);
    vec3 coronaCol = mix(uColor, hot, 0.3) * corona;

    vec3 col = mix(coronaCol, surface, discMask);
    float alpha = clamp(max(discMask, corona), 0.0, 1.0) * uFade;
    finalColor = vec4(col * uFade, alpha);
  }
`;

export type SunUniforms = {
  uTime: number;
  uColor: Float32Array;
  uFade: number;
  uCoreFrac: number;
};

export function createSunShader(
  Shader: typeof ShaderType,
  coreFrac: number
): { shader: ShaderType; uniforms: SunUniforms } {
  const shader = Shader.from({
    gl: { vertex, fragment, name: "focus-sun" },
    resources: {
      sunUniforms: {
        uTime: { value: 0, type: "f32" },
        uColor: { value: new Float32Array([1, 1, 1]), type: "vec3<f32>" },
        uFade: { value: 0, type: "f32" },
        uCoreFrac: { value: coreFrac, type: "f32" },
      },
    },
  });
  const uniforms = shader.resources.sunUniforms.uniforms as SunUniforms;
  return { shader, uniforms };
}
