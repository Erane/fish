import { BODY, DEEP_TINT } from "../core/index.ts";
import type { DepthField } from "../core/index.ts";
import type { Quality } from "../core/types.ts";
import { TOKENS, hexToRgb01 } from "../style.ts";
import {
  ATLAS,
  Batch,
  CELL_H,
  CELL_W,
  MAX_FISH,
  SEG_UNITS,
  STRIDE,
  WHITE,
  cellOrigin,
  packSprites,
  spriteCorners,
} from "./batch.ts";
import { bedToScreen, depthAtScreen, fitBed } from "./bed.ts";
import type { BedTransform } from "./bed.ts";
import { renderSizes } from "./quality.ts";
import {
  FS_BED,
  FS_CAUSTIC,
  FS_CLOUD,
  FS_DROP,
  FS_FINAL,
  FS_FLOAT,
  FS_SIM,
  FS_SPRITE,
  FS_SURFACE,
  VS_FLOAT,
  VS_QUAD,
  VS_SPRITE,
} from "./shaders.ts";
import { noiseData, waveData } from "./textures.ts";
import type {
  BodyLight,
  Layer,
  Look,
  Renderer,
  SpriteDef,
  SpriteSet,
  Vec3,
  Vec4,
} from "./types.ts";
import { LAYERS } from "./types.ts";

const PAPER = hexToRgb01(TOKENS.paper);

interface Prog {
  p: WebGLProgram;
  u(name: string): WebGLUniformLocation | null;
}

interface Target {
  tex: WebGLTexture;
  fb: WebGLFramebuffer;
  w: number;
  h: number;
}

interface State {
  w: number;
  h: number;
  dpr: number;
  quality: Quality;
  scene: Target | null;
  shadow: Target | null;
  caustic: Target | null;
  surface: Target | null;
  cloud: Target | null;
  sim: (Target | null)[];
  simW: number;
  simH: number;
  simAcc: number;
  bed: BedTransform;
}

