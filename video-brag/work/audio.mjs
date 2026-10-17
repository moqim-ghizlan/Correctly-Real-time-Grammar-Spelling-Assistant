// Festival EDM score + SFX as one piece: E minor, 150 BPM (beat 0.4 s, bar 1.6 s), 57.6 s, 48 kHz stereo WAV.
import { writeFileSync } from 'node:fs';
const SR = 48000, DUR = 57.6, N = Math.round(SR * DUR), BEAT = .4, BAR = 1.6;
const L = new Float32Array(N), R = new Float32Array(N), sendL = new Float32Array(N), sendR = new Float32Array(N);
// Pumped bus: chords, bass and lead are ducked by the kick (sidechain).
const PL = new Float32Array(N), PR = new Float32Array(N);
const hz = m => 440 * 2 ** ((m - 69) / 12);
let seed = 23; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

function add(t0, len, fn, gain, pan = 0, send = .2, pump = false) {
  const s0 = Math.floor(t0 * SR), n = Math.floor(len * SR);
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
  const OL = pump ? PL : L, OR = pump ? PR : R;
  for (let i = 0; i < n && s0 + i < N; i++) {
    if (s0 + i < 0) continue;
    const v = fn(i / SR, (s0 + i) / SR);
    OL[s0 + i] += v * gl; OR[s0 + i] += v * gr; sendL[s0 + i] += v * gl * send; sendR[s0 + i] += v * gr * send;
  }
}
const inAny = (t, rs) => rs.some(([a, b]) => t >= a - 1e-6 && t < b - 1e-6);

// Song map.
const SLAMS = [[11.2, 12.8], [19.2, 20.0], [24.8, 25.6], [30.4, 31.2], [48.0, 51.2]];
const GROOVE = [[3.2, 56.0]];
const LEAD = [[3.2, 11.2], [43.2, 48.0], [51.2, 56.0]];
const grooveOn = t => inAny(t, GROOVE) && !inAny(t, SLAMS);
const DROPS = [3.2, 12.8, 20.0, 25.6, 31.2, 51.2];
const HITS = [11.2, 19.2, 24.8, 30.4];

// Em – C – G – D, one chord per bar.
const PROG = [{ b: 40, c: [59, 64, 67, 71] }, { b: 36, c: [60, 64, 67, 72] }, { b: 43, c: [59, 62, 67, 71] }, { b: 38, c: [57, 62, 66, 69] }];
const chordAt = t => PROG[Math.floor(t / BAR + 1e-6) % 4];

// --- instruments
const kickTimes = [];
const kick = (t, g = .55) => { kickTimes.push(t); add(t, .45, x => Math.tanh(2.2 * Math.sin(2 * Math.PI * (48 * x + 160 * (1 - Math.exp(-x * 32)) / 32))) * Math.exp(-x * 6.5) + rnd() * Math.exp(-x * 500) * .35, g, 0, .02); };
const clap = (t, g = .2) => { for (const o of [0, .011, .022]) { let lp = 0; add(t + o, .25, x => { lp += .5 * (rnd() - lp); return (rnd() - lp) * Math.exp(-x * (o ? 60 : 16)); }, g, 0, .45); } };
const snare = (t, g = .2) => { let lp = 0; add(t, .2, x => { lp += .5 * (rnd() - lp); return (rnd() - lp) * Math.exp(-x * 18) + .5 * Math.sin(2 * Math.PI * 200 * x) * Math.exp(-x * 35); }, g, 0, .35); };
const hat = (t, g = .05, open = false, pan = .25) => { let p = 0; add(t, open ? .2 : .05, x => { const n = rnd(), y = n - p; p = n; return y * Math.exp(-x * (open ? 22 : 90)); }, g, pan, .1); };

