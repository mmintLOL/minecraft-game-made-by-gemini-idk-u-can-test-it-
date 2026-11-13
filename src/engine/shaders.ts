import * as THREE from 'three';
import { BlockAtlasTextures } from './textures';

export type ShaderPresetId = 'complementary' | 'seus' | 'arcane' | 'vanillaplus';

export interface ShaderSettings {
  preset: ShaderPresetId;
  timeOfDay: number; // 0..1 (0.25 = sunrise, 0.5 = noon, 0.75 = sunset, 0.0/1.0 = midnight)
  autoTimeCycle: boolean;
  godRays: number; // 0..1.5
  bloomStrength: number; // 0..1.5
  waterQuality: number; // 0..1.5 (wave + caustic + reflection intensity)
  weather: 'clear' | 'rain';
  fogDensity: number; // 0.002..0.025
}

export interface ShaderPresetConfig {
  id: ShaderPresetId;
  label: string;
  defaultTime: number;
  sunWarmth: string;
  skyZenithDay: string;
  skyHorizonDay: string;
  waterShallow: string;
  waterDeep: string;
  bloomStrength: number;
  bloomThreshold: number;
  godRays: number;
  auroraStrength: number;
  saturation: number;
  contrast: number;
  exposure: number;
}

export const SHADER_PRESETS: Record<ShaderPresetId, ShaderPresetConfig> = {
  complementary: {
    id: 'complementary',
    label: 'Complementary',
    defaultTime: 0.34,
    sunWarmth: '#ffedd0',
    skyZenithDay: '#184fb8',
    skyHorizonDay: '#8ac6f5',
    waterShallow: '#22b3bf',
    waterDeep: '#083b59',
    bloomStrength: 0.52,
    bloomThreshold: 0.82,
    godRays: 0.82,
    auroraStrength: 0.4,
    saturation: 1.14,
    contrast: 1.09,
    exposure: 0.96,
  },
  seus: {
    id: 'seus',
    label: 'SEUS Golden',
    defaultTime: 0.73,
    sunWarmth: '#ff9440',
    skyZenithDay: '#1a3266',
    skyHorizonDay: '#eb965c',
    waterShallow: '#218796',
    waterDeep: '#09223b',
    bloomStrength: 0.65,
    bloomThreshold: 0.76,
    godRays: 1.18,
    auroraStrength: 0.15,
    saturation: 1.18,
    contrast: 1.14,
    exposure: 0.98,
  },
  arcane: {
    id: 'arcane',
    label: 'Arcane Night',
    defaultTime: 0.04,
    sunWarmth: '#7ebeff',
    skyZenithDay: '#050917',
    skyHorizonDay: '#102442',
    waterShallow: '#1692a6',
    waterDeep: '#051529',
    bloomStrength: 0.86,
    bloomThreshold: 0.68,
    godRays: 0.55,
    auroraStrength: 1.0,
    saturation: 1.2,
    contrast: 1.12,
    exposure: 1.04,
  },
  vanillaplus: {
    id: 'vanillaplus',
    label: 'Vanilla+',
    defaultTime: 0.44,
    sunWarmth: '#fff8ee',
    skyZenithDay: '#3b7be3',
    skyHorizonDay: '#a9d5fa',
    waterShallow: '#2875d4',
    waterDeep: '#123675',
    bloomStrength: 0.24,
    bloomThreshold: 0.92,
    godRays: 0.28,
    auroraStrength: 0.0,
    saturation: 1.04,
    contrast: 1.03,
    exposure: 0.94,
  },
};