export function createRenderer(
  canvas: HTMLCanvasElement,
  bed: HTMLCanvasElement,
  sprites: SpriteSet,
  floatMask: HTMLCanvasElement | null,
  depth: DepthField | null,
  water: HTMLCanvasElement | null,
  onLost?: () => void,
): Renderer | null {
  const glCtx = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    powerPreference: "default",
  });
  if (!glCtx) return null;
  const gl: WebGL2RenderingContext = glCtx;
  const floatRT =
    gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float");
  gl.getExtension("OES_texture_float_linear");
  let lost = false;
  canvas.addEventListener(
    "webglcontextlost",
    (e) => {
      e.preventDefault();
      lost = true;
    },
    { once: true },
  );
  canvas.addEventListener("webglcontextrestored", () => onLost?.(), { once: true });

  const bedW = bed.width;
  const bedH = bed.height;

  function compile(type: number, src: string): WebGLShader {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(s) ?? "shader compile failed");
    return s;
  }
  function program(vs: string, fs: string): Prog {
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, "aPos");
    gl.bindAttribLocation(p, 1, "aUv");
    gl.bindAttribLocation(p, 2, "aColor");
    gl.bindAttribLocation(p, 3, "aFog");
    gl.bindAttribLocation(p, 4, "aLight");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(p) ?? "program link failed");
    const cache = new Map<string, WebGLUniformLocation | null>();
    return {
      p,
      u(name) {
        if (cache.has(name)) return cache.get(name)!;
        const loc = gl.getUniformLocation(p, name);
        cache.set(name, loc);
        return loc;
      },
    };
  }

  const P = {
    drop: program(VS_QUAD, FS_DROP),
    sim: program(VS_QUAD, FS_SIM),
    caustic: program(VS_QUAD, FS_CAUSTIC),
    bed: program(VS_QUAD, FS_BED),
    sprite: program(VS_SPRITE, FS_SPRITE),
    surface: program(VS_QUAD, FS_SURFACE),
    final: program(VS_QUAD, FS_FINAL),
    floater: program(VS_FLOAT, FS_FLOAT),
    cloud: program(VS_QUAD, FS_CLOUD),
  };

  const quadVao = gl.createVertexArray();
  gl.bindVertexArray(quadVao);
  const qb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, qb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const spriteVao = gl.createVertexArray();
  gl.bindVertexArray(spriteVao);
  const vbo = gl.createBuffer();
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  const attribs: [number, number, number][] = [
    [0, 2, 0],
    [1, 2, 8],
    [2, 4, 16],
    [3, 4, 32],
    [4, 4, 48],
  ];
  for (const [loc, n, off] of attribs) {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, n, gl.FLOAT, false, STRIDE * 4, off);
  }
  gl.bindVertexArray(null);

  function texture(
    w: number,
    h: number,
    internal: number,
    format: number,
    type: number,
    data: ArrayBufferView | null,
    filter: number = gl.LINEAR,
    wrap: number = gl.CLAMP_TO_EDGE,
  ): WebGLTexture {
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MAG_FILTER,
      filter === gl.LINEAR_MIPMAP_LINEAR ? gl.LINEAR : filter,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    return t;
  }
  function target(
    w: number,
    h: number,
    internal: number,
    format: number,
    type: number,
  ): Target | null {
    const tex = texture(w, h, internal, format, type, null);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return ok ? { tex, fb, w, h } : null;
  }
  function freeTarget(t: Target | null): void {
    if (t) {
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fb);
    }
  }

  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  const noiseTex = texture(
    256,
    256,
    gl.RGBA8,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    noiseData(256),
    gl.LINEAR,
    gl.REPEAT,
  );
  const waveTex = texture(
    256,
    256,
    gl.RGBA8,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    waveData(256),
    gl.LINEAR,
    gl.REPEAT,
  );
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

  const bedTex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, bedTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bed);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const floatTex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, floatTex);
  if (floatMask) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, floatMask);
  else
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array(4),
    );
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const waterTex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, waterTex);
  if (water) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, water);
  else
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([255, 255, 255, 255]),
    );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const atlas = texture(
    ATLAS,
    ATLAS,
    gl.RGBA8,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null,
    gl.LINEAR_MIPMAP_LINEAR,
  );
  const depthTex = texture(
    depth ? depth.w : 1,
    depth ? depth.h : 1,
    gl.R8,
    gl.RED,
    gl.UNSIGNED_BYTE,
    depth
      ? Uint8Array.from(depth.data as ArrayLike<number>, (v) => Math.round(v * 255))
      : new Uint8Array([128]),
  );
  packSprites(sprites);
  gl.bindTexture(gl.TEXTURE_2D, atlas);
  for (const s of Object.values(sprites))
    gl.texSubImage2D(gl.TEXTURE_2D, 0, s.x, s.y, gl.RGBA, gl.UNSIGNED_BYTE, s.canvas);
  let atlasDirty = true;

  const state: State = {
    w: 1,
    h: 1,
    dpr: 1,
    quality: "high",
    scene: null,
    shadow: null,
    caustic: null,
    surface: null,
    cloud: null,
    sim: [null, null],
    simW: 1,
    simH: 1,
    simAcc: 0,
    bed: { u: [1, 0, 0], v: [0, 1, 0], turn: 0 },
  };
  const drops: number[][] = [];
  const batches = {} as Record<Layer, Batch>;
  for (const l of LAYERS) batches[l] = new Batch();

  function resize(w: number, h: number, dpr: number, quality: Quality): void {
    state.w = w;
    state.h = h;
    state.dpr = dpr;
    state.quality = quality;
    const sz = renderSizes(w, h, dpr, quality);
    canvas.width = sz.cw;
    canvas.height = sz.ch;
    freeTarget(state.scene);
    freeTarget(state.shadow);
    freeTarget(state.caustic);
    freeTarget(state.surface);
    freeTarget(state.cloud);
    state.sim.forEach(freeTarget);
    state.scene = target(sz.cw, sz.ch, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
    state.shadow = target(sz.shadow[0], sz.shadow[1], gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
    gl.bindTexture(gl.TEXTURE_2D, state.shadow!.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    state.cloud = target(sz.cloud[0], sz.cloud[1], gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
    state.caustic = target(sz.caustic[0], sz.caustic[1], gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
    state.surface = target(sz.surface[0], sz.surface[1], gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
    state.simW = sz.sim[0];
    state.simH = sz.sim[1];
    state.sim = floatRT
      ? ([0, 1].map(() =>
          target(state.simW, state.simH, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT),
        ) as (Target | null)[])
      : [null, null];
    if (!state.sim[0] || !state.sim[1]) state.sim = [null, null];
    for (const t of state.sim)
      if (t) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    state.bed = fitBed(bedW, bedH, w, h);
  }

  function imageToScreen(x: number, y: number): [number, number] {
    return bedToScreen(state.bed, x / bedW, y / bedH, state.w, state.h);
  }
  function setBed(p: Prog): void {
    gl.uniform3fv(p.u("uBedU"), state.bed.u);
    gl.uniform3fv(p.u("uBedV"), state.bed.v);
  }

  function setFish(i: number, sprite: HTMLCanvasElement): void {
    if (i >= MAX_FISH) return;
    const [x, y] = cellOrigin(i);
    gl.bindTexture(gl.TEXTURE_2D, atlas);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, sprite);
    atlasDirty = true;
  }

  function drawQuad(): void {
    gl.bindVertexArray(quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function bindTex(unit: number, tex: WebGLTexture | null): void {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
  }
  let lightDir: Vec3 = [-0.45, 0.45, 0.77];
  let lightK = 1;

  function drawElements(b: Batch): void {
    gl.bindVertexArray(spriteVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, b.f.subarray(0, b.nv * STRIDE), gl.STREAM_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, b.ix.subarray(0, b.ni), gl.STREAM_DRAW);
    gl.drawElements(gl.TRIANGLES, b.ni, gl.UNSIGNED_INT, 0);
  }
  function drawBatch(
    b: Batch,
    mode: number,
    bias: number,
    causticK: number,
    shadowCloud = 0,
  ): void {
    if (!b.ni) return;
    const p = P.sprite;
    gl.useProgram(p.p);
    gl.uniform3fv(p.u("uLight"), lightDir);
    gl.uniform1f(p.u("uLightK"), lightK);
    gl.uniform1f(p.u("uShadowCloud"), shadowCloud);
    gl.uniform2f(p.u("uView"), state.w, state.h);
    gl.uniform1i(p.u("uMode"), mode);
    gl.uniform1f(p.u("uBias"), bias || 0);
    gl.uniform1f(p.u("uCausticK"), causticK || 0);
    bindTex(0, atlas);
    gl.uniform1i(p.u("uTex"), 0);
    bindTex(1, state.caustic!.tex);
    gl.uniform1i(p.u("uCaustic"), 1);
    bindTex(2, state.cloud!.tex);
    gl.uniform1i(p.u("uCloud"), 2);
    drawElements(b);
  }

  function render(time: number, dt: number, env: Look): void {
    if (lost || gl.isContextLost()) {
      for (const l of LAYERS) batches[l].reset();
      drops.length = 0;
      return;
    }
    if (atlasDirty) {
      gl.bindTexture(gl.TEXTURE_2D, atlas);
      gl.generateMipmap(gl.TEXTURE_2D);
      atlasDirty = false;
    }
    lightDir = env.sun;
    lightK = env.sunK;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    const { w, h } = state;

    if (state.sim[0]) {
      gl.disable(gl.BLEND);
      gl.viewport(0, 0, state.simW, state.simH);
      const aspect = w / h;
      while (drops.length) {
        const batch = drops.splice(0, 24);
        const p = P.drop;
        const arr = new Float32Array(96);
        const minR = (2.6 * h) / state.simH;
        batch.forEach((d, i) => {
          const r = Math.max(d[2]!, minR);
          arr.set([d[0]! / w, 1 - d[1]! / h, r / h, d[3]! * Math.min(1, d[2]! / r + 0.25)], i * 4);
        });
        gl.useProgram(p.p);
        gl.uniform4fv(p.u("uDrops"), arr);
        gl.uniform1i(p.u("uCount"), batch.length);
        gl.uniform1f(p.u("uAspect"), aspect);
        bindTex(0, state.sim[0]!.tex);
        gl.uniform1i(p.u("uState"), 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, state.sim[1]!.fb);
        drawQuad();
        state.sim.reverse();
      }
      state.simAcc = Math.min(state.simAcc + dt * 90, 4);
      const p = P.sim;
      gl.useProgram(p.p);
      gl.uniform2f(p.u("uTexel"), 1 / state.simW, 1 / state.simH);
      gl.uniform1f(p.u("uDamp"), env.rippleDamp);
      gl.uniform1f(p.u("uAspect"), aspect);
      setBed(p);
      bindTex(1, floatTex);
      gl.uniform1i(p.u("uFloat"), 1);
      while (state.simAcc >= 1) {
        state.simAcc -= 1;
        bindTex(0, state.sim[0]!.tex);
        gl.uniform1i(p.u("uState"), 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, state.sim[1]!.fb);
        drawQuad();
        state.sim.reverse();
      }
    } else drops.length = 0;

    gl.disable(gl.BLEND);
    let p = P.caustic;
    if (env.caustic > 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, state.caustic!.fb);
      gl.viewport(0, 0, state.caustic!.w, state.caustic!.h);
      gl.useProgram(p.p);
      gl.uniform1f(p.u("uTime"), time);
      gl.uniform1f(p.u("uCell"), env.causticCell);
      gl.uniform2f(p.u("uView"), w, h);
      bindTex(0, noiseTex);
      gl.uniform1i(p.u("uNoise"), 0);
      drawQuad();
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, state.cloud!.fb);
    gl.viewport(0, 0, state.cloud!.w, state.cloud!.h);
    p = P.cloud;
    gl.useProgram(p.p);
    const unit = Math.max(w, h) * 4.2;
    gl.uniform2f(p.u("uView"), w, h);
    gl.uniform1f(p.u("uTime"), time);
    gl.uniform1f(p.u("uCover"), env.cloudCover);
    gl.uniform1f(p.u("uUnit"), unit);
    gl.uniform2f(p.u("uWind"), env.cloudWind[0] / unit, env.cloudWind[1] / unit);
    bindTex(0, noiseTex);
    gl.uniform1i(p.u("uNoise"), 0);
    drawQuad();

    gl.bindFramebuffer(gl.FRAMEBUFFER, state.shadow!.fb);
    gl.viewport(0, 0, state.shadow!.w, state.shadow!.h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    drawBatch(batches.shadow, 1, 0.15, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, state.shadow!.tex);
    gl.generateMipmap(gl.TEXTURE_2D);

    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, state.scene!.fb);
    gl.viewport(0, 0, state.scene!.w, state.scene!.h);
    p = P.bed;
    gl.useProgram(p.p);
    setBed(p);
    gl.uniform1f(p.u("uCausticK"), env.caustic);
    gl.uniform1f(p.u("uCausticFloor"), env.causticFloor);
    gl.uniform1f(p.u("uShadowK"), env.shadow);
    gl.uniform3fv(p.u("uCausticTint"), env.causticTint);
    gl.uniform1f(p.u("uDepthK"), env.depth);
    gl.uniform3fv(p.u("uDeepTint"), [...DEEP_TINT]);
    gl.uniform1f(p.u("uBedSoft"), env.bedSoft);
    gl.uniform1f(p.u("uPosterize"), env.posterize);
    gl.uniform1f(p.u("uPosterMix"), env.posterMix);
    gl.uniform1f(p.u("uPaperMix"), env.paperMix);
    gl.uniform1f(p.u("uPaperLift"), env.paperLift);
    gl.uniform3fv(p.u("uPaper"), PAPER);
    gl.uniform1f(p.u("uBedLod"), Math.max(0, -Math.log2(Math.max(w / bedW, h / bedH))));
    const fo = 11 * Math.min(1.2, Math.min(w, h) / 800);
    const bu = state.bed.u;
    const bv = state.bed.v;
    const sx = (env.shadowDir[0] * fo) / w;
    const sy = (env.shadowDir[1] * fo) / h;
    gl.uniform2f(p.u("uFloatShift"), bu[0] * sx + bu[1] * sy, bv[0] * sx + bv[1] * sy);
    gl.uniform2f(p.u("uShadowTexel"), 1 / state.shadow!.w, 1 / state.shadow!.h);
    bindTex(0, bedTex);
    gl.uniform1i(p.u("uBed"), 0);
    bindTex(1, state.shadow!.tex);
    gl.uniform1i(p.u("uShadow"), 1);
    bindTex(2, state.caustic!.tex);
    gl.uniform1i(p.u("uCaustic"), 2);
    bindTex(3, floatTex);
    gl.uniform1i(p.u("uFloat"), 3);
    bindTex(4, state.cloud!.tex);
    gl.uniform1i(p.u("uCloud"), 4);
    bindTex(5, depthTex);
    gl.uniform1i(p.u("uDepth"), 5);
    bindTex(6, waterTex);
    gl.uniform1i(p.u("uWater"), 6);
    drawQuad();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    drawBatch(batches.under, 0, -0.9, env.caustic * 0.35);

    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, state.surface!.fb);
    gl.viewport(0, 0, state.surface!.w, state.surface!.h);
    p = P.surface;
    gl.useProgram(p.p);
    gl.uniform2f(p.u("uView"), w, h);
    gl.uniform2f(p.u("uSimTexel"), 1 / state.simW, 1 / state.simH);
    gl.uniform1f(p.u("uTime"), time);
    gl.uniform1f(p.u("uRipple"), state.sim[0] ? env.ripple : 0);
    gl.uniform1f(p.u("uWaveAmp"), env.wave);
    gl.uniform3fv(p.u("uSun"), env.sun);
    bindTex(0, state.sim[0] ? state.sim[0]!.tex : noiseTex);
    gl.uniform1i(p.u("uHeight"), 0);
    bindTex(1, waveTex);
    gl.uniform1i(p.u("uWaves"), 1);
    bindTex(2, noiseTex);
    gl.uniform1i(p.u("uNoise"), 2);
    drawQuad();

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    p = P.final;
    gl.useProgram(p.p);
    gl.uniform2f(p.u("uView"), w, h);
    gl.uniform1f(p.u("uRefract"), env.refract);
    gl.uniform1f(p.u("uGlint"), env.glint);
    gl.uniform1f(p.u("uSkyK"), env.skyK);
    gl.uniform1f(p.u("uVignette"), env.vignette);
    gl.uniform1f(p.u("uMoon"), env.moon);
    gl.uniform1f(p.u("uMoonFloor"), env.moonFloor);
    gl.uniform1f(p.u("uSheenFloor"), env.sheenFloor);
    gl.uniform1f(p.u("uBright"), env.bright);
    gl.uniform1f(p.u("uSat"), env.sat);
    gl.uniform1f(p.u("uShade"), env.shade);
    gl.uniform3fv(p.u("uGlintColor"), env.glintColor);
    gl.uniform3fv(p.u("uSky"), env.sky);
    gl.uniform3fv(p.u("uTint"), env.tint);
    gl.uniform3fv(p.u("uSun"), env.sun);
    gl.uniform1f(p.u("uCloudShade"), env.cloudShade);
    gl.uniform1f(p.u("uMist"), env.mist);
    gl.uniform1f(p.u("uFlash"), env.flash);
    gl.uniform1f(p.u("uGrain"), env.grain);
    setBed(p);
    gl.uniform4fv(p.u("uMoonDisc"), env.moonDisc);
    gl.uniform1f(p.u("uTime"), time);
    bindTex(0, state.scene!.tex);
    gl.uniform1i(p.u("uScene"), 0);
    bindTex(1, state.surface!.tex);
    gl.uniform1i(p.u("uSurface"), 1);
    bindTex(2, noiseTex);
    gl.uniform1i(p.u("uNoise"), 2);
    bindTex(3, floatTex);
    gl.uniform1i(p.u("uFloat"), 3);
    bindTex(4, state.cloud!.tex);
    gl.uniform1i(p.u("uCloud"), 4);
    bindTex(5, waterTex);
    gl.uniform1i(p.u("uWater"), 5);
    drawQuad();

    if (batches.floaters.ni) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      p = P.floater;
      gl.useProgram(p.p);
      gl.uniform2f(p.u("uView"), w, h);
      gl.uniform1f(p.u("uBright"), env.bright);
      gl.uniform1f(p.u("uSat"), env.sat);
      gl.uniform1f(p.u("uVignette"), env.vignette);
      gl.uniform1f(p.u("uShade"), env.shade);
      gl.uniform3fv(p.u("uTint"), env.tint);
      gl.uniform1f(p.u("uSnow"), env.snowCover);
      gl.uniform1f(p.u("uSkyK"), env.skyK);
      gl.uniform3fv(p.u("uSky"), env.sky);
      gl.uniform1f(p.u("uWet"), env.wetCover);
      gl.uniform1f(p.u("uRain"), env.rainK);
      gl.uniform1f(p.u("uTime"), time);
      gl.uniform1f(p.u("uCloudShade"), env.cloudShade);
      gl.uniform1f(p.u("uMist"), env.mist);
      gl.uniform1f(p.u("uFlash"), env.flash);
      bindTex(0, bedTex);
      gl.uniform1i(p.u("uBed"), 0);
      bindTex(1, state.surface!.tex);
      gl.uniform1i(p.u("uSurface"), 1);
      bindTex(2, noiseTex);
      gl.uniform1i(p.u("uNoise"), 2);
      bindTex(3, state.cloud!.tex);
      gl.uniform1i(p.u("uCloud"), 3);
      drawElements(batches.floaters);
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    drawBatch(batches.surface, 0, 0, 0);
    drawBatch(batches.airShadow, 1, 2.6, 0, 1);
    drawBatch(batches.air, 0, -0.2, 0);
    gl.blendFunc(gl.ONE, gl.ONE);
    drawBatch(batches.glow, 2, 0, 0);
    for (const l of LAYERS) batches[l].reset();
  }

  return {
    kind: "webgl2",
    ripples: !!floatRT,
    sprites,
    canvas,
    resize,
    imageToScreen,
    setFish,
    render,
    depthAt(x, y) {
      return depthAtScreen(depth, state.bed, state.w, state.h, x, y);
    },
    drop(x, y, r, s) {
      if (drops.length < 96) drops.push([x, y, r, s]);
    },
    floater(
      ix,
      iy,
      irx,
      iry,
      rot,
      angle,
      dx,
      dy,
      push,
      snowK = 1,
      wetKind = 1,
      pool = 0,
      seed = 0,
    ) {
      const b = batches.floaters;
      const [sx, sy] = imageToScreen(ix, iy);
      const m = 1.08;
      const [x0, y0] = imageToScreen(0, 0);
      const [x1, y1] = imageToScreen(1, 0);
      const k = Math.hypot(x1 - x0, y1 - y0);
      const turn = (state.bed.turn * Math.PI) / 2;
      const cr = Math.cos(rot);
      const sr = Math.sin(rot);
      const ca = Math.cos(rot + angle + turn);
      const sa = Math.sin(rot + angle + turn);
      const n = b.nv;
      const pr = Math.max(irx, iry) * k + 3;
      const probe: Vec4 = [sx / state.w, 1 - sy / state.h, pr / state.w, pr / state.h];
      b.ensure(4, 6);
      const corners: [number, number][] = [
        [-m, -m],
        [m, -m],
        [m, m],
        [-m, m],
      ];
      for (const [lx, ly] of corners) {
        const ex = lx * irx;
        const ey = ly * iry;
        b.vert(
          sx + dx + (ex * ca - ey * sa) * k,
          sy + dy + (ex * sa + ey * ca) * k,
          (ix + ex * cr - ey * sr) / bedW,
          (iy + ex * sr + ey * cr) / bedH,
          [lx, ly, push, snowK],
          probe,
          wetKind,
          pool,
          seed,
        );
      }
      b.ix.set([n, n + 1, n + 2, n, n + 2, n + 3], b.ni);
      b.ni += 6;
    },
    sprite(layer, def: SpriteDef, x, y, angle, sx, sy, color: Vec4 = WHITE, fog?: Vec4) {
      const b = batches[layer];
      b.ensure(4, 6);
      const c = spriteCorners(def, x, y, angle, sx, sy);
      const n = b.nv;
      b.vert(c[0]![0], c[0]![1], def.u0, def.v0, color, fog);
      b.vert(c[1]![0], c[1]![1], def.u1, def.v0, color, fog);
      b.vert(c[2]![0], c[2]![1], def.u1, def.v1, color, fog);
      b.vert(c[3]![0], c[3]![1], def.u0, def.v1, color, fog);
      b.ix.set([n, n + 1, n + 2, n, n + 2, n + 3], b.ni);
      b.ni += 6;
    },
    fish(
      layer,
      cell,
      pose,
      s,
      cx,
      cy,
      k,
      color: Vec4 = WHITE,
      fog?: Vec4,
      dx = 0,
      dy = 0,
      light?: BodyLight,
    ) {
      if (cell >= MAX_FISH) return;
      const b = batches[layer];
      const n = BODY.segments;
      const [ox, oy] = cellOrigin(cell);
      const hh = BODY.half * s * k;
      const v0 = oy / ATLAS;
      const v1 = (oy + CELL_H) / ATLAS;
      const u0 = ox / ATLAS;
      const du = CELL_W / ATLAS;
      b.ensure((n + 3) * 2, (n + 2) * 6);
      const first = b.nv;
      for (let j = -1; j <= n + 1; j++) {
        const i = Math.max(0, Math.min(n, j));
        let px = pose[i * 4]!;
        let py = pose[i * 4 + 1]!;
        const nx = pose[i * 4 + 2]!;
        const ny = pose[i * 4 + 3]!;
        if (j === -1 || j === n + 1) {
          const sgn = j < 0 ? 1 : -1;
          px += ny * 2 * s * sgn;
          py -= nx * 2 * s * sgn;
        }
        const lx = j === -1 ? 36 : j === n + 1 ? -60 : BODY.nose - i * SEG_UNITS;
        const u = u0 + ((lx - BODY.left) / BODY.width) * du;
        const X = cx + (px - cx) * k + dx;
        const Y = cy + (py - cy) * k + dy;
        const wn = light && j >= 0 && j <= n ? light.widths[i]! : 0;
        const mt = light ? light.metal : 0;
        const gs = light ? light.gloss : 0;
        b.vert(X - nx * hh, Y - ny * hh, u, v0, color, fog, -1, wn, mt, gs);
        b.vert(X + nx * hh, Y + ny * hh, u, v1, color, fog, 1, wn, mt, gs);
      }
      for (let j = 0; j < n + 2; j++) {
        const a = first + j * 2;
        b.ix.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], b.ni);
        b.ni += 6;
      }
    },
  };
}