// Supersaw: 7 detuned saws per note, one-pole low-pass whose cutoff follows the song (sweeps).
const cutoff = T => {
  if (T < 3.2) return .015 + .25 * (T / 3.2) ** 2;            // intro sweep up
  if (T >= 48.0 && T < 51.2) return .03 + .3 * ((T - 48) / 3.2) ** 2; // final build
  if (inAny(T, SLAMS)) return .03;                             // muffled under the slam cards
  return inAny(T, LEAD) ? .3 : .16;                            // brighter on the drops
};
function supersaw(t, notes, len, g, opts = {}) {
  const { attack = .01, release = .05, pump = true, send = .3 } = opts;
  for (const m of notes) for (let v = 0; v < 7; v++) {
    const det = (v - 3) * .09, f = hz(m + det); let ph = ((v * 0.37 + m * .13) % 1), lp = 0;
    add(t, len, (x, T) => { ph += f / SR; lp += cutoff(T) * ((2 * (ph % 1) - 1) - lp); return lp * Math.min(1, x / attack) * Math.min(1, (len - x) / release); },
      g / Math.sqrt(notes.length * 7) , (v - 3) / 3 * .8, send, pump);
  }
}
function bassNote(t, m, len, g = .2) {
  const f = hz(m); let ph = 0, lp = 0;
  add(t, len, x => { ph += f / SR; const saw = 2 * (ph % 1) - 1; lp += (.06 + .2 * Math.exp(-x * 20)) * (saw - lp); return Math.tanh(lp * 3) * Math.min(1, x / .004) * Math.min(1, (len - x) / .015); }, g, 0, .03, true);
  add(t, len, x => Math.sin(2 * Math.PI * f / 2 * x) * Math.min(1, x / .004) * Math.min(1, (len - x) / .015), g * .7, 0, 0, true); // sub
}
const pluck = (t, m, g = .04, pan = 0, send = .35) => { const f = hz(m); add(t, .5, x => (Math.sin(2 * Math.PI * f * x) + .4 * Math.sin(4 * Math.PI * f * x) + .15 * Math.sin(6 * Math.PI * f * x)) * Math.exp(-x * 11) * Math.min(1, x / .002), g, pan, send); };
const bell = (t, m, g = .05, len = 1.5) => add(t, len, x => (Math.sin(2 * Math.PI * hz(m) * x) + .3 * Math.sin(2 * Math.PI * hz(m) * 2.76 * x) * Math.exp(-x * 9)) * Math.exp(-x * 3) * Math.min(1, x / .003), g, .1, .5);
function impact(t, g = 1) {
  add(t, 1.8, x => Math.sin(2 * Math.PI * (28 * x + 70 * (1 - Math.exp(-x * 5)) / 5)) * Math.exp(-x * 2.2) * Math.min(1, x / .003), .5 * g, 0, .05);
  let hp = 0, p = 0; add(t, 2.0, x => { const n = rnd(); hp = .85 * (hp + n - p); p = n; return hp * Math.exp(-x * 2.2); }, .16 * g, 0, .6); // crash
  kick(t, .55 * g);
}
function riser(t, len, g = .12) {
  let lp = 0, ph = 0;
  add(t, len, x => { const k = x / len; lp += (.01 + .55 * k * k) * (rnd() - lp); ph += hz(48 + 36 * k) / SR; return (lp * 1.3 + .3 * Math.sin(2 * Math.PI * ph)) * k * k; }, g, 0, .5);
}
const whoosh = (t, len, g) => { let lp = 0; add(t, len, x => { lp += (.03 + .4 * (x / len)) * (rnd() - lp); return lp * Math.sin(Math.PI * x / len) ** 2; }, g, 0, .5); };
const downlifter = (t, len, g) => { let lp = 0; add(t, len, x => { const k = x / len; lp += (.4 - .38 * k) * (rnd() - lp); return lp * (1 - k) ** 2; }, g, 0, .6); };
const tick = (t, g = .08) => { let lp = 0; add(t, .03, x => { lp += .4 * (rnd() - lp); return lp * Math.exp(-x * 200); }, g, .2, .1); };
const glitch = (t, g = .07) => add(t, .14, x => (Math.floor(x * 900) % 2 ? 1 : -1) * (Math.floor(x * 70) % 2) * Math.exp(-x * 14), g, -.2, .15);
function build(a, b, g = .16) { // EDM snare build: quarters → 8ths → 16ths → 32nds, rising
  const len = b - a;
  for (let t = a; t < b - 1e-6;) {
    const k = (t - a) / len; snare(t, g * (.35 + .65 * k));
    t += k < .25 ? BEAT : k < .5 ? BEAT / 2 : k < .8 ? BEAT / 4 : BEAT / 8;
  }
}

// --- intro (0–3.2): filtered supersaw opening up, word hits, build, gap, DROP
for (let b = 0; b < 2; b++) supersaw(b * BAR, PROG[0].c, BAR, .16, { attack: .2, pump: false });
for (const t of [.4, 1.2, 2.0]) { kick(t, .4); clap(t, .12); }
build(1.6, 3.05, .15); riser(1.4, 1.65, .14);