export function createSkyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.4, 0.7, -0.5).normalize() },
      uSunColor: { value: new THREE.Color('#ffedd0') },
      uSkyZenith: { value: new THREE.Color('#184fb8') },
      uSkyHorizon: { value: new THREE.Color('#8ac6f5') },
      uNightFactor: { value: 0 },
      uRainFactor: { value: 0 },
      uAuroraStrength: { value: 0.4 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldDir;
      void main() {
        vWorldDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uSkyZenith;
      uniform vec3 uSkyHorizon;
      uniform float uNightFactor;
      uniform float uRainFactor;
      uniform float uAuroraStrength;

      varying vec3 vWorldDir;

      float hash21(vec2 p) {
        p = fract(p * vec2(234.34, 435.345));
        p += dot(p, p + 34.23);
        return fract(p.x * p.y);
      }

      float noise2(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise2(p);
          p *= 2.04;
          a *= 0.5;
        }
        return v;
      }

      // Henyey-Greenstein Mie phase function
      float hgPhase(float cosTheta, float g) {
        float g2 = g * g;
        return (1.0 - g2) / (4.0 * 3.14159265 * pow(max(1.0 + g2 - 2.0 * g * cosTheta, 0.001), 1.5));
      }

      void main() {
        vec3 dir = normalize(vWorldDir);
        vec3 sunD = normalize(uSunDir);
        float cosTheta = dot(dir, sunD);

        // Optical airmass scattering curve (Rayleigh + Horizon haze)
        float zenithMu = max(dir.y, 0.0);
        float airmass = 1.0 / (zenithMu + 0.14);
        float rayleighMix = 1.0 - exp(-airmass * 0.28);
        float rayleighPhase = 0.75 * (1.0 + cosTheta * cosTheta);

        vec3 sky = mix(uSkyZenith, uSkyHorizon, clamp(rayleighMix, 0.0, 1.0));
        sky *= mix(0.86, 1.06, rayleighPhase * 0.5);

        // Physically-inspired Mie solar aureole & twilight belt
        float mie = hgPhase(cosTheta, 0.76) * 0.55 + hgPhase(cosTheta, 0.92) * 0.35;
        float horizonScatter = pow(1.0 - zenithMu, 3.0) * max(cosTheta * 0.5 + 0.5, 0.0);
        sky += uSunColor * (mie * 0.55 + horizonScatter * 0.22) * (1.0 - uRainFactor * 0.75) * (1.0 - uNightFactor * 0.75);

        // Stylized Minecraft Voxel Sun Disc + Corona
        vec3 sunUp = abs(sunD.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
        vec3 sunRight = normalize(cross(sunUp, sunD));
        vec3 sunBitangent = cross(sunD, sunRight);
        if (cosTheta > 0.0) {
          float sx = abs(dot(dir, sunRight));
          float sy = abs(dot(dir, sunBitangent));
          float boxDist = max(sx, sy);
          float sunDisc = 1.0 - smoothstep(0.042, 0.049, boxDist);
          sky += uSunColor * sunDisc * 2.2 * (1.0 - uRainFactor * 0.85) * (1.0 - uNightFactor * 0.85);
        }

        // Stylized Voxel Moon opposite sun
        vec3 moonDir = -sunD;
        if (dot(dir, moonDir) > 0.0 && uNightFactor > 0.05) {
          vec3 moonRight = normalize(cross(vec3(0.0, 1.0, 0.0), moonDir));
          vec3 moonUp = cross(moonDir, moonRight);
          float mx = abs(dot(dir, moonRight));
          float my = abs(dot(dir, moonUp));
          float mBox = max(mx, my);
          float moonDisc = 1.0 - smoothstep(0.034, 0.039, mBox);
          sky += vec3(0.7, 0.85, 1.0) * moonDisc * 1.25 * uNightFactor * (1.0 - uRainFactor * 0.8);
        }

        // Starfield + Aurora Borealis at night
        if (uNightFactor > 0.02 && dir.y > 0.0) {
          vec2 starUv = dir.xz / (dir.y + 0.35) * 44.0;
          vec2 starCell = floor(starUv);
          float starRnd = hash21(starCell);
          if (starRnd > 0.985) {
            vec2 cellPos = fract(starUv) - 0.5;
            float d = length(cellPos);
            float twinkle = 0.65 + 0.35 * sin(uTime * 2.6 + starRnd * 80.0);
            float star = smoothstep(0.24, 0.02, d) * twinkle;
            sky += vec3(0.82, 0.92, 1.0) * star * uNightFactor * (1.0 - uRainFactor);
          }

          if (uAuroraStrength > 0.01) {
            vec2 aUv = dir.xz / (dir.y + 0.45);
            float wave = sin(aUv.x * 2.4 + uTime * 0.25 + fbm(aUv * 1.5) * 3.0);
            float curtain = smoothstep(0.15, 0.85, wave * 0.5 + 0.5) * smoothstep(0.05, 0.45, dir.y) * smoothstep(0.95, 0.25, dir.y);
            float streaks = fbm(vec2(aUv.x * 4.5 + uTime * 0.08, aUv.y * 1.8));
            vec3 auroraCol = mix(vec3(0.1, 0.95, 0.68), vec3(0.25, 0.55, 1.0), streaks);
            sky += auroraCol * curtain * streaks * uAuroraStrength * uNightFactor * 0.68 * (1.0 - uRainFactor * 0.8);
          }
        }

        // Animated Volumetric-style Layered Cloud Deck
        if (dir.y > 0.03) {
          vec2 cloudUv = dir.xz / (dir.y + 0.16) * 0.42 + vec2(uTime * 0.008, uTime * 0.004);
          float n1 = fbm(cloudUv * 2.2);
          float n2 = fbm(cloudUv * 4.8 - vec2(uTime * 0.012, 0.0));
          float density = smoothstep(0.47 - uRainFactor * 0.18, 0.78, n1 * 0.7 + n2 * 0.35);
          float fadeHorizon = smoothstep(0.03, 0.22, dir.y);

          float cloudLit = smoothstep(0.2, 0.85, n1 - n2 * 0.25 + 0.25);
          vec3 cloudBright = mix(vec3(0.88, 0.92, 0.98), uSunColor, 0.45) * (1.0 - uNightFactor * 0.76);
          vec3 cloudShadow = mix(uSkyZenith * 0.65, vec3(0.14, 0.19, 0.3), 0.6 + uRainFactor * 0.3);
          vec3 cloudCol = mix(cloudShadow, cloudBright, cloudLit * (1.0 - uRainFactor * 0.65));
          cloudCol += uSunColor * pow(max(cosTheta, 0.0), 12.0) * 0.42 * (1.0 - uNightFactor * 0.82);

          sky = mix(sky, cloudCol, density * fadeHorizon * (0.78 + uRainFactor * 0.18));
        }

        if (dir.y < 0.0) {
          sky = mix(sky, uSkyHorizon * 0.38, smoothstep(0.0, -0.25, dir.y));
        }

        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  });
}

