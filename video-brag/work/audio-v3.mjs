// Action score + SFX as one piece: E minor, 150 BPM (beat 0.4 s, bar 1.6 s), 57.6 s, 48 kHz stereo WAV.
import { writeFileSync } from 'node:fs';
const SR = 48000, DUR = 57.6, N = Math.round(SR * DUR), BEAT = .4, BAR = 1.6;
const L = new Float32Array(N), R = new Float32Array(N), sendL = new Float32Array(N), sendR = new Float32Array(N);
const hz = m => 440 * 2 ** ((m - 69) / 12);
let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

function add(t0, len, fn, gain, pan = 0, send = .2) {
  const s0 = Math.floor(t0 * SR), n = Math.floor(len * SR);
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
  for (let i = 0; i < n && s0 + i < N; i++) {
    if (s0 + i < 0) continue;
    const v = fn(i / SR);
    L[s0 + i] += v * gl; R[s0 + i] += v * gr; sendL[s0 + i] += v * gl * send; sendR[s0 + i] += v * gr * send;
  }
}
const inAny = (t, rs) => rs.some(([a, b]) => t >= a - 1e-6 && t < b - 1e-6);

// Song map. Full groove everywhere except the intro, the slam cards and the tail.
const SLAMS = [[11.2, 12.8], [19.2, 20.0], [24.8, 25.6], [30.4, 31.2], [48.0, 51.2]];
const GROOVE = [[3.2, 56.0]];
const grooveOn = t => inAny(t, GROOVE) && !inAny(t, SLAMS);
const DROPS = [3.2, 11.2, 12.8, 19.2, 20.0, 24.8, 25.6, 30.4, 31.2, 51.2];

// Em – C – G – D, one chord per bar.
const PROG = [{ b: 40, c: [64, 67, 71] }, { b: 36, c: [64, 67, 72] }, { b: 43, c: [62, 67, 71] }, { b: 38, c: [62, 66, 69] }];
const chordAt = t => PROG[Math.floor(t / BAR + 1e-6) % 4];

// --- instruments
const kick = (t, g = .5) => add(t, .35, x => Math.sin(2 * Math.PI * (45 * x + 115 * (1 - Math.exp(-x * 28)) / 28)) * Math.exp(-x * 9) + rnd() * Math.exp(-x * 400) * .3, g, 0, .02);
const snare = (t, g = .26) => { let lp = 0; add(t, .3, x => { lp += .55 * (rnd() - lp); return (rnd() - lp) * Math.exp(-x * 13) + .6 * Math.sin(2 * Math.PI * 190 * x) * Math.exp(-x * 30); }, g, .05, .35); };
const hat = (t, g = .05, pan = .3) => { let p = 0; add(t, .05, x => { const n = rnd(), y = n - p; p = n; return y * Math.exp(-x * 90); }, g, pan, .1); };
const tom = (t, m, g = .3) => add(t, .5, x => Math.sin(2 * Math.PI * hz(m) * x * (1 + .4 * Math.exp(-x * 20))) * Math.exp(-x * 7), g, 0, .3);
function bassNote(t, m, len, g = .2) {
  const f = hz(m); let ph = 0, lp = 0;
  add(t, len, x => { ph += f / SR; const saw = 2 * (ph % 1) - 1, sq = ph % 1 < .5 ? 1 : -1; lp += (.08 + .25 * Math.exp(-x * 18)) * ((saw + .5 * sq) - lp); return Math.tanh(lp * 2.5) * Math.min(1, x / .004) * Math.min(1, (len - x) / .02); }, g, 0, .03);
}
function stab(t, notes, g = .07, len = .22) {
  for (const [j, m] of notes.entries()) for (const det of [-.1, .1]) {
    const f = hz(m + det); let ph = j * .2, lp = 0;
    add(t, len, x => { ph += f / SR; lp += .35 * Math.exp(-x * 6) * ((2 * (ph % 1) - 1) - lp); return lp * Math.min(1, x / .003) * Math.exp(-x * 7); }, g, det < 0 ? -.45 : .45, .3);
  }
}
const pluck = (t, m, g = .04, pan = 0, send = .35) => { const f = hz(m); add(t, .5, x => (Math.sin(2 * Math.PI * f * x) + .4 * Math.sin(4 * Math.PI * f * x) + .15 * Math.sin(6 * Math.PI * f * x)) * Math.exp(-x * 11) * Math.min(1, x / .002), g, pan, send); };
const bell = (t, m, g = .05, len = 1.5) => add(t, len, x => (Math.sin(2 * Math.PI * hz(m) * x) + .3 * Math.sin(2 * Math.PI * hz(m) * 2.76 * x) * Math.exp(-x * 9)) * Math.exp(-x * 3) * Math.min(1, x / .003), g, .1, .5);
function impact(t, g = 1) {
  add(t, 1.6, x => Math.sin(2 * Math.PI * (30 * x + 60 * (1 - Math.exp(-x * 6)) / 6)) * Math.exp(-x * 2.6) * Math.min(1, x / .003), .55 * g, 0, .05);
  let lp = 0; add(t, 1.4, x => { lp += .3 * (rnd() - lp); return (rnd() * .5 + lp) * Math.exp(-x * 3.2); }, .22 * g, 0, .7);
  kick(t, .5 * g);
}
function riser(t, len, g = .12) {
  let lp = 0, ph = 0;
  add(t, len, x => { const k = x / len; lp += (.01 + .5 * k * k) * (rnd() - lp); ph += hz(52 + 30 * k) / SR; return (lp * 1.4 + .25 * Math.sin(2 * Math.PI * ph)) * k * k; }, g, 0, .5);
}
const whoosh = (t, len, g) => { let lp = 0; add(t, len, x => { lp += (.03 + .4 * (x / len)) * (rnd() - lp); return lp * Math.sin(Math.PI * x / len) ** 2; }, g, 0, .5); };
const tick = (t, g = .08) => { let lp = 0; add(t, .03, x => { lp += .4 * (rnd() - lp); return lp * Math.exp(-x * 200); }, g, .2, .1); };
const glitch = (t, g = .07) => add(t, .14, x => (Math.floor(x * 900) % 2 ? 1 : -1) * (Math.floor(x * 70) % 2) * Math.exp(-x * 14), g, -.2, .15);
function roll(a, b, g = .16) { // snare roll accelerating from 8ths to 32nds
  let t = a; while (t < b) { const k = (t - a) / (b - a); snare(t, g * (.4 + .6 * k)); t += .2 * (1 - k) + .05 * k; }
}