// --- groove: four-on-the-floor, claps on 2 and 4, offbeat open hats, rolling offbeat bass
for (let t = 0; t < DUR - 1e-6; t = +(t + BEAT / 2).toFixed(4)) {
  if (!grooveOn(t)) continue;
  const beat = Math.round(t / BEAT * 2) / 2, onBeat = Number.isInteger(beat), c = chordAt(t);
  if (onBeat) { kick(t); if (beat % 2 === 1) clap(t); hat(t + .1, .02, false, -.3); }
  else { hat(t, .05, true); bassNote(t, c.b + 12, .17, .2); }
  hat(t + .05, .012, false, .4);
}
// pumping supersaw chords, one per bar, in every groove bar
for (let b = 2; b < 35; b++) {
  const t = b * BAR; if (!inAny(t + .01, GROOVE)) continue;
  supersaw(t, chordAt(t).c, BAR, inAny(t + .01, LEAD) ? .2 : .13);
}
// festival hook on the drops (16th grid, one row per chord, -1 = rest)
const HOOK = [
  [71, -1, 71, -1, 76, -1, 74, -1, 71, -1, -1, 67, -1, 69, -1, -1],
  [72, -1, 72, -1, 76, -1, 74, -1, 72, -1, -1, 67, -1, 69, -1, -1],
  [71, -1, 71, -1, 74, -1, 79, -1, 78, -1, -1, 74, -1, 71, -1, -1],
  [69, -1, 69, -1, 74, -1, 78, -1, 76, -1, -1, 74, -1, 71, -1, -1],
];
for (let t = 3.2; t < DUR - 1e-6; t = +(t + .1).toFixed(4)) {
  if (!inAny(t, LEAD) || inAny(t, SLAMS)) continue;
  const m = HOOK[Math.floor(t / BAR + 1e-6) % 4][Math.round((t % BAR) / .1) % 16];
  if (m > 0) supersaw(t, [m, m + 12], .18, .13, { attack: .004, release: .08, send: .45 });
}
// 16th pluck arpeggio under the feature scenes
for (let t = 12.8; t < 43.2 - 1e-6; t = +(t + .1).toFixed(4)) {
  if (!grooveOn(t)) continue;
  const c = chordAt(t), i = Math.round(t / .1) % 4;
  pluck(t, [c.c[1], c.c[2], c.c[3], c.c[2] + 12][i] + 12, .02, i % 2 ? .4 : -.4, .25);
}

// --- slams: crash + downlifter on entry, kick hits on the beat, build + gap into the drop
for (const t of HITS) { impact(t, .8); downlifter(t, .8, .07); }
for (const [a, b] of SLAMS) {
  for (let t = a; t < b - 1e-6; t += BEAT) kick(t, .42);
  if (b - a > .9) { riser(b - 1.5, 1.4, .13); build(b - 1.4, b - .15, .14); }
  else { riser(a + .1, b - a - .12, .1); }
}
for (const t of DROPS) impact(t, t === 3.2 || t === 51.2 ? 1.15 : .7);
for (const t of [48.0, 48.4, 48.8, 49.2, 49.6]) { impact(t, .5); supersaw(t, chordAt(t).c, .3, .14, { attack: .003, release: .1, pump: false }); }
riser(9.6, 1.55, .09); riser(28.8, 1.55, .07);

// --- finale: last hit at 56.0, chord rings out
impact(56.0, 1.1);
supersaw(56.0, [52, 59, 64, 67, 71], 1.6, .22, { attack: .005, release: 1.2, pump: false, send: .6 });

