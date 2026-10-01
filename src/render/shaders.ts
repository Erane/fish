export const BED = `vec2 bedUv(vec2 uv){ vec3 s = vec3(uv.x, 1. - uv.y, 1.); return vec2(dot(uBedU, s), dot(uBedV, s)); }`;

export const VS_QUAD = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main(){ vUv = aPos * .5 + .5; gl_Position = vec4(aPos, 0., 1.); }`;

export const FS_DROP = `#version 300 es
precision highp float;
uniform sampler2D uState; uniform vec4 uDrops[24]; uniform int uCount; uniform float uAspect;
in vec2 vUv; out vec4 o;
void main(){
  vec4 s = texture(uState, vUv);
  for (int i = 0; i < 24; i++) {
    if (i >= uCount) break;
    vec4 d = uDrops[i]; float r = length((vUv - d.xy) * vec2(uAspect, 1.)) / d.z;
    if (r < 1.) s.r += (.5 + .5 * cos(r * 3.14159265)) * d.w;
  }
  o = s;
}`;

export const FS_SIM = `#version 300 es
precision highp float;
uniform sampler2D uState, uFloat; uniform vec2 uTexel; uniform vec3 uBedU, uBedV; uniform float uDamp, uAspect;
in vec2 vUv; out vec4 o;
${BED}
void main(){
  vec4 s = texture(uState, vUv);
  float avg = .25 * (texture(uState, vUv + vec2(uTexel.x, 0.)).r + texture(uState, vUv - vec2(uTexel.x, 0.)).r
                   + texture(uState, vUv + vec2(0., uTexel.y)).r + texture(uState, vUv - vec2(0., uTexel.y)).r);
  s.g += (avg - s.r) * 1.9;
  vec2 e = min(vUv, 1. - vUv);
  float edge = smoothstep(0., .04, min(e.x * uAspect, e.y));
  s.g *= mix(.9, uDamp, edge);
  s.r += s.g;
  s.r = mix(s.r, avg, .012) * mix(.95, .9993, edge);
  o = s * (1. - texture(uFloat, bedUv(vUv)).r);
}`;

export const FS_CAUSTIC = `#version 300 es
precision highp float;
uniform float uTime, uCell; uniform vec2 uView; uniform sampler2D uNoise;
in vec2 vUv; out vec4 o;
vec2 hash2(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
float edges(vec2 p, float t){
  vec2 i = floor(p), f = fract(p); float d1 = 9., d2 = 9.;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y)), h = hash2(i + g);
    vec2 c = g + .5 + .38 * sin(t * (.55 + .45 * h.yx) + 6.2831 * h) - f;
    float d = dot(c, c);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return sqrt(d2) - sqrt(d1);
}
void main(){
  vec2 px = vUv * uView;
  vec2 w = texture(uNoise, px / 640. + vec2(uTime * .007, -uTime * .005)).rg - .5;
  vec2 w2 = texture(uNoise, px / 300. + vec2(-uTime * .011, uTime * .008)).ba - .5;
  vec2 p = px / uCell + w * 1.3 + w2 * .5;
  float e1 = edges(p, uTime * .8), e2 = edges(p * 1.55 + 7.3, uTime * 1.1 + 3.);
  float c = pow(1. - smoothstep(0., .2, e1), 3.) + .5 * pow(1. - smoothstep(0., .16, e2), 3.);
  c *= .45 + .9 * texture(uNoise, px / 1200. + uTime * .004).g;
  o = vec4(c, c, c, 1.);
}`;

export const FS_CLOUD = `#version 300 es
precision highp float;
uniform sampler2D uNoise; uniform vec2 uView, uWind; uniform float uTime, uCover, uUnit;
in vec2 vUv; out vec4 o;
void main(){
  vec2 p = vUv * uView / uUnit - uWind * uTime;
  vec2 warp = vec2(texture(uNoise, p * .7 + vec2(.13, uTime * .0011)).a, texture(uNoise, p * .7 + vec2(.61, -uTime * .0009)).g) - .5;
  p += warp * .08;
  float n = texture(uNoise, p).r * .62 + texture(uNoise, p * 2.1 + .31).b * .26 + texture(uNoise, p * 4.3 + .77).g * .12;
  float thr = mix(.63, .37, uCover);
  float shade = smoothstep(thr - .03, thr + .045, n) * (.7 + .3 * smoothstep(thr, thr + .1, n));
  o = vec4(mix(shade, 1., smoothstep(.85, 1., uCover)), 0., 0., 1.);
}`;

export const FS_BED = `#version 300 es
precision highp float;
uniform sampler2D uBed, uShadow, uCaustic, uFloat, uCloud, uDepth, uWater;
uniform vec3 uBedU, uBedV, uDeepTint, uCausticTint, uPaper; uniform vec2 uFloatShift, uShadowTexel; uniform float uCausticK, uCausticFloor, uShadowK, uDepthK, uBedLod, uBedSoft, uPosterize, uPosterMix, uPaperMix, uPaperLift;
in vec2 vUv; out vec4 o;
${BED}
float shadowAt(vec2 uv, float lod){
  vec2 t = uShadowTexel * exp2(lod) * .7;
  return .25 * (textureLod(uShadow, uv + t, lod).a + textureLod(uShadow, uv - t, lod).a + textureLod(uShadow, uv + vec2(t.x, -t.y), lod).a + textureLod(uShadow, uv + vec2(-t.x, t.y), lod).a);
}
void main(){
  vec2 b = bedUv(vUv);
  float wt = texture(uWater, b).r;
  float dep = texture(uDepth, b).r * uDepthK;
  vec3 c = mix(textureLod(uBed, b, uBedLod + dep * uBedSoft).rgb, textureLod(uBed, b, 5.).rgb * .82, texture(uFloat, b).r);
  c = mix(c, floor(c * uPosterize + .5) / uPosterize, uPosterMix);
  c = mix(c, c * (1. - uPaperLift) + uPaper * uPaperLift, uPaperMix);
  c *= mix(vec3(1.), uDeepTint, dep * wt);
  float sun = 1. - texture(uCloud, vUv).r;
  float sh = max(shadowAt(vUv, .3 + (1. - sun) * 1.7), textureLod(uFloat, b - uFloatShift, 2. + (1. - sun)).g * .6) * mix(.42, 1., sun);
  c *= 1. - sh * uShadowK * vec3(1., .86, .72);
  c += texture(uCaustic, vUv).r * uCausticK * uCausticTint * (1. - sh) * mix(uCausticFloor, 1., sun * sun) * (1. - dep * .55) * wt;
  o = vec4(c, 1.);
}`;

export const VS_SPRITE = `#version 300 es
in vec2 aPos; in vec2 aUv; in vec4 aColor; in vec4 aFog; in vec4 aLight;
uniform vec2 uView;
out vec2 vUv; out vec4 vColor; out vec4 vFog; out vec4 vLight; out vec2 vScreen;
void main(){
  vec2 c = aPos / uView * 2. - 1.; c.y = -c.y;
  gl_Position = vec4(c, 0., 1.);
  vScreen = c * .5 + .5; vUv = aUv; vColor = aColor; vFog = aFog; vLight = aLight;
}`;

export const FS_SPRITE = `#version 300 es
precision highp float;
uniform sampler2D uTex, uCaustic, uCloud; uniform int uMode; uniform float uBias, uCausticK, uLightK, uShadowCloud; uniform vec3 uLight;
in vec2 vUv; in vec4 vColor; in vec4 vFog; in vec4 vLight; in vec2 vScreen; out vec4 o;
void main(){
  vec4 t = texture(uTex, vUv, uBias + (uMode == 1 ? vFog.x : 0.));
  vec2 across = vec2(dFdx(vLight.x), dFdy(vLight.x));
  float a = t.a * vColor.a, sun = 1. - texture(uCloud, vScreen).r;
  if (uMode == 1) { o = vec4(0., 0., 0., a * mix(1., .35 + .65 * sun, uShadowCloud)); return; }
  vec3 rgb = t.rgb * vColor.rgb * vColor.a;
  if (vLight.y > .02) {
    float q = vLight.x / vLight.y, lat = clamp(q, -.999, .999); lat = (floor(lat * 3.) + .5) / 3.;
    float body = 1. - smoothstep(.96, 1.02, abs(q)), lk = uLightK * mix(.3, 1., sun);
    vec3 n = vec3(normalize(across + 1e-7) * lat, sqrt(1. - lat * lat)), L = normalize(uLight);
    float sp = pow(max(dot(n, normalize(L + vec3(0., 0., 1.))), 0.), mix(20., 46., vLight.z)) * vLight.w * uLightK * mix(.12, 1., sun);
    vec3 tint = mix(vec3(1., .97, .9), clamp(t.rgb / max(t.a, .01) * 1.3, 0., 1.4), vLight.z * .7);
    rgb = mix(rgb, rgb * (1. + dot(n.xy, normalize(L.xy)) * .22 * lk) + tint * sp * a, body);
  }
  if (uCausticK > 0.) rgb += texture(uCaustic, vScreen).r * uCausticK * a;
  rgb = mix(rgb, vFog.rgb * a, vFog.a);
  o = uMode == 2 ? vec4(rgb, 0.) : vec4(rgb, a);
}`;

export const FS_SURFACE = `#version 300 es
precision highp float;
uniform sampler2D uHeight, uWaves, uNoise;
uniform vec2 uView, uSimTexel; uniform float uTime, uRipple, uWaveAmp; uniform vec3 uSun;
in vec2 vUv; out vec4 o;
void main(){
  vec2 px = vUv * uView, st = uSimTexel * 1.5;
  float hL = texture(uHeight, vUv - vec2(st.x, 0.)).r, hR = texture(uHeight, vUv + vec2(st.x, 0.)).r;
  float hD = texture(uHeight, vUv - vec2(0., st.y)).r, hU = texture(uHeight, vUv + vec2(0., st.y)).r;
  vec2 g = vec2(hR - hL, hU - hD) * uRipple;
  mat2 r1 = mat2(.8, .6, -.6, .8), r2 = mat2(.28, -.96, .96, .28);
  vec2 w1 = texture(uWaves, r1 * px / 560. + vec2(uTime * .010, uTime * .006)).rg * 2. - 1.;
  vec2 w2 = texture(uWaves, r2 * px / 330. + vec2(-uTime * .008, uTime * .011)).rg * 2. - 1.;
  vec2 w3 = texture(uWaves, px / 170. + vec2(uTime * .017, -uTime * .013)).rg * 2. - 1.;
  g += (transpose(r1) * w1 * .55 + transpose(r2) * w2 * .4 + w3 * .22) * uWaveAmp;
  g /= 1. + length(g) * .8;
  vec2 hf = texture(uWaves, px / 44. + vec2(uTime * .09, -uTime * .07)).rg * 2. - 1.;
  vec2 hf2 = texture(uWaves, r2 * px / 27. + vec2(-uTime * .12, uTime * .05)).rg * 2. - 1.;
  vec3 Ng = normalize(vec3(-(g * .6 + (hf + transpose(r2) * hf2) * .2 * (.4 + uWaveAmp)), 1.));
  float patchy = smoothstep(.3, .75, texture(uNoise, px / 480. + vec2(uTime * .012, uTime * .007)).b);
  float glint = pow(max(dot(Ng, normalize(uSun + vec3(0., 0., 1.))), 0.), 1100.) * patchy;
  o = vec4(g * .25 + .5, min(1., glint), 1.);
}`;

export const MIST = `float mistAt(vec2 px, float t){
  float m = texture(uNoise, px / 1100. + vec2(t * .011, t * .004)).r * .6 + texture(uNoise, px / 480. + vec2(-t * .017, t * .009)).a * .4;
  return smoothstep(.36, .72, m);
}`;

export const FS_FINAL = `#version 300 es
precision highp float;
uniform sampler2D uScene, uSurface, uFloat, uNoise, uCloud, uWater;
uniform vec4 uMoonDisc; uniform vec3 uBedU, uBedV; uniform vec2 uView;
uniform float uRefract, uGlint, uSkyK, uVignette, uMoon, uMoonFloor, uSheenFloor, uBright, uSat, uShade, uTime, uCloudShade, uMist, uFlash, uGrain;
uniform vec3 uGlintColor, uSky, uTint, uSun;
in vec2 vUv; out vec4 o;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
${MIST}
${BED}
void main(){
  vec4 sf = texture(uSurface, vUv);
  float wt = texture(uWater, bedUv(vUv)).r;
  vec2 g = (sf.rg - .5) * 4. * wt;
  vec3 N = normalize(vec3(-g, 1.));
  vec3 col = texture(uScene, clamp(vUv + N.xy * uRefract / uView, .001, .999)).rgb;
  float cloud = texture(uCloud, vUv).r, dim = cloud * uCloudShade;
  col *= (1. - dim) * (1. + dot(-g, normalize(uSun.xy)) * uShade * (1. - cloud * .6));
  col = mix(col * vec3(1.025, 1.01, .98), vec3(dot(col, vec3(.299, .587, .114))) * vec3(.93, .99, 1.07), min(1., dim * 1.1));
  col = mix(col, uSky, clamp(uSkyK * wt * (1. + length(g) * 5.) + dim * .06, 0., .6));
  vec3 glint = uGlintColor * sf.b * 2.4 * uGlint * (1. - cloud * .92) * wt, night = vec3(0.), crisp = vec3(0.);
  if (uMoon > 0.) {
    float clear = pow(1. - cloud, 3.);
    vec2 px = vUv * uView, rp = px + g * 22., d = (rp - uMoonDisc.xy) / uMoonDisc.z;
    float r = length(d), s = sqrt(max(0., 1. - d.y * d.y)), k = cos(uMoonDisc.w), illum = .5 - .5 * k;
    float lit = uMoonDisc.w < 3.14159 ? smoothstep(k * s - .07, k * s + .07, d.x) : smoothstep(-k * s + .07, -k * s - .07, d.x);
    float maria = 0.;
    maria += 1. - smoothstep(.16, .3, length(d - vec2(-.32, .3)));
    maria += 1. - smoothstep(.12, .24, length(d - vec2(.18, .36)));
    maria += 1. - smoothstep(.12, .26, length(d - vec2(.36, .06)));
    maria += 1. - smoothstep(.18, .34, length(d - vec2(-.52, -.06)));
    maria += 1. - smoothstep(.08, .2, length(d - vec2(-.08, -.4)));
    float face = (1. - .24 * min(maria, 1.)) * (.9 + .16 * texture(uNoise, d * .5 + .37).r);
    float disc = (1. - smoothstep(.93, 1.03, r)) * mix(.05, 1., lit) * face * (1. - .18 * r * r) * clamp(1. + dot(-g, vec2(-.6, .6)) * 1.4, .35, 1.6);
    crisp += vec3(.93, .92, .86) * disc * .78;
    vec3 halo = vec3(.6, .72, 1.) * (exp(-r * r / 6.) * .2 + exp(-r / 3.5) * .08) * (.3 + .7 * illum);
    glint *= (.3 + exp(-length((px - uMoonDisc.xy) / uMoonDisc.z) / 5.) * 1.3) * (.3 + .7 * illum);
    vec2 cell = floor(rp / 38.), f = fract(rp / 38.) - .5, sp = vec2(hash(cell + 3.1), hash(cell + 7.7)) - .5;
    float h = hash(cell), q = dot(f - sp * .7, f - sp * .7);
    if (h > .965) crisp += vec3(.8, .86, 1.) * exp(-q * 420.) * (.55 + .45 * sin(uTime * (1. + h * 3.) + h * 40.)) * (.6 + 3. * (h - .965));
    vec2 toMoon = normalize(uMoonDisc.xy - px + 1e-4);
    float reach = exp(-length(px - uMoonDisc.xy) / (uMoonDisc.z * 16.));
    vec3 sheen = vec3(.55, .66, .9) * (max(0., dot(-g, toMoon)) * .6 + length(g) * .14) * (.35 + .65 * reach) * (.4 + .6 * illum);
    night = (halo * max(uMoonFloor, clear) + (sheen + glint) * max(uSheenFloor, clear) + crisp * clear) * uMoon * wt;
    glint = vec3(0.);
  }
  col += glint;
  vec3 fm = texture(uFloat, bedUv(vUv)).rgb;
  col *= 1. - fm.b * (1. - fm.r) * .22;
  float l = dot(col, vec3(.299, .587, .114));
  col = mix(vec3(l), col, uSat) * uBright * uTint + night;
  if (uMist > 0.) col = mix(col, uSky * uBright * 1.08, mistAt(vUv * uView, uTime) * uMist);
  col += uFlash * (col * 1.3 + vec3(.1, .12, .16));
  col += (texture(uNoise, vUv * uView / 128.).a - .5) * uGrain;
  vec2 v = vUv - .5;
  col *= 1. - dot(v, v) * uVignette;
  o = vec4(col, 1.);
}`;

export const VS_FLOAT = `#version 300 es
in vec2 aPos; in vec2 aUv; in vec4 aColor; in vec4 aFog; in vec4 aLight;
uniform vec2 uView; uniform sampler2D uSurface;
out vec2 vUv; out vec2 vLocal; out vec2 vScreen; out vec2 vTilt; out float vSnowK; out float vWet; out float vPool; out float vSeed;
void main(){
  vec2 c = aFog.xy, r = aFog.zw; vSnowK = aColor.w; vWet = aLight.x; vPool = aLight.y; vSeed = aLight.z;
  vec2 g = texture(uSurface, c + vec2(r.x, 0.)).rg + texture(uSurface, c - vec2(r.x, 0.)).rg + texture(uSurface, c + vec2(0., r.y)).rg + texture(uSurface, c - vec2(0., r.y)).rg;
  g = (g * .25 - .5) * 4.; vTilt = vec2(-g.x, g.y);
  vec2 q = (aPos + vec2(-g.x, g.y) * aColor.z) / uView * 2. - 1.; q.y = -q.y;
  gl_Position = vec4(q, 0., 1.); vUv = aUv; vLocal = aColor.xy; vScreen = q * .5 + .5;
}`;

export const FS_FLOAT = `#version 300 es
precision highp float;
uniform sampler2D uBed, uSurface, uNoise, uCloud; uniform vec2 uView;
uniform float uBright, uSat, uVignette, uShade, uSnow, uSkyK, uWet, uRain, uTime, uCloudShade, uMist, uFlash; uniform vec3 uTint, uSky;
in vec2 vUv; in vec2 vLocal; in vec2 vScreen; in vec2 vTilt; in float vSnowK; in float vWet; in float vPool; in float vSeed; out vec4 o;
${MIST}
void main(){
  float e = length(vLocal), a = 1. - smoothstep(1. - fwidth(e) * 1.6, 1., e), snow = uSnow * vSnowK;
  vec3 c = texture(uBed, vUv).rgb * (1. + uShade * .15);
  if (uWet > 0.) {
    float lum = dot(c, vec3(.299, .587, .114));
    if (vWet > .05) {
      c = mix(vec3(lum), c, 1. + .45 * uWet * vWet) * (1. - .1 * uWet * vWet);
      vec2 bq = mat2(.8, -.6, .6, .8) * vUv * 62. + .37;
      float wetPatch = smoothstep(.3, .62, texture(uNoise, vUv * 9. + .63).b + (.55 - e) * .45);
      float n1 = texture(uNoise, bq).r, n2 = texture(uNoise, mat2(.6, .8, -.8, .6) * vUv * 118. + .71).g;
      float bead = smoothstep(.6, .74, n1) * (.6 + .4 * smoothstep(.42, .68, n2)) * uWet * wetPatch * vWet * clamp(mix(1.4, .3, e), 0., 1.);
      float toLight = n1 - texture(uNoise, bq - .006).r, core = smoothstep(.7, .84, n1);
      float glint = smoothstep(.012, .045, toLight), focus = smoothstep(.012, .05, -toLight) * core;
      c *= 1. - bead * (.42 - core * .18);
      c += vec3(1., 1., .97) * bead * (glint * .9 + focus * .3) * (.85 + .15 * sin(uTime * .6 + n1 * 40. + n2 * 25.));
      if (vPool > 0.) {
        vec2 pc = vLocal - vec2(.04, .06) - vTilt * .12;
        float pr = (.1 + .17 * smoothstep(.1, 1., uWet)) * vPool;
        float ang = atan(pc.y, pc.x);
        float pe = length(pc) / (1. + .16 * sin(ang * 3. + vSeed * 20.) + .08 * sin(ang * 5. - vSeed * 11.)) + (texture(uNoise, vUv * 13. + vSeed).r - .5) * .05;
        float pool = (1. - smoothstep(pr - .025, pr + .003, pe)) * smoothstep(.05, .35, uWet);
        float beat = uTime * (.45 + .9 * uRain) + vSeed * 7., age = fract(beat);
        float fired = step(.35, fract(sin(floor(beat) * 12.9898 + vSeed * 78.2) * 43758.5));
        float ring = exp(-pow((pe - age * pr * 1.05) / (pr * .07 + .004), 2.)) * (1. - age) * fired;
        float q = pe / pr, toward = dot(normalize(pc + 1e-4), vec2(-.7071));
        float band = smoothstep(.62, .95, q), glint = smoothstep(.55, .85, q) * (1. - smoothstep(.85, .98, q)) * smoothstep(.55, .95, toward);
        float crescent = smoothstep(.7, .92, q) * (1. - smoothstep(.92, 1., q)) * smoothstep(.3, .9, -toward);
        vec3 water = c * mix(.86, .5, band) + uSky * .1 + vec3(1.) * (glint * .55 + crescent * .28 + ring * .22);
        c = mix(c, water, pool);
      }
    } else {
      c = mix(vec3(lum), c, 1. + .3 * uWet) * (1. - .12 * uWet);
      float bandId = floor(vUv.x * 140.);
      float strength = fract(sin(bandId * 12.9898) * 43758.5453);
      float run = texture(uNoise, vec2(bandId / 91. + .5, vUv.y * 2.2)).r;
      float streak = smoothstep(.35, .7, strength * .85 + run * .3 - .05) * smoothstep(0., .35, fract(vUv.x * 140.)) * smoothstep(1., .65, fract(vUv.x * 140.));
      float base = .6 + .4 * vLocal.y;
      float drop = smoothstep(.82, .93, texture(uNoise, vUv * 96.).g) * (.75 + .25 * sin(uTime * .8 + strength * 40.));
      float w = uWet * mix(.35, 1., streak) * base;
      c *= 1. - w * .26;
      c += (uSky * .9 + .1) * w * (streak * .18 + drop * .55);
      float top = smoothstep(.35, -.75, vLocal.y) * (1. - smoothstep(.55, 1., e));
      c += (uSky * .9 + .1) * uWet * top * smoothstep(.5, .78, texture(uNoise, vUv * 40.).g) * .22;
    }
  }
  float n = texture(uNoise, vUv * 7.).r * .7 + texture(uNoise, vUv * 23.).g * .3 - e * .25;
  c = mix(c, vec3(.93, .95, .98), smoothstep(.72 - .55 * snow, .82 - .5 * snow, n) * min(1., snow * 2.) * .9);
  float dim = texture(uCloud, vScreen).r * uCloudShade;
  c *= 1. - dim;
  c = mix(c * vec3(1.025, 1.01, .98), vec3(dot(c, vec3(.299, .587, .114))) * vec3(.93, .99, 1.07), min(1., dim * 1.1));
  c = mix(c, uSky, uSkyK * .8);
  float l = dot(c, vec3(.299, .587, .114));
  c = mix(vec3(l), c, uSat) * uBright * uTint;
  if (uMist > 0.) c = mix(c, uSky * uBright * 1.08, mistAt(vScreen * uView, uTime) * uMist);
  c += uFlash * (c * 1.3 + vec3(.1, .12, .16));
  vec2 v = vScreen - .5;
  c *= 1. - dot(v, v) * uVignette;
  o = vec4(c * a, a);
}`;
