import type { Music, Settings, WaterType } from "../core/types.ts";
import {
  AMBIENT_SYNTH,
  band,
  BOWLS,
  GUQIN,
  noise,
  pluck,
  rand,
  struck,
  TUBES,
  weatherLayers,
} from "./synth.ts";
import type { SceneState, WeatherLoop } from "./synth.ts";

type WaterLoop = "stream" | "spring" | "cascade" | "lapping" | "trickle";
type LoopName = WaterLoop | WeatherLoop;

interface Layer {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

interface AudioOpts {
  water: boolean;
  waterType: WaterType;
  waterVol: number;
  weatherSound: boolean;
  weatherVol: number;
  music: Music;
  musicVol: number;
  sfx: boolean;
  volume: number;
}

const WATER_LOOP: Record<WaterType, WaterLoop> = {
  stream: "stream",
  spring: "spring",
  cascade: "cascade",
  lapping: "lapping",
  bamboo: "trickle",
};

export class PondAudio {
  active = false;
  private context: AudioContext | null = null;
  private master!: GainNode;
  private waterBus!: GainNode;
  private weatherBus!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private reverb!: ConvolverNode;
  private readonly layers: Partial<Record<LoopName, Layer>> = {};
  private readonly buffers: Record<string, AudioBuffer> = {};
  private readonly events: Record<string, number> = {};
  private timer = 0;
  private next = 0;
  private phrase = 0;
  private degree = 0;
  private opts: AudioOpts = {
    water: true,
    waterType: "stream",
    waterVol: 0.6,
    weatherSound: true,
    weatherVol: 0.6,
    music: "guqin",
    musicVol: 0.5,
    sfx: true,
    volume: 0.7,
  };
  private scene: SceneState = { weather: "sunny", night: false, rain: 0.5 };

  configure(settings: Settings): void {
    this.opts = {
      water: settings.water,
      waterType: settings.waterType,
      waterVol: settings.waterVol,
      weatherSound: settings.weatherSound,
      weatherVol: settings.weatherVol,
      music: settings.music,
      musicVol: settings.musicVol,
      sfx: settings.sfx,
      volume: settings.volume,
    };
    this.scene = { weather: settings.weather, night: settings.night, rain: settings.rainAmount };
    if (!this.context) return;
    this.applyGains();
    this.refresh();
  }

  private setup(): void {
    const ctx = (this.context = new AudioContext());
    this.master = ctx.createGain();
    this.master.gain.value = this.opts.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);

    const len = Math.floor(ctx.sampleRate * 3.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let y = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const a = 0.2 + 0.75 * t;
        y = (1 - a) * (Math.random() * 2 - 1) + a * y;
        d[i] = y * Math.pow(1 - t, 2.2) * (i < 200 ? i / 200 : 1);
      }
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.reverb.connect(wet).connect(this.master);