// --- intro (0–3.2): pulse builds, word hits, roll and riser into the logo drop
for (let i = 0; i < 16; i++) { const t = i * .2; const k = t / 3.2; bassNote(t, 40, .14, .06 + .1 * k); hat(t + .1, .02 + .04 * k); }
for (const t of [.4, 1.2, 2.0]) { tom(t, 40, .32); stab(t, PROG[0].c, .05, .3); kick(t, .35); }
riser(1.6, 1.55, .14); roll(2.4, 3.1, .15);

// --- groove
for (let t = 0; t < DUR - 1e-6; t = +(t + BEAT / 2).toFixed(4)) {
  const beat = Math.round(t / BEAT * 2) / 2, onBeat = Number.isInteger(beat);
  if (!grooveOn(t)) continue;
  const c = chordAt(t), inBar = Math.round(((t % BAR) / (BEAT / 2))) % 8; // 8th index in the bar
  if (onBeat) { kick(t, .45); if (beat % 2 === 1) snare(t, .24); }
  hat(t + (onBeat ? 0 : 0), onBeat ? .025 : .05, onBeat ? -.25 : .3);
  hat(t + .1, .018, .35);
  bassNote(t, c.b + ([0, 0, 12, 0, 0, 12, 0, 7][inBar]), .18, .17);
  if ([0, 3, 6].includes(inBar)) stab(t, c.c, inBar === 0 ? .06 : .045);
}
// 16th arpeggio in the feature scenes
for (let t = 12.8; t < 48.0 - 1e-6; t = +(t + .1).toFixed(4)) {
  if (!grooveOn(t)) continue;
  const c = chordAt(t), i = Math.round(t / .1) % 4, m = [c.c[0], c.c[1], c.c[2], c.c[1] + 12][i] + 12;
  pluck(t, m, .022, i % 2 ? .4 : -.4, .25);
}

// --- slams: impact on entry, kick hits on the beat, riser + roll into the return
for (const t of DROPS) impact(t, t === 3.2 || t === 51.2 ? 1.2 : .85);
for (const [a, b] of SLAMS) {
  for (let t = a; t < b - 1e-6; t += BEAT) { kick(t, .4); stab(t, chordAt(a).c.map(m => m - 12), .05, .35); }
  if (b - a > .9) { riser(b - 1.2, 1.15, .13); roll(b - .8, b - .05, .14); }
}
for (const t of [48.0, 48.4, 48.8, 49.2, 49.6]) impact(t, .55);
for (const t of [19.0, 24.6, 30.2, 10.6]) roll(t - .4, t + .15, .12); // fills into each slam
riser(9.6, 1.55, .1); riser(28.8, 1.55, .08);

// --- finale: hit at 56.0, chord rings out
impact(56.0, 1.1);
for (const m of [52, 59, 64, 67, 71]) add(56.0, 1.6, x => Math.sin(2 * Math.PI * hz(m) * x) * Math.exp(-x * 1.5) * Math.min(1, x / .005), .05, 0, .7);
stab(56.0, [52, 59, 64, 67, 71], .08, .6);

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

// Reverb on the send bus (Schroeder: 4 combs + 2 all-passes per side).
function verb(inp, off) {
  const out = new Float32Array(N);
  for (const [d, g] of [[1557, .78], [1617, .77], [1491, .79], [1422, .76]]) {
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

// Master: sum, glue (tanh), short tail fade, normalize to -1 dBFS.
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR, fade = Math.min(1, t / .02) * Math.min(1, (DUR - t) / 1.2);
  L[i] = Math.tanh((L[i] + vL[i] * .8) * 1.5) * fade; R[i] = Math.tanh((R[i] + vR[i] * .8) * 1.5) * fade;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const norm = 0.89 / peak, data = Buffer.alloc(44 + N * 4);
data.write('RIFF', 0); data.writeUInt32LE(36 + N * 4, 4); data.write('WAVEfmt ', 8); data.writeUInt32LE(16, 16);
data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22); data.writeUInt32LE(SR, 24); data.writeUInt32LE(SR * 4, 28);
data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { data.writeInt16LE(Math.round(L[i] * norm * 32767), 44 + i * 4); data.writeInt16LE(Math.round(R[i] * norm * 32767), 46 + i * 4); }
writeFileSync(process.argv[2] ?? 'music.wav', data);
console.log('peak', peak.toFixed(3));
