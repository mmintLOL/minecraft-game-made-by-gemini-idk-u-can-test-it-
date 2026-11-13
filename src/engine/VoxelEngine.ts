import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { voxelAudio } from './audio';
import { ATLAS_COLS, ATLAS_ROWS, BLOCK_DEFS, BlockType } from './blocks';
import { buildChunkGeometry } from './mesher';
import {
  SHADER_PRESETS,
  ShaderPresetId,
  ShaderSettings,
  TerrainUniforms,
  VolumetricPostShader,
  createGlassMaterial,
  createSkyMaterial,
  createTerrainMaterial,
  createWaterMaterial,
} from './shaders';
import { BlockAtlasTextures, createBlockTextureAtlas, renderBlockIconDataUrl } from './textures';
import {
  CHUNK_SIZE,
  RaycastHit,
  VoxelWorld,
  WATER_LEVEL,
  WORLD_CHUNKS_X,
  WORLD_CHUNKS_Z,
  WORLD_SIZE_X,
  WORLD_SIZE_Y,
  WORLD_SIZE_Z,
} from './world';

// Pre-allocated scratch math objects (zero GC in render loop)
const _sunDir = new THREE.Vector3();
const _sunWorld = new THREE.Vector3();
const _sunProj = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();
const _lookDir = new THREE.Vector3();
const _cZenithDay = new THREE.Color();
const _cHorizonDay = new THREE.Color();
const _cZenithNight = new THREE.Color('#040814');
const _cHorizonNight = new THREE.Color('#0e1c36');
const _cSunset = new THREE.Color('#ff7b3b');
const _cSunCol = new THREE.Color();
const _cFog = new THREE.Color();
const _cHemiSky = new THREE.Color();
const _cHemiGround = new THREE.Color();
const _mat4 = new THREE.Matrix4();
const _vec3 = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

interface ChunkMeshGroup {
  solid: THREE.Mesh | null;
  water: THREE.Mesh | null;
  glass: THREE.Mesh | null;
}

interface DebrisParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  rotVel: THREE.Vector3;
  scale: number;
  life: number;
  maxLife: number;
  color: THREE.Color;
}

export interface EngineSnapshot {
  x: number;
  y: number;
  z: number;
  flyMode: boolean;
  isLocked: boolean;
  targetBlockName: string | null;
  underwater: boolean;
  timeLabel: string;
}