    const bus = (verb: number): GainNode => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.master);
      if (verb) {
        const v = ctx.createGain();
        v.gain.value = verb;
        g.connect(v).connect(this.reverb);
      }
      return g;
    };
    this.waterBus = bus(0);
    this.weatherBus = bus(0.18);
    this.musicBus = bus(1);
    this.sfxBus = bus(0.12);
    this.sfxBus.gain.value = 0.8;
    this.applyGains();
  }

  private applyGains(): void {
    const now = this.context!.currentTime;
    const o = this.opts;
    this.master.gain.setTargetAtTime(o.volume, now, 0.1);
    this.waterBus.gain.setTargetAtTime(o.water ? o.waterVol * 0.7 : 0, now, 0.3);
    this.weatherBus.gain.setTargetAtTime(o.weatherSound ? o.weatherVol * 0.75 : 0, now, 0.3);
    this.musicBus.gain.setTargetAtTime(o.musicVol * 0.9, now, 0.3);
  }

  private buffer(name: string, make: () => [number, Float32Array[]]): AudioBuffer {
    let b = this.buffers[name];
    if (!b) {
      const [sr, chans] = make();
      b = this.context!.createBuffer(chans.length, chans[0].length, sr);
      chans.forEach((d, i) => b!.copyToChannel(d as Float32Array<ArrayBuffer>, i));
      this.buffers[name] = b;
    }
    return b;
  }

  private loopBuffer(name: LoopName): AudioBuffer {
    const sr = name.startsWith("rain") ? 32000 : 22050;
    return this.buffer(name, () => {
      switch (name) {
        case "rainLight":
          return [sr, AMBIENT_SYNTH.rain(sr, 0.25)];
        case "rainHeavy":
          return [sr, AMBIENT_SYNTH.rain(sr, 1)];
        case "stream":
          return [sr, AMBIENT_SYNTH.stream(sr)];
        case "spring":
          return [sr, AMBIENT_SYNTH.spring(sr)];
        case "cascade":
          return [sr, AMBIENT_SYNTH.cascade(sr)];
        case "lapping":
          return [sr, AMBIENT_SYNTH.lapping(sr)];
        case "trickle":
          return [sr, AMBIENT_SYNTH.trickle(sr)];
        case "night":
          return [sr, AMBIENT_SYNTH.night(sr)];
      }
    });
  }

  private refresh(): void {
    const ctx = this.context!;
    const now = ctx.currentTime;
    const want: Partial<Record<LoopName, { level: number; bus: AudioNode }>> = {};
    if (this.active) {
      want[WATER_LOOP[this.opts.waterType]] = { level: 1, bus: this.waterBus };
      for (const [k, v] of Object.entries(weatherLayers(this.scene)))
        want[k as WeatherLoop] = { level: v!, bus: this.weatherBus };
    }
    const names = new Set<LoopName>([
      ...(Object.keys(this.layers) as LoopName[]),
      ...(Object.keys(want) as LoopName[]),
    ]);
    for (const name of names) {
      let layer = this.layers[name];
      if (!layer && want[name]) {
        const src = ctx.createBufferSource();
        const gain = ctx.createGain();
        src.buffer = this.loopBuffer(name);
        src.loop = true;
        gain.gain.value = 0;
        src.connect(gain).connect(want[name]!.bus);
        src.start(now, Math.random() * src.buffer.duration);
        layer = this.layers[name] = { src, gain };
      }
      if (!layer) continue;
      const level = want[name] ? want[name]!.level : 0;
      layer.gain.gain.cancelScheduledValues(now);
      layer.gain.gain.setTargetAtTime(level, now, 1.2);
      if (!level) {
        const done = layer;
        delete this.layers[name];
        setTimeout(() => {
          try {
            done.src.stop();
          } catch {
            /* already stopped */
          }
        }, 6000);
      }
    }
    if (this.active && !this.timer) {
      this.next = Math.max(this.next, now + 1.5);
      this.phrase = 0;
      this.timer = setInterval(() => {
        this.schedule();
        this.weatherEvents();
        this.waterEvents();
      }, 250);
    } else if (!this.active && this.timer) {
      clearInterval(this.timer);
      this.timer = 0;
    }
  }

  private play(
    buf: AudioBuffer,
    when: number,
    gain: number,
    rate = 1,
    pan = 0,
    bus: AudioNode = this.musicBus,
  ): AudioBufferSourceNode {
    const ctx = this.context!;
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = buf;
    src.playbackRate.value = rate;
    g.gain.value = gain;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      src.connect(g).connect(p).connect(bus);
    } else src.connect(g).connect(bus);
    src.start(when);
    return src;
  }

  private schedule(): void {
    const ctx = this.context;
    if (!ctx || ctx.state !== "running" || this.opts.music === "off") return;
    if (this.next < ctx.currentTime - 0.5) this.next = ctx.currentTime + rand(0.5, 2);
    while (this.next < ctx.currentTime + 1.2) {
      const t = this.next;
      const m = this.opts.music;
      if (m === "guqin") this.guqin(t);
      else if (m === "bowl") {
        const i = Math.floor(rand(0, BOWLS.length));
        this.play(
          this.buffer(`bowl${i}`, () => [
            44100,
            [
              struck(
                44100,
                BOWLS[i],
                16,
                [
                  [1, 1, 9, 0.9],
                  [2.71, 0.45, 5.5, 1.6],
                  [5.2, 0.2, 3, 2.3],
                  [8.4, 0.08, 1.8, 3],
                ],
                0.15,
              ),
            ],
          ]),
          t,
          rand(0.7, 0.95),
          1,
          rand(-0.3, 0.3),
        );
        this.next = t + rand(13, 24);
      } else {
        const strikes = 2 + Math.floor(rand(0, 6));
        let s = t;
        for (let k = 0; k < strikes; k++) {
          const i = Math.floor(rand(0, TUBES.length));
          this.play(
            this.buffer(`tube${i}`, () => [
              44100,
              [
                struck(
                  44100,
                  TUBES[i],
                  6,
                  [
                    [1, 0.9, 3.2, 0.4],
                    [2.756, 0.5, 1.8, 0.9],
                    [5.404, 0.25, 0.9, 1.4],
                  ],
                  0.35,
                ),
              ],
            ]),
            s,
            rand(0.18, 0.45),
            1,
            rand(-0.7, 0.7),
          );
          s += rand(0.08, 0.45);
        }
        this.next = s + rand(6, 16);
      }
    }
  }

  private guqin(t: number): void {
    if (!this.phrase) {
      this.phrase = 3 + Math.floor(rand(0, 5));
      this.degree = Math.floor(rand(2, 8));
    }
    this.degree = Math.max(
      0,
      Math.min(GUQIN.length - 1, this.degree + [-2, -1, -1, 0, 1, 1, 2][Math.floor(rand(0, 7))]),
    );
    const i = this.degree;
    const note = this.buffer(`qin${i}`, () => [44100, [pluck(44100, GUQIN[i], 5)]]);
    const roll = Math.random();
    if (roll < 0.12) {
      const ctx = this.context!;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = GUQIN[i] * (Math.random() < 0.5 ? 2 : 4);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + 2.6);
      o.connect(g).connect(this.musicBus);
      o.start(t);
      o.stop(t + 2.7);
    } else {
      const src = this.play(note, t, rand(0.5, 0.85), 1, rand(-0.25, 0.25));
      if (roll > 0.8 && i > 0) {
        src.playbackRate.setValueAtTime(GUQIN[i - 1] / GUQIN[i], t);
        src.playbackRate.linearRampToValueAtTime(1, t + 0.28);
      } else if (roll > 0.65) {
        for (let k = 0; k < 6; k++)
          src.playbackRate.setValueAtTime(1 + (k % 2 ? 0.006 : -0.006), t + 0.35 + k * 0.16);
        src.playbackRate.setValueAtTime(1, t + 1.3);
      }
    }
    this.phrase--;
    this.next = t + (this.phrase ? (Math.random() < 0.15 ? 0.18 : rand(0.5, 1.4)) : rand(4.5, 10));
  }

  private weatherEvents(): void {
    const ctx = this.context;
    if (!ctx || ctx.state !== "running" || !this.opts.weatherSound) return;
    const now = ctx.currentTime;
    const { weather, night, rain } = this.scene;
    const e = this.events;
    const due = (k: string, gap: () => number): boolean => {
      if (!(e[k] > now - 1)) e[k] = now + gap();
      return e[k] < now + 0.5;
    };
    if (weather === "rain") {
      while (due("drop", () => rand(0, 0.3))) {
        this.raindrop(e.drop);
        e.drop += -Math.log(1 - Math.random()) / (2 + 14 * rain);
      }
    } else if (weather === "snow") {
      if (due("crow", () => rand(6, 18))) {
        this.crow(e.crow);
        e.crow += rand(25, 60);
      }
    } else if (night) {
      if (due("frog", () => rand(1, 5))) {
        this.frog(e.frog);
        e.frog += rand(3, 11);
      }
    } else {
      if (due("bird", () => rand(1, 4))) {
        this.bird(e.bird);
        e.bird += weather === "sunny" ? rand(3, 9) : rand(9, 22);
      }
      if (weather === "sunny" && due("dove", () => rand(8, 20))) {
        this.dove(e.dove);
        e.dove += rand(22, 45);
      }
      if (weather === "cloudy" && due("cuckoo", () => rand(6, 16))) {
        this.cuckoo(e.cuckoo);
        e.cuckoo += rand(20, 40);
      }
    }
  }

  private waterEvents(): void {
    const ctx = this.context;
    if (!ctx || ctx.state !== "running" || !this.opts.water || this.opts.waterType !== "bamboo")
      return;
    const now = ctx.currentTime;
    const e = this.events;
    if (!(e.knock > now - 1)) e.knock = now + rand(3, 8);
    if (e.knock < now + 0.5) {
      this.knock(e.knock);
      e.knock += rand(16, 30);
    }
  }

  private knock(t: number): void {
    this.tone(t, 520, 470, 0.16, 0.32, 0.15, this.waterBus, "sine", 0.001);
    this.tone(t, 1380, 1250, 0.06, 0.12, 0.15, this.waterBus, "triangle", 0.001);
    this.tone(t + 0.55, 560, 500, 0.1, 0.1, 0.15, this.waterBus, "sine", 0.001);
    const ctx = this.context!;
    const src = ctx.createBufferSource();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    src.buffer = this.buffer("pour", () => [22050, [band(noise(22050), 400, 3200, 22050)]]);
    f.type = "lowpass";
    f.frequency.value = 2600;
    g.gain.setValueAtTime(0, t + 0.03);
    g.gain.linearRampToValueAtTime(0.35, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    src.connect(f).connect(g).connect(this.waterBus);
    src.start(t + 0.03);
    src.stop(t + 1);
    for (let k = 0; k < 5; k++) {
      const f0 = rand(500, 1100);
      this.tone(
        t + 0.1 + k * rand(0.05, 0.12),
        f0,
        f0 * 1.8,
        0.06,
        0.1,
        rand(-0.2, 0.4),
        this.waterBus,
        "sine",
        0.002,
      );
    }
  }

  private cuckoo(t: number): void {
    const f = rand(620, 700);
    const pan = rand(-0.8, 0.8);
    for (let k = 0; k < 2 + Math.floor(rand(0, 2)); k++) {
      this.tone(t + k * 0.9, f, f * 0.97, 0.28, 0.06, pan, this.weatherBus, "sine", 0.03);
      this.tone(
        t + k * 0.9 + 0.32,
        f * 0.8,
        f * 0.77,
        0.36,
        0.055,
        pan,
        this.weatherBus,
        "sine",
        0.03,
      );
    }
  }

  private crow(t: number): void {
    const ctx = this.context!;
    const pan = rand(-0.8, 0.8);
    for (let k = 0; k < 2 + Math.floor(rand(0, 2)); k++) {
      const s = t + k * rand(0.45, 0.7);
      const o = ctx.createOscillator();
      const bp = ctx.createBiquadFilter();
      const g = ctx.createGain();
      const p = ctx.createStereoPanner();
      const f = rand(420, 520);
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f, s);
      o.frequency.linearRampToValueAtTime(f * 0.8, s + 0.3);
      bp.type = "bandpass";
      bp.frequency.value = 1300;
      bp.Q.value = 1.6;
      p.pan.value = pan;
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(0.05, s + 0.04);
      g.gain.exponentialRampToValueAtTime(0.001, s + 0.34);
      o.connect(bp).connect(g).connect(p).connect(this.weatherBus);
      o.start(s);
      o.stop(s + 0.36);
    }
  }

  private tone(
    t: number,
    f0: number,
    f1: number,
    dur: number,
    gain: number,
    pan: number,
    bus: AudioNode = this.weatherBus,
    type: OscillatorType = "sine",
    attack = 0.008,
  ): void {
    const ctx = this.context!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const p = ctx.createStereoPanner();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0003, t + dur);
    p.pan.value = pan;
    o.connect(g).connect(p).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private raindrop(t: number): void {
    const f = rand(650, 1700);
    this.tone(
      t,
      f,
      f * rand(1.5, 2.3),
      rand(0.035, 0.07),
      rand(0.03, 0.09) * (0.6 + 0.5 * this.scene.rain),
      rand(-0.9, 0.9),
      this.weatherBus,
      "sine",
      0.002,
    );
  }

  thunderAfter(delay: number, strength = 1): void {
    const ctx = this.context;
    if (!ctx || ctx.state !== "running" || !this.active || !this.opts.weatherSound) return;
    this.thunder(ctx.currentTime + delay, strength);
  }

  private thunder(t: number, strength = 1): void {
    const ctx = this.context!;
    const src = ctx.createBufferSource();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    src.buffer = this.buffer("rumble", () => {
      const sr = 11025;
      const d = noise(sr * 7);
      let y = 0;
      for (let i = 0; i < d.length; i++) {
        y = y * 0.985 + d[i] * 0.15;
        d[i] = y;
      }
      return [sr, [d]];
    });
    f.type = "lowpass";
    f.frequency.value = 160;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.55 * (0.6 + 0.4 * strength), t + rand(0.8, 2));
    g.gain.exponentialRampToValueAtTime(0.001, t + 6.5);
    src.connect(f).connect(g).connect(this.weatherBus);
    src.start(t);
    src.stop(t + 7);
  }

  private bird(t: number): void {
    const kind = Math.floor(rand(0, 3));
    const pan = rand(-0.85, 0.85);
    const gain = rand(0.03, 0.07);
    if (kind === 0) {
      const f = rand(3200, 4300);
      let s = t;
      for (let k = 3 + Math.floor(rand(0, 4)); k > 0; k--) {
        this.tone(s, f * rand(0.92, 1.06), f * rand(1.2, 1.38), rand(0.05, 0.08), gain, pan);
        s += rand(0.09, 0.15);
      }
    } else if (kind === 1) {
      const f = rand(1700, 2300);
      this.tone(t, f, f * 1.12, 0.22, gain * 1.2, pan);
      this.tone(t + 0.29, f * 1.22, f * 0.95, 0.3, gain * 1.2, pan);
    } else {
      const f = rand(4300, 5300);
      for (let k = 0; k < 10; k++) this.tone(t + k * 0.045, f, f * 0.84, 0.035, gain * 0.8, pan);
    }
  }

  private dove(t: number): void {
    const f = rand(390, 450);
    const pan = rand(-0.7, 0.7);
    const phrase: [number, number, number][] = [
      [0, 0.32, 0.6],
      [0.44, 0.5, 1],
      [1.05, 0.33, 0.6],
      [1.46, 0.36, 0.5],
    ];
    for (const [dt, len, amp] of phrase)
      this.tone(t + dt, f * 1.05, f * 0.86, len, 0.05 * amp, pan, this.weatherBus, "sine", 0.07);
  }

  private frog(t: number): void {
    const ctx = this.context!;
    const f = rand(170, 300);
    const rate = rand(18, 28);
    const pan = rand(-0.85, 0.85);
    const gain = rand(0.05, 0.09);
    for (let rep = 0, s = t; rep < 1 + Math.floor(rand(0, 3)); rep++, s += rand(0.5, 0.9)) {
      const o = ctx.createOscillator();
      const bp = ctx.createBiquadFilter();
      const g = ctx.createGain();
      const p = ctx.createStereoPanner();
      const pulses = 5 + Math.floor(rand(0, 6));
      o.type = "sawtooth";
      o.frequency.value = f;
      bp.type = "bandpass";
      bp.frequency.value = f * 3.2;
      bp.Q.value = 3;
      p.pan.value = pan;
      g.gain.value = 0;
      for (let k = 0; k < pulses; k++) {
        const a = s + k / rate;
        g.gain.setValueAtTime(0, a);
        g.gain.linearRampToValueAtTime(gain, a + 0.006);
        g.gain.linearRampToValueAtTime(0, a + 0.75 / rate);
      }
      o.connect(bp).connect(g).connect(p).connect(this.weatherBus);
      o.start(s);
      o.stop(s + pulses / rate + 0.05);
    }
  }

  async toggle(): Promise<boolean> {
    if (!this.context) this.setup();
    this.active = !this.active;
    if (this.active) await this.context!.resume();
    this.refresh();
    if (!this.active)
      setTimeout(() => {
        if (!this.active) void this.context?.suspend();
      }, 2500);
    return this.active;
  }

  private ok(): boolean {
    return !!this.context && this.context.state === "running" && this.active && this.opts.sfx;
  }

  plop(): void {
    if (!this.ok()) return;
    const ctx = this.context!;
    const now = ctx.currentTime;
    for (let k = 0; k < 4; k++)
      this.drop(now + k * rand(0.015, 0.05), rand(700, 1300), rand(0.12, 0.22), rand(-0.4, 0.4));
    const n = ctx.createBufferSource();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    n.buffer = this.buffer("spray", () => [22050, [band(noise(4410), 1800, 6000, 22050)]]);
    f.type = "highpass";
    f.frequency.value = 1500;
    g.gain.setValueAtTime(0.05, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    n.connect(f).connect(g).connect(this.sfxBus);
    n.start(now);
    n.stop(now + 0.2);
  }

  gulp(): void {
    if (this.ok()) this.drop(this.context!.currentTime, rand(260, 380), 0.16, rand(-0.3, 0.3), 0.5);
  }

  tap(): void {
    if (this.ok()) this.drop(this.context!.currentTime, rand(520, 700), 0.2, 0, 1.2);
  }

  private drop(t: number, f: number, gain: number, pan: number, rise = 0.9): void {
    this.tone(
      t,
      f,
      f * (1 + rise),
      Math.min(0.12, 22 / f + 0.02) * 1.6,
      gain,
      pan,
      this.sfxBus,
      "sine",
      0.002,
    );
  }
}