export interface TerrainUniforms {
  uTime: { value: number };
  uWetness: { value: number };
  uEmissiveBoost: { value: number };
  uSunDir: { value: THREE.Vector3 };
  uSunColor: { value: THREE.Color };
  uSkyHorizon: { value: THREE.Color };
}

export function createTerrainMaterial(
  atlas: BlockAtlasTextures,
  uniforms: TerrainUniforms
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    map: atlas.albedo,
    normalMap: atlas.normal,
    normalScale: new THREE.Vector2(0.95, 0.95),
    roughnessMap: atlas.roughness,
    metalnessMap: atlas.metalness,
    roughness: 1.0,
    metalness: 1.0,
    envMapIntensity: 0.6,
    emissive: new THREE.Color('#ffffff'),
    emissiveMap: atlas.emissive,
    emissiveIntensity: 1.85,
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWetness = uniforms.uWetness;
    shader.uniforms.uEmissiveBoost = uniforms.uEmissiveBoost;
    shader.uniforms.uSunDir = uniforms.uSunDir;
    shader.uniforms.uSunColor = uniforms.uSunColor;
    shader.uniforms.uSkyHorizon = uniforms.uSkyHorizon;

    shader.vertexShader =
      /* glsl */ `
      attribute float aAo;
      attribute float aFlags;
      uniform float uTime;
      varying float vAo;
      varying float vFlags;
      varying vec3 vWorldPos;
      varying vec3 vWorldNorm;
      ` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      /* glsl */ `
      #include <begin_vertex>
      vAo = aAo;
      vFlags = aFlags;

      // Wind sway for foliage blocks (aFlags ~= 1.0)
      if (aFlags > 0.5 && aFlags < 1.5) {
        float phase = position.x * 0.9 + position.z * 0.7 + position.y * 0.5;
        float gust = sin(uTime * 2.1 + phase) * 0.045 + cos(uTime * 3.7 + phase * 1.7) * 0.02;
        transformed.x += gust;
        transformed.z += gust * 0.65;
        transformed.y += sin(uTime * 2.8 + phase) * 0.015;
      }

      vec4 wp = modelMatrix * vec4(transformed, 1.0);
      vWorldPos = wp.xyz;
      vWorldNorm = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);
      `
    );

    shader.fragmentShader =
      /* glsl */ `
      uniform float uTime;
      uniform float uWetness;
      uniform float uEmissiveBoost;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uSkyHorizon;
      varying float vAo;
      varying float vFlags;
      varying vec3 vWorldPos;
      varying vec3 vWorldNorm;

      float terrainHash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float terrainNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(terrainHash(i), terrainHash(i + vec2(1.0, 0.0)), u.x),
          mix(terrainHash(i + vec2(0.0, 1.0)), terrainHash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }
      ` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      /* glsl */ `
      #include <color_fragment>
      // Deep Per-vertex Voxel Ambient Occlusion for crisp crevice contrast
      float aoShade = mix(0.22, 1.0, clamp(vAo, 0.0, 1.0));
      diffuseColor.rgb *= aoShade;

      // Rain wetness darkening + puddle mask on upward faces
      if (uWetness > 0.01 && vWorldNorm.y > 0.75) {
        float pn = terrainNoise(vWorldPos.xz * 0.35);
        float puddleMask = smoothstep(0.45, 0.72, pn) * uWetness;
        diffuseColor.rgb *= mix(1.0, 0.64, puddleMask * 0.78 + uWetness * 0.18);
      }
      `
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      /* glsl */ `
      #include <roughnessmap_fragment>
      if (uWetness > 0.01 && vWorldNorm.y > 0.75) {
        float pnR = terrainNoise(vWorldPos.xz * 0.35);
        float pMask = smoothstep(0.45, 0.72, pnR) * uWetness;
        roughnessFactor = mix(roughnessFactor, 0.05, pMask * 0.94);
        roughnessFactor = mix(roughnessFactor, min(roughnessFactor, 0.35), uWetness * 0.45);
      }
      `
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      /* glsl */ `
      #include <emissivemap_fragment>
      if (vFlags > 1.5) {
        float pulse = 0.75 + 0.35 * sin(uTime * 2.6 + vWorldPos.x * 0.6 + vWorldPos.z * 0.6);
        totalEmissiveRadiance *= pulse * uEmissiveBoost;
      } else {
        totalEmissiveRadiance *= uEmissiveBoost;
      }

      // Foliage Subsurface Scattering (warm emerald translucency when backlit by sun)
      if (vFlags > 0.5 && vFlags < 1.5) {
        vec3 vDir = normalize(cameraPosition - vWorldPos);
        float backLight = pow(max(dot(vDir, -normalize(uSunDir)), 0.0), 3.0);
        float sunElev = clamp(uSunDir.y * 2.5 + 0.3, 0.0, 1.0);
        totalEmissiveRadiance += diffuseColor.rgb * uSunColor * backLight * 0.42 * sunElev;
      }
      `
    );

    // Sun-inscattered aerial perspective tinting distant fog
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <fog_fragment>',
      /* glsl */ `
      #ifdef USE_FOG
        vec3 viewToWorld = normalize(vWorldPos - cameraPosition);
        float sunAlign = max(dot(viewToWorld, normalize(uSunDir)), 0.0);
        vec3 aerialFog = mix(fogColor, uSunColor * 0.85 + uSkyHorizon * 0.15, pow(sunAlign, 4.0) * 0.38);
        float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, aerialFog, clamp(fogFactor, 0.0, 1.0));
      #endif
      `
    );
  };

  return mat;
}