// --- UI sound design, in key
const ERR_SEG = [['Salut Claire, je suis allé ', 0], ['a', 1], [' la réunion ', 0], ['hier mais', 1], [' j’ai ', 0], ['oublier', 1], [' le ', 0], ['fichié', 1], ['.', 0]];
const TOTAL = ERR_SEG.reduce((n, s) => n + s[0].length, 0);
{ let i = 0; for (const [s, e] of ERR_SEG) { i += s.length; if (e) glitch(6.7 + 1.9 * Math.min(1, (i + 2) / TOTAL)); } }
for (let i = 0; i < 26; i++) tick(6.72 + i * .072 + (i % 3) * .006, .06);           // typing
whoosh(9.55, .5, .05);                                                                // selection
for (const [t, m] of [[14.0, 76], [16.4, 76], [22.4, 79], [26.8, 83], [33.2, 76], [34.4, 79], [36.8, 83]]) { tick(t, .08); pluck(t, m + 12, .035, .1); }
for (const [t, m] of [[16.42, 83], [16.52, 88], [16.62, 91]]) bell(t, m, .045);        // Apply
for (const [i, m] of [76, 79, 83, 88].entries()) pluck(15.0 + i * .2, m, .03, .2);    // corrected words pop
for (const [i, m] of [76, 79, 83].entries()) { whoosh(20.36 + i * .4, .2, .04); pluck(20.4 + i * .4, m, .035, -.2); }
for (let i = 0; i < 16; i++) tick(27.65 + i * .06, .045);                             // live translation typing
whoosh(31.55, .9, .05);                                                               // drag-select
for (const [i, m] of [76, 79, 83].entries()) { whoosh(35.16 + i * .4, .2, .04); pluck(35.2 + i * .4, m, .035, -.2); }
for (const t of [39.4, 39.55, 39.7, 39.85]) tick(t, .07);                             // "cdlt"
for (const [t, m] of [[40.4, 88], [40.48, 91], [40.56, 95]]) bell(t, m, .045, 1.2);    // expansion sparkle
for (const t of [38.25, 43.05]) whoosh(t, .35, .09);                                  // whip pans
for (const [i, m] of [76, 79, 83, 88].entries()) pluck(44.2 + i * .2, m, .025, .2);   // route rows
for (const [i, m] of [76, 79, 83, 88].entries()) pluck(52.8 + i * .2, m, .03, .2);    // outro chips
bell(54.0, 88, .05); bell(54.0, 83, .04);                                             // CTA

// --- sidechain: duck the pumped bus after every kick, then sum it in
const duck = new Float32Array(N).fill(1);
for (const kt of kickTimes) {
  const s0 = Math.floor(kt * SR), n = Math.floor(.38 * SR);
  for (let i = 0; i < n && s0 + i < N; i++) {
    const x = i / SR, g = 1 - .85 * Math.min(1, x / .004) * Math.exp(-x * 9);
    if (g < duck[s0 + i]) duck[s0 + i] = g;
  }
}
for (let i = 0; i < N; i++) { L[i] += PL[i] * duck[i]; R[i] += PR[i] * duck[i]; }

// Reverb on the send bus (Schroeder: 4 combs + 2 all-passes per side).
function verb(inp, off) {
  const out = new Float32Array(N);
  for (const [d, g] of [[1557, .8], [1617, .79], [1491, .81], [1422, .78]]) {
    const len = Math.round((d + off) * SR / 44100), buf = new Float32Array(len); let p = 0, lp = 0;
    for (let i = 0; i < N; i++) { const y = buf[p]; lp = .55 * lp + .45 * y; buf[p] = inp[i] + lp * g; p = (p + 1) % len; out[i] += y * .25; }
  }
  for (const d of [225, 556]) {
    const len = d + off, buf = new Float32Array(len); let p = 0;
    for (let i = 0; i < N; i++) { const b = buf[p], x = out[i]; const y = -x + b; buf[p] = x + b * .5; out[i] = y; p = (p + 1) % len; }
  }
  return out;
}
const vL = verb(sendL, 0), vR = verb(sendR, 23);

// Master: reverb ducked a little too, glue (tanh), tail fade, normalize to -1 dBFS.
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR, fade = Math.min(1, t / .02) * Math.min(1, (DUR - t) / 1.2), d = .5 + .5 * duck[i];
  L[i] = Math.tanh((L[i] + vL[i] * .75 * d) * 1.15) * fade; R[i] = Math.tanh((R[i] + vR[i] * .75 * d) * 1.15) * fade;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const norm = 0.89 / peak, data = Buffer.alloc(44 + N * 4);
data.write('RIFF', 0); data.writeUInt32LE(36 + N * 4, 4); data.write('WAVEfmt ', 8); data.writeUInt32LE(16, 16);
data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22); data.writeUInt32LE(SR, 24); data.writeUInt32LE(SR * 4, 28);
data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { data.writeInt16LE(Math.round(L[i] * norm * 32767), 44 + i * 4); data.writeInt16LE(Math.round(R[i] * norm * 32767), 46 + i * 4); }
writeFileSync(process.argv[2] ?? 'music.wav', data);
console.log('peak', peak.toFixed(3));
