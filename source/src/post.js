import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uWarm: { value: 1 }, uVignette: { value: 0.32 }, uBlur: { value: 0 }, uDark: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform float uWarm; uniform float uVignette; uniform float uBlur; uniform float uDark; varying vec2 vUv;
    float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      if (uBlur > 0.0) { uv += vec2(sin(uv.y*18.0+uTime*2.0), cos(uv.x*14.0+uTime*1.7)) * 0.006 * uBlur; }
      vec4 c = texture2D(tDiffuse, uv);
      if (uBlur > 0.0) {
        vec4 acc = c;
        for (int i = 1; i <= 4; i++) { float o = float(i) * 0.004 * uBlur; acc += texture2D(tDiffuse, uv + vec2(o, 0.0)); acc += texture2D(tDiffuse, uv - vec2(0.0, o)); }
        c = acc / 9.0;
      }
      // warm autumn grade: lift shadows toward blue-violet, push mids/highs toward amber
      float l = dot(c.rgb, vec3(0.299,0.587,0.114));
      vec3 shadowTint = vec3(0.92, 0.95, 1.06);
      vec3 highTint = vec3(1.06, 1.0, 0.9);
      c.rgb *= mix(shadowTint, highTint, smoothstep(0.1, 0.8, l) * uWarm);
      c.rgb = mix(vec3(l), c.rgb, 1.08); // a little saturation
      // vignette
      vec2 d = vUv - 0.5; float v = 1.0 - dot(d, d) * uVignette * 2.6;
      c.rgb *= clamp(v, 0.0, 1.0);
      c.rgb *= 1.0 - uDark;
      // film grain
      c.rgb += (rand(vUv * 731.0 + uTime) - 0.5) * 0.022;
      gl_FragColor = c;
    }`,
};

export function makeComposer(renderer, scene, camera, quality) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const size = renderer.getSize(new THREE.Vector2());
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.28, 0.6, 0.86);
  if (quality !== 'low') composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  return { composer, bloom, grade };
}