export function createGlassMaterial(atlas: BlockAtlasTextures): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    map: atlas.albedo,
    normalMap: atlas.normal,
    roughness: 0.08,
    metalness: 0.1,
    transparent: true,
    opacity: 0.56,
    reflectivity: 0.95,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    depthWrite: false,
  });
}

export function createWaterMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.4, 0.7, -0.5).normalize() },
      uSunColor: { value: new THREE.Color('#ffedd0') },
      uSkyZenith: { value: new THREE.Color('#184fb8') },
      uSkyHorizon: { value: new THREE.Color('#8ac6f5') },
      uWaterShallow: { value: new THREE.Color('#22b3bf') },
      uWaterDeep: { value: new THREE.Color('#083b59') },
      uFogColor: { value: new THREE.Color('#8ac6f5') },
      uFogDensity: { value: 0.0085 },
      uWaterQuality: { value: 1.0 },
      uNightFactor: { value: 0.0 },
    },
    vertexShader: /* glsl */ `
      attribute float aFlags;
      uniform float uTime;
      uniform float uWaterQuality;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vIsTop;
      varying float vWave;

      void main() {
        vec3 pos = position;
        vIsTop = aFlags;
        float wave = 0.0;
        if (aFlags > 0.5) {
          wave = sin(pos.x * 1.35 + uTime * 2.1) * 0.032
               + cos(pos.z * 1.65 - uTime * 1.7) * 0.028
               + sin((pos.x + pos.z) * 2.4 + uTime * 2.9) * 0.014;
          pos.y += wave * clamp(uWaterQuality, 0.3, 1.5);
        }
        vWave = wave;
        vec4 wp = modelMatrix * vec4(pos, 1.0);
        vWorldPos = wp.xyz;
        vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uSkyZenith;
      uniform vec3 uSkyHorizon;
      uniform vec3 uWaterShallow;
      uniform vec3 uWaterDeep;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      uniform float uWaterQuality;
      uniform float uNightFactor;

      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vIsTop;
      varying float vWave;

      float hash2(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x),
          mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbmWater(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 3; i++) {
          v += a * vnoise(p);
          p *= 2.05;
          a *= 0.5;
        }
        return v;
      }

      float causticPattern(vec2 uv, float t) {
        vec2 p1 = uv * 1.7 + vec2(t * 0.35, -t * 0.25);
        vec2 p2 = uv * 2.3 - vec2(t * 0.28, t * 0.42);
        float c1 = abs(sin(p1.x + sin(p1.y * 1.4)) * cos(p1.y + cos(p1.x * 1.3)));
        float c2 = abs(sin(p2.x - cos(p2.y * 1.2)) * cos(p2.y + sin(p2.x * 1.5)));
        return pow(clamp(1.0 - min(c1, c2) * 1.5, 0.0, 1.0), 3.0);
      }

      void main() {
        vec3 viewVec = cameraPosition - vWorldPos;
        float dist = length(viewVec);
        vec3 viewDir = viewVec / max(dist, 0.0001);

        // Multi-octave procedural ripple normals
        vec2 wp = vWorldPos.xz;
        float eps = 0.08;
        float t = uTime * 1.15;
        float h0 = vnoise(wp * 1.4 + vec2(t * 0.4, t * 0.25)) + 0.5 * vnoise(wp * 3.1 - vec2(t * 0.55, -t * 0.35));
        float hx = vnoise((wp + vec2(eps, 0.0)) * 1.4 + vec2(t * 0.4, t * 0.25)) + 0.5 * vnoise((wp + vec2(eps, 0.0)) * 3.1 - vec2(t * 0.55, -t * 0.35));
        float hz = vnoise((wp + vec2(0.0, eps)) * 1.4 + vec2(t * 0.4, t * 0.25)) + 0.5 * vnoise((wp + vec2(0.0, eps)) * 3.1 - vec2(t * 0.55, -t * 0.35));

        float rippleAmp = 0.26 * clamp(uWaterQuality, 0.2, 1.5);
        vec3 N = normalize(vNormal + vec3((h0 - hx) / eps * rippleAmp, 0.0, (h0 - hz) / eps * rippleAmp));
        if (vIsTop < 0.5) {
          float flow = vnoise(vec2(vWorldPos.x * 2.5 + vWorldPos.z * 2.5, vWorldPos.y * 2.2 + uTime * 3.6));
          N = normalize(vNormal + vec3(0.0, (flow - 0.5) * 0.25, 0.0));
        }

        // Schlick Fresnel reflection
        float fresnel = pow(1.0 - max(dot(viewDir, N), 0.0), 4.2);
        fresnel = clamp(0.06 + fresnel * 0.9, 0.06, 0.96);

        // Reflected Sky + Cloud Deck + Sun Corona Reflection
        vec3 sunD = normalize(uSunDir);
        vec3 reflDir = reflect(-viewDir, N);
        float reflH = clamp(reflDir.y, 0.0, 1.0);
        vec3 skyRefl = mix(uSkyHorizon, uSkyZenith, pow(reflH, 0.62));
        float reflSun = max(dot(reflDir, sunD), 0.0);
        skyRefl += uSunColor * pow(reflSun, 18.0) * 0.45 * (1.0 - uNightFactor * 0.75);

        if (reflDir.y > 0.04) {
          vec2 cUv = reflDir.xz / (reflDir.y + 0.16) * 0.42 + vec2(uTime * 0.008, uTime * 0.004);
          float cd = smoothstep(0.48, 0.78, fbmWater(cUv * 2.2));
          vec3 cloudReflCol = mix(uSkyZenith * 0.7, mix(vec3(0.9, 0.94, 1.0), uSunColor, 0.35), 0.7) * (1.0 - uNightFactor * 0.7);
          skyRefl = mix(skyRefl, cloudReflCol, cd * smoothstep(0.04, 0.2, reflDir.y) * 0.65);
        }

        // Chromatic-dispersion underwater caustics
        float q = clamp(uWaterQuality, 0.0, 1.4);
        float cR = causticPattern(vWorldPos.xz * 0.9 + vec2(0.04, 0.0), uTime) * q;
        float cG = causticPattern(vWorldPos.xz * 0.9, uTime) * q;
        float cB = causticPattern(vWorldPos.xz * 0.9 - vec2(0.04, 0.03), uTime) * q;
        vec3 causticRGB = vec3(cR * 0.25, cG * 0.85, cB * 0.98);

        vec3 waterCol = mix(uWaterDeep, uWaterShallow, 0.42 + vWave * 4.0);
        waterCol += causticRGB * 0.45 * (1.0 - uNightFactor * 0.68);

        // Crisp sun specular sparkle path
        vec3 halfV = normalize(sunD + viewDir);
        float specSharp = pow(max(dot(N, halfV), 0.0), 260.0);
        float specBroad = pow(max(dot(N, halfV), 0.0), 32.0) * 0.16;
        vec3 specCol = uSunColor * (specSharp * 2.4 + specBroad) * (1.0 - uNightFactor * 0.72);

        // Waterfall & wave crest foam
        float foam = 0.0;
        if (vIsTop < 0.5) {
          foam = smoothstep(0.62, 0.9, vnoise(vec2(vWorldPos.x * 3.0 + vWorldPos.z * 3.0, vWorldPos.y * 2.0 + uTime * 4.5))) * 0.42;
        } else {
          foam = smoothstep(0.045, 0.068, vWave) * 0.2;
        }

        vec3 col = mix(waterCol, skyRefl, fresnel) + specCol + vec3(0.82, 0.95, 1.0) * foam;

        // Sun-inscattered exponential fog
        float sunAlign = max(dot(-viewDir, sunD), 0.0);
        vec3 aerialFog = mix(uFogColor, uSunColor * 0.85 + uSkyHorizon * 0.15, pow(sunAlign, 4.0) * 0.35);
        float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
        col = mix(col, aerialFog, clamp(fogFactor, 0.0, 1.0));

        float alpha = mix(0.68, 0.94, fresnel) + foam * 0.25;
        gl_FragColor = vec4(col, clamp(alpha, 0.62, 0.96));
      }
    `,
  });
}