export class VoxelEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private isSoftwareGl: boolean;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private volumetricPass: ShaderPass | null = null;

  public world: VoxelWorld;
  public atlas: BlockAtlasTextures;
  public blockIcons: Map<BlockType, string> = new Map();

  private chunkMeshes: Map<string, ChunkMeshGroup> = new Map();
  private skyMesh: THREE.Mesh;
  private skyMaterial: THREE.ShaderMaterial;
  private terrainUniforms: TerrainUniforms;
  private terrainMaterial: THREE.MeshStandardMaterial;
  private waterMaterial: THREE.ShaderMaterial;
  private glassMaterial: THREE.MeshPhysicalMaterial;

  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private torchLight: THREE.PointLight;
  private fog: THREE.FogExp2;

  private targetOutline: THREE.LineSegments;
  private currentTarget: RaycastHit | null = null;

  // Held viewmodel
  private viewmodelGroup: THREE.Group;
  private heldBlockMesh: THREE.Mesh;
  private heldBlockGeo: THREE.BoxGeometry;
  private heldBlockMat: THREE.MeshStandardMaterial;
  private swingProgress = 0;
  private walkBobTime = 0;
  private selectedBlock: BlockType = BlockType.Grass;

  // Debris particles (InstancedMesh)
  private debrisMesh: THREE.InstancedMesh;
  private debrisParticles: DebrisParticle[] = [];
  private maxDebris = 96;

  // Rain particles
  private rainLines: THREE.LineSegments;
  private rainPositions: Float32Array;
  private rainCount = 700;

  // Player state
  private playerPos = new THREE.Vector3(64.5, 25, 67.5);
  private playerVel = new THREE.Vector3();
  private yaw = 0;
  private pitch = -0.14;
  private onGround = false;
  private flyMode = false;
  private lastSpacePress = 0;
  private stepTimer = 0;
  private wetness = 0;

  // Input state
  private keys: Record<string, boolean> = {};
  private isPointerLocked = false;
  private isDraggingLook = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private lastMouseX = 0;
  private lastMouseY = 0;

  // Settings & lifecycle
  private settings: ShaderSettings;
  private clock = new THREE.Clock();
  private frameId = 0;
  private disposed = false;
  private onSnapshot: (snap: EngineSnapshot) => void;
  private onContextLost: () => void;
  private snapshotTimer = 0;
  private envRenderTarget: THREE.WebGLRenderTarget | null = null;

  constructor(
    container: HTMLElement,
    initialSettings: ShaderSettings,
    onSnapshot: (snap: EngineSnapshot) => void,
    onContextLost: () => void
  ) {
    this.container = container;
    this.settings = { ...initialSettings };
    this.onSnapshot = onSnapshot;
    this.onContextLost = onContextLost;

    // 1. Software WebGL detection (per Three.js skill)
    this.isSoftwareGl = (() => {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.96;
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    // 2. Scene & Camera
    this.scene = new THREE.Scene();
    this.fog = new THREE.FogExp2('#9ad4ff', this.settings.fogDensity);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(72, width / height, 0.1, 520);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    // 3. Studio Environment Reflections (PMREM RoomEnvironment)
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.envRenderTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    this.scene.environment = this.envRenderTarget.texture;
    this.scene.environmentIntensity = 0.45;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // 4. Procedural PBR Texture Atlas & Icons
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.atlas = createBlockTextureAtlas(maxAniso);
    for (const key of Object.keys(BLOCK_DEFS)) {
      const bt = Number(key) as BlockType;
      if (bt !== BlockType.Air && bt !== BlockType.Water) {
        this.blockIcons.set(bt, renderBlockIconDataUrl(bt, this.atlas.tileCanvas));
      }
    }

    // 5. Shaders & Materials
    this.skyMaterial = createSkyMaterial();
    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 24), this.skyMaterial);
    this.skyMesh.frustumCulled = false;
    this.scene.add(this.skyMesh);

    this.terrainUniforms = {
      uTime: { value: 0 },
      uWetness: { value: 0 },
      uEmissiveBoost: { value: 1.0 },
      uSunDir: { value: new THREE.Vector3(0.4, 0.7, -0.5).normalize() },
      uSunColor: { value: new THREE.Color('#ffedd0') },
      uSkyHorizon: { value: new THREE.Color('#8ac6f5') },
    };
    this.terrainMaterial = createTerrainMaterial(this.atlas, this.terrainUniforms);
    this.waterMaterial = createWaterMaterial();
    this.glassMaterial = createGlassMaterial(this.atlas);

    // 6. Lighting Rig (balanced contrast for deep shadows and crisp highlights)
    this.sunLight = new THREE.DirectionalLight('#ffedd0', 1.75);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 2;
    this.sunLight.shadow.camera.far = 150;
    const d = 38;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.radius = 2.2;
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.shadow.normalBias = 0.025;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.hemiLight = new THREE.HemisphereLight('#88c8ff', '#1c2418', 0.52);
    this.scene.add(this.hemiLight);

    this.torchLight = new THREE.PointLight('#ffbe55', 0, 14, 1.8);
    this.scene.add(this.torchLight);

    // 7. Voxel World & Chunk Meshes
    this.world = new VoxelWorld(202611);
    const spawnSurface = this.world.getSurfaceY(64, 67);
    this.playerPos.set(64.5, spawnSurface + 1.1, 67.5);
    this.rebuildAllChunks();

    // 8. Target Block Wireframe Outline
    const outlineGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.006, 1.006, 1.006));
    const outlineMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.78,
    });
    this.targetOutline = new THREE.LineSegments(outlineGeo, outlineMat);
    this.targetOutline.visible = false;
    this.scene.add(this.targetOutline);

    // 9. Composite First-Person Viewmodel (Arm + Wrist Trim + Held Voxel Block)
    this.viewmodelGroup = new THREE.Group();
    const armMat = new THREE.MeshStandardMaterial({ color: '#c89b7b', roughness: 0.85, metalness: 0.02 });
    const sleeveMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.65, metalness: 0.25 });
    const cuffMat = new THREE.MeshStandardMaterial({
      color: '#38f8e2',
      emissive: '#38f8e2',
      emissiveIntensity: 1.4,
      roughness: 0.2,
      metalness: 0.6,
    });

    const sleeveMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.36), sleeveMat);
    sleeveMesh.position.set(0.14, -0.18, -0.12);
    sleeveMesh.rotation.set(0.35, -0.25, 0.1);

    const handMesh = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.16), armMat);
    handMesh.position.set(0.08, -0.11, -0.32);
    handMesh.rotation.set(0.35, -0.25, 0.1);

    const cuffMesh = new THREE.Mesh(new THREE.BoxGeometry(0.172, 0.172, 0.045), cuffMat);
    cuffMesh.position.set(0.11, -0.145, -0.23);
    cuffMesh.rotation.set(0.35, -0.25, 0.1);

    this.heldBlockGeo = new THREE.BoxGeometry(0.24, 0.24, 0.24);
    this.heldBlockMat = new THREE.MeshStandardMaterial({
      map: this.atlas.albedo,
      normalMap: this.atlas.normal,
      roughnessMap: this.atlas.roughness,
      metalnessMap: this.atlas.metalness,
      emissive: new THREE.Color('#ffffff'),
      emissiveMap: this.atlas.emissive,
      emissiveIntensity: 1.8,
      roughness: 1.0,
      metalness: 1.0,
    });
    this.heldBlockMesh = new THREE.Mesh(this.heldBlockGeo, this.heldBlockMat);
    this.heldBlockMesh.position.set(0.04, -0.02, -0.44);
    this.heldBlockMesh.rotation.set(0.2, 0.65, -0.12);

    this.viewmodelGroup.add(sleeveMesh, cuffMesh, handMesh, this.heldBlockMesh);
    this.viewmodelGroup.position.set(0.34, -0.28, -0.22);
    this.camera.add(this.viewmodelGroup);
    this.setSelectedBlock(this.selectedBlock);

    // 10. Debris InstancedMesh
    const debrisGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    const debrisMat = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.05 });
    this.debrisMesh = new THREE.InstancedMesh(debrisGeo, debrisMat, this.maxDebris);
    this.debrisMesh.count = 0;
    this.debrisMesh.frustumCulled = false;
    this.scene.add(this.debrisMesh);

    // 11. Rain Streaks
    this.rainPositions = new Float32Array(this.rainCount * 6);
    for (let i = 0; i < this.rainCount; i++) {
      const rx = (Math.random() - 0.5) * 44;
      const ry = Math.random() * 28;
      const rz = (Math.random() - 0.5) * 44;
      this.rainPositions[i * 6] = rx;
      this.rainPositions[i * 6 + 1] = ry;
      this.rainPositions[i * 6 + 2] = rz;
      this.rainPositions[i * 6 + 3] = rx - 0.08;
      this.rainPositions[i * 6 + 4] = ry - 0.75;
      this.rainPositions[i * 6 + 5] = rz - 0.05;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3));
    const rainMat = new THREE.LineBasicMaterial({
      color: '#a8d4ff',
      transparent: true,
      opacity: 0.42,
    });
    this.rainLines = new THREE.LineSegments(rainGeo, rainMat);
    this.rainLines.visible = this.settings.weather === 'rain';
    this.rainLines.frustumCulled = false;
    this.scene.add(this.rainLines);

    // 12. Post-Processing Composer (GPU only; software WebGL uses direct renderer for reliability)
    if (!this.isSoftwareGl) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));

      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.62, 0.45, 0.78);
      this.composer.addPass(this.bloomPass);

      this.volumetricPass = new ShaderPass(VolumetricPostShader);
      this.composer.addPass(this.volumetricPass);

      this.composer.addPass(new OutputPass());
    }

    // Pre-warm shaders on GPU
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.applySettings(this.settings);
    this.bindEvents();
    this.updateCameraTransform();
    this.startLoop();
  }

  public setSelectedBlock(block: BlockType) {
    this.selectedBlock = block;
    const def = BLOCK_DEFS[block];
    if (!def) return;

    // Update held block UVs to match selected block's [top, side, bottom] tiles
    const uvAttr = this.heldBlockGeo.attributes.uv as THREE.BufferAttribute;
    const tileW = 1 / ATLAS_COLS;
    const tileH = 1 / ATLAS_ROWS;
    const eps = 0.002;

    // BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z (4 vertices each)
    const faceTiles = [def.tiles[1], def.tiles[1], def.tiles[0], def.tiles[2], def.tiles[1], def.tiles[1]];
    for (let f = 0; f < 6; f++) {
      const tileId = faceTiles[f];
      const col = tileId % ATLAS_COLS;
      const row = Math.floor(tileId / ATLAS_COLS);
      const u0 = col * tileW + eps;
      const u1 = (col + 1) * tileW - eps;
      // BoxGeometry UV Y is flipped relative to flipY=false canvas
      const v0 = (row + 1) * tileH - eps;
      const v1 = row * tileH + eps;

      const base = f * 4;
      uvAttr.setXY(base + 0, u0, v1);
      uvAttr.setXY(base + 1, u1, v1);
      uvAttr.setXY(base + 2, u0, v0);
      uvAttr.setXY(base + 3, u1, v0);
    }
    uvAttr.needsUpdate = true;

    // Update held torch light
    if (def.glowRadius && def.emissiveColor) {
      this.torchLight.color.set(def.emissiveColor);
      this.torchLight.distance = def.glowRadius;
      this.torchLight.intensity = 2.8;
    } else {
      this.torchLight.intensity = 0;
    }
  }

  public applySettings(next: ShaderSettings) {
    this.settings = { ...next };
    const preset = SHADER_PRESETS[next.preset];

    this.renderer.toneMappingExposure = preset.exposure;
    this.fog.density = next.fogDensity;

    if (this.bloomPass) {
      this.bloomPass.strength = next.bloomStrength;
      this.bloomPass.threshold = preset.bloomThreshold;
    }
    if (this.volumetricPass) {
      this.volumetricPass.uniforms.uGodRayStrength.value = next.godRays;
      this.volumetricPass.uniforms.uSaturation.value = preset.saturation;
      this.volumetricPass.uniforms.uContrast.value = preset.contrast;
    }

    this.waterMaterial.uniforms.uWaterQuality.value = next.waterQuality;
    this.waterMaterial.uniforms.uWaterShallow.value.set(preset.waterShallow);
    this.waterMaterial.uniforms.uWaterDeep.value.set(preset.waterDeep);
    this.skyMaterial.uniforms.uAuroraStrength.value = preset.auroraStrength;
    this.rainLines.visible = next.weather === 'rain';
  }

  public toggleFlyMode(): boolean {
    this.flyMode = !this.flyMode;
    if (this.flyMode) this.playerVel.y = 0;
    this.emitSnapshot();
    return this.flyMode;
  }

  public regenerateWorld() {
    this.world.regenerate();
    this.rebuildAllChunks();
    const spawnSurface = this.world.getSurfaceY(64, 67);
    this.playerPos.set(64.5, spawnSurface + 1.2, 67.5);
    this.playerVel.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = -0.14;
    this.emitSnapshot();
  }

  public resetToSpawn() {
    const spawnSurface = this.world.getSurfaceY(64, 67);
    this.playerPos.set(64.5, spawnSurface + 1.2, 67.5);
    this.playerVel.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = -0.14;
    this.emitSnapshot();
  }

  public lockPointer() {
    try {
      this.renderer.domElement.requestPointerLock();
    } catch {
      // Fallback drag-look already works automatically
    }
  }

  private rebuildAllChunks() {
    for (let cx = 0; cx < WORLD_CHUNKS_X; cx++) {
      for (let cz = 0; cz < WORLD_CHUNKS_Z; cz++) {
        this.rebuildChunk(cx, cz);
      }
    }
    this.world.dirtyChunks.clear();
  }

  private rebuildChunk(cx: number, cz: number) {
    const key = `${cx},${cz}`;
    const prev = this.chunkMeshes.get(key);
    if (prev) {
      if (prev.solid) {
        this.scene.remove(prev.solid);
        prev.solid.geometry.dispose();
      }
      if (prev.water) {
        this.scene.remove(prev.water);
        prev.water.geometry.dispose();
      }
      if (prev.glass) {
        this.scene.remove(prev.glass);
        prev.glass.geometry.dispose();
      }
    }

    const geos = buildChunkGeometry(this.world, cx, cz);
    const group: ChunkMeshGroup = { solid: null, water: null, glass: null };

    if (geos.solid) {
      const m = new THREE.Mesh(geos.solid, this.terrainMaterial);
      m.castShadow = !this.isSoftwareGl;
      m.receiveShadow = !this.isSoftwareGl;
      this.scene.add(m);
      group.solid = m;
    }
    if (geos.water) {
      const m = new THREE.Mesh(geos.water, this.waterMaterial);
      m.renderOrder = 2;
      this.scene.add(m);
      group.water = m;
    }
    if (geos.glass) {
      const m = new THREE.Mesh(geos.glass, this.glassMaterial);
      m.renderOrder = 3;
      this.scene.add(m);
      group.glass = m;
    }

    this.chunkMeshes.set(key, group);
  }

  private handleBreakBlock() {
    if (!this.currentTarget) return;
    const { x, y, z, blockType } = this.currentTarget;
    if (y === 0) return;
    if (this.world.setBlock(x, y, z, BlockType.Air)) {
      this.swingProgress = 1.0;
      const def = BLOCK_DEFS[blockType];
      voxelAudio.playBreak(def.sound);
      this.spawnDebris(x + 0.5, y + 0.5, z + 0.5, def.particleColor);
    }
  }

  private handlePlaceBlock() {
    if (!this.currentTarget) return;
    const { x, y, z, nx, ny, nz } = this.currentTarget;
    const px = x + nx;
    const py = y + ny;
    const pz = z + nz;

    // Prevent placing block inside player AABB
    const halfW = 0.3;
    const minX = this.playerPos.x - halfW;
    const maxX = this.playerPos.x + halfW;
    const minY = this.playerPos.y;
    const maxY = this.playerPos.y + 1.75;
    const minZ = this.playerPos.z - halfW;
    const maxZ = this.playerPos.z + halfW;

    const overlapsPlayer =
      px < maxX && px + 1 > minX && py < maxY && py + 1 > minY && pz < maxZ && pz + 1 > minZ;
    if (overlapsPlayer) return;

    if (this.world.setBlock(px, py, pz, this.selectedBlock)) {
      this.swingProgress = 1.0;
      voxelAudio.playPlace(BLOCK_DEFS[this.selectedBlock].sound);
    }
  }

  private spawnDebris(cx: number, cy: number, cz: number, hexColor: string) {
    const col = new THREE.Color(hexColor);
    for (let i = 0; i < 14; i++) {
      if (this.debrisParticles.length >= this.maxDebris) {
        this.debrisParticles.shift();
      }
      this.debrisParticles.push({
        pos: new THREE.Vector3(
          cx + (Math.random() - 0.5) * 0.6,
          cy + (Math.random() - 0.5) * 0.6,
          cz + (Math.random() - 0.5) * 0.6
        ),
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 4.5,
          1.5 + Math.random() * 3.5,
          (Math.random() - 0.5) * 4.5
        ),
        rot: new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3),
        rotVel: new THREE.Vector3(
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10
        ),
        scale: 0.6 + Math.random() * 0.7,
        life: 0,
        maxLife: 0.45 + Math.random() * 0.35,
        color: col.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.1),
      });
    }
  }

  private updateAtmosphere(elapsed: number, dt: number) {
    if (this.settings.autoTimeCycle) {
      this.settings.timeOfDay = (this.settings.timeOfDay + dt * 0.012) % 1.0;
    }

    const preset = SHADER_PRESETS[this.settings.preset];
    // 0.25 = sunrise, 0.5 = noon, 0.75 = sunset, 0.0/1.0 = midnight
    const sunAngle = (this.settings.timeOfDay - 0.25) * Math.PI * 2;
    const sunY = Math.sin(sunAngle);
    const sunX = Math.cos(sunAngle) * 0.82;
    const sunZ = -0.45;
    _sunDir.set(sunX, sunY, sunZ).normalize();

    const dayFactor = THREE.MathUtils.clamp((sunY + 0.14) / 0.45, 0, 1);
    const nightFactor = 1.0 - dayFactor;
    const sunsetFactor = THREE.MathUtils.clamp(1.0 - Math.abs(sunY) / 0.28, 0, 1) * (1 - nightFactor * 0.5);
    const rainFactor = this.settings.weather === 'rain' ? 1.0 : 0.0;

    // Smooth wetness accumulation in rain
    this.wetness = THREE.MathUtils.damp(this.wetness, rainFactor, 1.8, dt);
    this.terrainUniforms.uTime.value = elapsed;
    this.terrainUniforms.uWetness.value = this.wetness;
    this.terrainUniforms.uEmissiveBoost.value = 1.1 + nightFactor * 0.85;

    _cZenithDay.set(preset.skyZenithDay);
    _cHorizonDay.set(preset.skyHorizonDay);

    const skyZenith = _cZenithDay.clone().lerp(_cZenithNight, nightFactor);
    const skyHorizon = _cHorizonDay.clone().lerp(_cHorizonNight, nightFactor).lerp(_cSunset, sunsetFactor * 0.65);

    if (rainFactor > 0.01) {
      skyZenith.lerp(new THREE.Color('#2c3a4a'), rainFactor * 0.65);
      skyHorizon.lerp(new THREE.Color('#4a5b6e'), rainFactor * 0.65);
    }

    _cSunCol.set(preset.sunWarmth).lerp(_cSunset, sunsetFactor * 0.6);
    if (nightFactor > 0.6) {
      _cSunCol.lerp(new THREE.Color('#7cb8ff'), (nightFactor - 0.6) / 0.4);
    }

    // Update terrain shader uniforms for SSS & aerial perspective
    this.terrainUniforms.uSunDir.value.copy(_sunDir);
    this.terrainUniforms.uSunColor.value.copy(_cSunCol);
    this.terrainUniforms.uSkyHorizon.value.copy(skyHorizon);

    // Update sky uniforms
    this.skyMaterial.uniforms.uTime.value = elapsed;
    this.skyMaterial.uniforms.uSunDir.value.copy(_sunDir);
    this.skyMaterial.uniforms.uSunColor.value.copy(_cSunCol);
    this.skyMaterial.uniforms.uSkyZenith.value.copy(skyZenith);
    this.skyMaterial.uniforms.uSkyHorizon.value.copy(skyHorizon);
    this.skyMaterial.uniforms.uNightFactor.value = nightFactor;
    this.skyMaterial.uniforms.uRainFactor.value = rainFactor;

    // Fog matches sky horizon
    _cFog.copy(skyHorizon);
    this.fog.color.copy(_cFog);

    // Directional Sun/Moon light follows player texel-snapped for crisp shadows
    const activeDir = sunY >= -0.05 ? _sunDir : _vec3.copy(_sunDir).negate();
    const snapX = Math.round(this.playerPos.x);
    const snapZ = Math.round(this.playerPos.z);
    this.sunLight.position.set(snapX + activeDir.x * 65, 28 + activeDir.y * 65, snapZ + activeDir.z * 65);
    this.sunLight.target.position.set(snapX, 20, snapZ);
    this.sunLight.target.updateMatrixWorld();

    this.sunLight.color.copy(_cSunCol);
    this.sunLight.intensity =
      (sunY >= -0.05 ? 0.55 + dayFactor * 1.38 : 0.36) * (1 - rainFactor * 0.45);

    _cHemiSky.copy(skyHorizon).lerp(new THREE.Color('#a4ccf5'), 0.3);
    _cHemiGround.set(nightFactor > 0.5 ? '#0b1220' : '#1b2419');
    this.hemiLight.color.copy(_cHemiSky);
    this.hemiLight.groundColor.copy(_cHemiGround);
    this.hemiLight.intensity = 0.26 + dayFactor * 0.34;
    this.scene.environmentIntensity = (0.22 + dayFactor * 0.24) * (1 - rainFactor * 0.2);

    // Water shader uniforms
    this.waterMaterial.uniforms.uTime.value = elapsed;
    this.waterMaterial.uniforms.uSunDir.value.copy(_sunDir);
    this.waterMaterial.uniforms.uSunColor.value.copy(_cSunCol);
    this.waterMaterial.uniforms.uSkyZenith.value.copy(skyZenith);
    this.waterMaterial.uniforms.uSkyHorizon.value.copy(skyHorizon);
    this.waterMaterial.uniforms.uFogColor.value.copy(_cFog);
    this.waterMaterial.uniforms.uFogDensity.value = this.fog.density;
    this.waterMaterial.uniforms.uNightFactor.value = nightFactor;

    // Volumetric sun shafts screen-space projection
    if (this.volumetricPass) {
      this.volumetricPass.uniforms.uTime.value = elapsed;
      this.volumetricPass.uniforms.uSunColor.value.copy(_cSunCol);

      _sunWorld.copy(this.camera.position).addScaledVector(_sunDir, 200);
      _sunProj.copy(_sunWorld).project(this.camera);

      // Check if sun is in front of camera
      _lookDir.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
      const facingSun = _lookDir.dot(_sunDir);
      const onScreen = facingSun > 0.05 && sunY > -0.05 ? THREE.MathUtils.clamp(facingSun * 1.4, 0, 1) * (1 - rainFactor * 0.85) : 0;

      this.volumetricPass.uniforms.uSunScreenPos.value.set(_sunProj.x * 0.5 + 0.5, _sunProj.y * 0.5 + 0.5);
      this.volumetricPass.uniforms.uSunOnScreen.value = onScreen;
    }
  }

  private updatePhysics(dt: number) {
    const clampedDt = Math.min(dt, 0.05);

    // Camera forward/right vectors on XZ plane
    _forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize();

    _move.set(0, 0, 0);
    if (this.keys['KeyW'] || this.keys['ArrowUp']) _move.add(_forward);
    if (this.keys['KeyS'] || this.keys['ArrowDown']) _move.sub(_forward);
    if (this.keys['KeyD'] || this.keys['ArrowRight']) _move.add(_right);
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) _move.sub(_right);
    if (_move.lengthSq() > 0) _move.normalize();

    const sprinting = Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight']);
    const eyeBlock = this.world.getBlock(this.playerPos.x, this.playerPos.y + 1.55, this.playerPos.z);
    const feetBlock = this.world.getBlock(this.playerPos.x, this.playerPos.y + 0.2, this.playerPos.z);
    const inWater = feetBlock === BlockType.Water || eyeBlock === BlockType.Water;

    const speed = this.flyMode ? (sprinting ? 18 : 10) : inWater ? 4.2 : sprinting ? 7.8 : 5.2;

    this.playerVel.x = THREE.MathUtils.damp(this.playerVel.x, _move.x * speed, 14, clampedDt);
    this.playerVel.z = THREE.MathUtils.damp(this.playerVel.z, _move.z * speed, 14, clampedDt);

    if (this.flyMode) {
      let vy = 0;
      if (this.keys['Space']) vy += speed * 0.85;
      if (this.keys['KeyC'] || this.keys['ControlLeft']) vy -= speed * 0.85;
      this.playerVel.y = THREE.MathUtils.damp(this.playerVel.y, vy, 12, clampedDt);
    } else if (inWater) {
      this.playerVel.y -= 7.5 * clampedDt;
      if (this.keys['Space']) {
        this.playerVel.y = Math.min(5.2, this.playerVel.y + 18 * clampedDt);
      }
      this.playerVel.y *= 0.94;
    } else {
      this.playerVel.y -= 24.0 * clampedDt;
      if (this.keys['Space'] && this.onGround) {
        this.playerVel.y = 8.4;
        this.onGround = false;
      }
    }

    // Move & resolve voxel AABB collisions per axis
    const halfW = 0.28;
    const height = 1.72;

    // X axis
    this.playerPos.x += this.playerVel.x * clampedDt;
    if (this.collidesAt(this.playerPos.x, this.playerPos.y, this.playerPos.z, halfW, height)) {
      this.playerPos.x -= this.playerVel.x * clampedDt;
      this.playerVel.x = 0;
    }

    // Z axis
    this.playerPos.z += this.playerVel.z * clampedDt;
    if (this.collidesAt(this.playerPos.x, this.playerPos.y, this.playerPos.z, halfW, height)) {
      this.playerPos.z -= this.playerVel.z * clampedDt;
      this.playerVel.z = 0;
    }

    // Y axis
    this.playerPos.y += this.playerVel.y * clampedDt;
    if (this.collidesAt(this.playerPos.x, this.playerPos.y, this.playerPos.z, halfW, height)) {
      if (this.playerVel.y < 0) {
        this.playerPos.y = Math.ceil(this.playerPos.y) - 0.001;
        // Snap cleanly on top of block
        const floorY = Math.floor(this.playerPos.y);
        if (!this.collidesAt(this.playerPos.x, floorY + 1, this.playerPos.z, halfW, height)) {
          this.playerPos.y = floorY + 1;
        } else {
          this.playerPos.y -= this.playerVel.y * clampedDt;
        }
        this.onGround = true;
      } else {
        this.playerPos.y -= this.playerVel.y * clampedDt;
      }
      this.playerVel.y = 0;
    } else {
      this.onGround = false;
    }

    // Clamp to world boundaries smoothly
    this.playerPos.x = THREE.MathUtils.clamp(this.playerPos.x, 1.5, WORLD_SIZE_X - 1.5);
    this.playerPos.z = THREE.MathUtils.clamp(this.playerPos.z, 1.5, WORLD_SIZE_Z - 1.5);
    if (this.playerPos.y < 2) {
      this.playerPos.y = this.world.getSurfaceY(this.playerPos.x, this.playerPos.z) + 2;
      this.playerVel.y = 0;
    }
    this.playerPos.y = Math.min(this.playerPos.y, WORLD_SIZE_Y + 24);

    // Footstep sound & walk bobbing
    const horizSpeed = Math.hypot(this.playerVel.x, this.playerVel.z);
    if (horizSpeed > 0.6 && (this.onGround || inWater) && !this.flyMode) {
      this.walkBobTime += clampedDt * horizSpeed * 1.9;
      this.stepTimer += clampedDt * horizSpeed;
      if (this.stepTimer > 2.3) {
        this.stepTimer = 0;
        voxelAudio.playStep(inWater);
      }
    }

    // Underwater post-processing & fog
    const eyeUnderwater =
      this.world.getBlock(this.playerPos.x, this.playerPos.y + 1.56, this.playerPos.z) === BlockType.Water;
    if (this.volumetricPass) {
      this.volumetricPass.uniforms.uUnderwater.value = eyeUnderwater ? 1.0 : 0.0;
    }
    if (eyeUnderwater) {
      this.fog.color.set('#0b4f6c');
      this.fog.density = 0.055;
    }
  }

  private collidesAt(px: number, py: number, pz: number, halfW: number, height: number): boolean {
    const minX = Math.floor(px - halfW);
    const maxX = Math.floor(px + halfW);
    const minY = Math.floor(py + 0.02);
    const maxY = Math.floor(py + height);
    const minZ = Math.floor(pz - halfW);
    const maxZ = Math.floor(pz + halfW);

    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (this.world.isSolid(x, y, z)) return true;
        }
      }
    }
    return false;
  }

  private updateCameraTransform() {
    const bobOffset = Math.sin(this.walkBobTime) * 0.032;
    this.camera.position.set(this.playerPos.x, this.playerPos.y + 1.58 + bobOffset, this.playerPos.z);
    _euler.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(_euler);

    this.skyMesh.position.copy(this.camera.position);
    this.torchLight.position.copy(this.camera.position);
  }

  private updateViewmodel(dt: number) {
    if (this.swingProgress > 0) {
      this.swingProgress = Math.max(0, this.swingProgress - dt * 5.5);
    }
    const swingAngle = Math.sin(this.swingProgress * Math.PI) * 0.85;
    const bobX = Math.cos(this.walkBobTime * 0.5) * 0.015;
    const bobY = Math.abs(Math.sin(this.walkBobTime * 0.5)) * 0.018;

    this.viewmodelGroup.position.set(0.34 + bobX, -0.28 - bobY - swingAngle * 0.08, -0.22 - swingAngle * 0.14);
    this.viewmodelGroup.rotation.set(-swingAngle * 0.75, swingAngle * 0.3, 0);
  }

  private updateDebrisAndRain(dt: number) {
    // Update block break debris
    for (let i = this.debrisParticles.length - 1; i >= 0; i--) {
      const p = this.debrisParticles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.debrisParticles.splice(i, 1);
        continue;
      }
      p.vel.y -= 18 * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.rot.x += p.rotVel.x * dt;
      p.rot.y += p.rotVel.y * dt;
      p.rot.z += p.rotVel.z * dt;
    }

    this.debrisMesh.count = this.debrisParticles.length;
    for (let i = 0; i < this.debrisParticles.length; i++) {
      const p = this.debrisParticles[i];
      const shrink = 1 - p.life / p.maxLife;
      _quat.setFromEuler(p.rot);
      _vec3.setScalar(p.scale * shrink);
      _mat4.compose(p.pos, _quat, _vec3);
      this.debrisMesh.setMatrixAt(i, _mat4);
      this.debrisMesh.setColorAt(i, p.color);
    }
    this.debrisMesh.instanceMatrix.needsUpdate = true;
    if (this.debrisMesh.instanceColor) {
      this.debrisMesh.instanceColor.needsUpdate = true;
    }

    // Update rain streaks
    if (this.rainLines.visible) {
      const cx = this.playerPos.x;
      const cz = this.playerPos.z;
      const cy = this.playerPos.y;
      const posAttr = this.rainLines.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < this.rainCount; i++) {
        const i6 = i * 6;
        let x = this.rainPositions[i6] - 1.2 * dt;
        let y = this.rainPositions[i6 + 1] - 24 * dt;
        let z = this.rainPositions[i6 + 2] - 0.8 * dt;

        if (y < cy - 8 || Math.abs(x - cx) > 24 || Math.abs(z - cz) > 24) {
          x = cx + (Math.random() - 0.5) * 44;
          y = cy + 12 + Math.random() * 14;
          z = cz + (Math.random() - 0.5) * 44;
        }
        this.rainPositions[i6] = x;
        this.rainPositions[i6 + 1] = y;
        this.rainPositions[i6 + 2] = z;
        this.rainPositions[i6 + 3] = x - 0.08;
        this.rainPositions[i6 + 4] = y - 0.78;
        this.rainPositions[i6 + 5] = z - 0.05;
      }
      posAttr.needsUpdate = true;
    }
  }

  private updateRaycast() {
    _lookDir.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const hit = this.world.raycast(
      this.camera.position.x,
      this.camera.position.y,
      this.camera.position.z,
      _lookDir.x,
      _lookDir.y,
      _lookDir.z,
      8.5
    );
    this.currentTarget = hit;
    if (hit) {
      this.targetOutline.visible = true;
      this.targetOutline.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    } else {
      this.targetOutline.visible = false;
    }
  }

  private flushDirtyChunks() {
    if (this.world.dirtyChunks.size === 0) return;
    for (const key of this.world.dirtyChunks) {
      const [cxStr, czStr] = key.split(',');
      this.rebuildChunk(Number(cxStr), Number(czStr));
    }
    this.world.dirtyChunks.clear();
  }

  private emitSnapshot() {
    const t = this.settings.timeOfDay;
    const timeLabel =
      t < 0.2 || t >= 0.85
        ? 'Night'
        : t < 0.34
          ? 'Dawn'
          : t < 0.64
            ? 'Daylight'
            : 'Golden Hour';

    const eyeUnderwater =
      this.world.getBlock(this.playerPos.x, this.playerPos.y + 1.56, this.playerPos.z) === BlockType.Water;

    this.onSnapshot({
      x: Math.floor(this.playerPos.x),
      y: Math.floor(this.playerPos.y),
      z: Math.floor(this.playerPos.z),
      flyMode: this.flyMode,
      isLocked: this.isPointerLocked,
      targetBlockName: this.currentTarget ? BLOCK_DEFS[this.currentTarget.blockType].name : null,
      underwater: eyeUnderwater || this.playerPos.y < WATER_LEVEL - 0.4,
      timeLabel,
    });
  }

  private startLoop() {
    const afterDraw = (cb: () => void) => {
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    };

    const tick = () => {
      if (this.disposed) return;
      const dt = Math.min(this.clock.getDelta(), 0.1);
      const elapsed = this.clock.elapsedTime;

      this.flushDirtyChunks();
      this.updatePhysics(dt);
      this.updateCameraTransform();
      this.updateRaycast();
      this.updateViewmodel(dt);
      this.updateDebrisAndRain(dt);
      this.updateAtmosphere(elapsed, dt);

      this.snapshotTimer += dt;
      if (this.snapshotTimer > 0.14) {
        this.snapshotTimer = 0;
        this.emitSnapshot();
      }

      if (this.isSoftwareGl || !this.composer) {
        this.renderer.render(this.scene, this.camera);
      } else {
        this.composer.render();
      }

      if (this.isSoftwareGl) {
        afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.frameId = window.setTimeout(tick, 16);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  // Event Handlers
  private onKeyDown = (e: KeyboardEvent) => {
    this.keys[e.code] = true;
    if (e.code === 'Space' && !e.repeat) {
      const now = performance.now();
      if (now - this.lastSpacePress < 260) {
        this.toggleFlyMode();
      }
      this.lastSpacePress = now;
    }
    if (e.code === 'KeyF' && !e.repeat) {
      this.toggleFlyMode();
    }
    if (e.code === 'KeyE' && !e.repeat) {
      this.handlePlaceBlock();
    }
    if (e.code === 'KeyQ' && !e.repeat) {
      this.handleBreakBlock();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
  };

  private onMouseDown = (e: MouseEvent) => {
    if (e.target !== this.renderer.domElement) return;
    if (this.isPointerLocked) {
      if (e.button === 0) this.handleBreakBlock();
      else if (e.button === 2) this.handlePlaceBlock();
      return;
    }

    if (e.button === 0) {
      this.isDraggingLook = true;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    } else if (e.button === 2) {
      this.handlePlaceBlock();
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0 && this.isDraggingLook) {
      this.isDraggingLook = false;
      const moved = Math.hypot(e.clientX - this.dragStartX, e.clientY - this.dragStartY);
      if (moved < 4 && e.target === this.renderer.domElement && !this.isPointerLocked) {
        this.lockPointer();
      }
    }
  };

  private onMouseMove = (e: MouseEvent) => {
    const sens = 0.0022;
    if (this.isPointerLocked) {
      this.yaw -= e.movementX * sens;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * sens, -1.52, 1.52);
    } else if (this.isDraggingLook) {
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.yaw -= dx * sens * 1.4;
      this.pitch = THREE.MathUtils.clamp(this.pitch - dy * sens * 1.4, -1.52, 1.52);
    }
  };

  private onContextMenu = (e: MouseEvent) => {
    if (e.target === this.renderer.domElement) {
      e.preventDefault();
    }
  };

  private onPointerLockChange = () => {
    this.isPointerLocked = document.pointerLockElement === this.renderer.domElement;
    this.emitSnapshot();
  };

  private onResize = () => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setSize(w, h);
    }
    if (this.bloomPass) {
      this.bloomPass.resolution.set(w, h);
    }
  };

  private onWebGlLost = (e: Event) => {
    e.preventDefault();
    this.onContextLost();
  };

  private bindEvents() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('resize', this.onResize);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    this.renderer.domElement.addEventListener('mousedown', this.onMouseDown);
    this.renderer.domElement.addEventListener('contextmenu', this.onContextMenu);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onWebGlLost);
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    this.renderer.domElement.removeEventListener('mousedown', this.onMouseDown);
    this.renderer.domElement.removeEventListener('contextmenu', this.onContextMenu);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onWebGlLost);

    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }

    for (const group of this.chunkMeshes.values()) {
      group.solid?.geometry.dispose();
      group.water?.geometry.dispose();
      group.glass?.geometry.dispose();
    }
    this.chunkMeshes.clear();

    this.atlas.albedo.dispose();
    this.atlas.normal.dispose();
    this.atlas.roughness.dispose();
    this.atlas.metalness.dispose();
    this.atlas.emissive.dispose();

    this.terrainMaterial.dispose();
    this.waterMaterial.dispose();
    this.glassMaterial.dispose();
    this.skyMaterial.dispose();
    this.skyMesh.geometry.dispose();
    this.targetOutline.geometry.dispose();
    (this.targetOutline.material as THREE.Material).dispose();
    this.heldBlockGeo.dispose();
    this.heldBlockMat.dispose();
    this.debrisMesh.geometry.dispose();
    (this.debrisMesh.material as THREE.Material).dispose();
    this.rainLines.geometry.dispose();
    (this.rainLines.material as THREE.Material).dispose();
    this.envRenderTarget?.dispose();
    this.composer?.dispose();
    this.renderer.dispose();

    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