export const VolumetricPostShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uSunScreenPos: { value: new THREE.Vector2(0.5, 0.7) },
    uSunOnScreen: { value: 1.0 },
    uGodRayStrength: { value: 0.82 },
    uSunColor: { value: new THREE.Color('#ffedd0') },
    uUnderwater: { value: 0.0 },
    uSaturation: { value: 1.14 },
    uContrast: { value: 1.08 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uSunScreenPos;
    uniform float uSunOnScreen;
    uniform float uGodRayStrength;
    uniform vec3 uSunColor;
    uniform float uUnderwater;
    uniform float uSaturation;
    uniform float uContrast;

    varying vec2 vUv;

    void main() {
      vec2 uv = vUv;

      // Underwater refraction wave
      if (uUnderwater > 0.5) {
        uv.x += sin(uv.y * 22.0 + uTime * 3.5) * 0.0045;
        uv.y += cos(uv.x * 18.0 + uTime * 2.8) * 0.0035;
      }

      // Subtle edge chromatic aberration
      vec2 centerDir = uv - 0.5;
      float radialDist = length(centerDir);
      float ca = radialDist * 0.0022;
      float r = texture2D(tDiffuse, uv - centerDir * ca).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv + centerDir * ca).b;
      vec3 col = vec3(r, g, b);

      // Screen-space Volumetric Sun Shafts (God Rays)
      if (uSunOnScreen > 0.01 && uGodRayStrength > 0.01 && uUnderwater < 0.5) {
        vec2 delta = (uv - uSunScreenPos) * (0.92 / 16.0);
        vec2 sampleUv = uv;
        float illumDecay = 1.0;
        vec3 rays = vec3(0.0);
        for (int i = 0; i < 16; i++) {
          sampleUv -= delta;
          vec3 s = texture2D(tDiffuse, clamp(sampleUv, 0.001, 0.999)).rgb;
          float lum = dot(s, vec3(0.299, 0.587, 0.114));
          float mask = smoothstep(0.68, 1.05, lum);
          rays += s * mask * illumDecay;
          illumDecay *= 0.89;
        }
        float sunDistFade = clamp(1.3 - length(uv - uSunScreenPos), 0.0, 1.0);
        col += (rays / 16.0) * uSunColor * uGodRayStrength * uSunOnScreen * sunDistFade * 0.65;
      }

      // Underwater caustic tint & depth absorption
      if (uUnderwater > 0.5) {
        float cRibbon = sin(uv.x * 18.0 + uTime * 2.2) * cos(uv.y * 14.0 - uTime * 1.8);
        col = mix(col, vec3(0.03, 0.3, 0.42), 0.38);
        col += vec3(0.08, 0.28, 0.32) * max(0.0, cRibbon) * 0.35;
      }

      // Color grading (saturation + contrast)
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, uSaturation);
      col = (col - 0.5) * uContrast + 0.5;

      // Subtle cinematic vignette
      float vig = smoothstep(0.95, 0.35, radialDist);
      col *= mix(0.8, 1.0, vig);

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};
