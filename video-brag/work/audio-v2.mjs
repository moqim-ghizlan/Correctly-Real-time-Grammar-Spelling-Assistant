// Music + SFX as one piece: F major, 120 BPM (beat = 0.5 s), 41 s, 48 kHz stereo WAV.
import { writeFileSync } from 'node:fs';
const SR = 48000, DUR = 41, N = SR * DUR;
const L = new Float32Array(N), R = new Float32Array(N), sendL = new Float32Array(N), sendR = new Float32Array(N);
const hz = m => 440 * 2 ** ((m - 69) / 12);
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

function add(t0, len, fn, gain, pan = 0, send = .25) {
  const s0 = Math.floor(t0 * SR), n = Math.floor(len * SR);
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
  for (let i = 0; i < n && s0 + i < N; i++) {
    if (s0 + i < 0) continue;
    const v = fn(i / SR);
    L[s0 + i] += v * gl; R[s0 + i] += v * gr; sendL[s0 + i] += v * gl * send; sendR[s0 + i] += v * gr * send;
  }
}
const env = (t, a, d, len) => Math.min(1, t / a) * (t > len - d ? Math.max(0, (len - t) / d) : 1);
const silent = (t, ranges) => ranges.some(([a, b]) => t >= a && t < b);

// Chords per 2 s bar (MIDI): Fmaj7, Dm9, Bbmaj7, Csus/add9 … ending on F.
const LOOP = [[53, 57, 60, 64], [50, 57, 60, 64], [46, 57, 62, 65], [48, 55, 62, 67]];
const BARS = Array.from({ length: 18 }, (_, i) => LOOP[i % 4]).concat([[53, 57, 60, 64], [53, 57, 60, 64], [53, 57, 60, 64]]);
const chordAt = t => BARS[Math.min(BARS.length - 1, Math.floor(t / 2))];
const BREAK = [[35.5, 36.7]];

// Pad: detuned saws through a one-pole low-pass, wide stereo.
for (let b = 0; b < BARS.length; b++) {
  const t0 = b * 2, len = b === BARS.length - 1 ? 3.2 : 2.3;
  for (const [j, m] of BARS[b].entries()) {
    for (const det of [-0.08, 0.08]) {
      let lp = 0, ph = j * .3;
      const f = hz(m + 12 + det);
      add(t0, len, t => { ph += f / SR; const saw = 2 * (ph % 1) - 1; lp += .05 * (saw - lp); return lp * env(t, .35, .5, len); },
        b < 2 ? .02 : .028, det < 0 ? -.55 : .55, .5);
    }
  }
}

// Bass from the first scene (4 s): root on beat 1 and the "and" of 2; long note on the outro.
for (let beat = 8; beat < 72; beat++) {
  const t = beat * .5; if (silent(t, BREAK)) continue;
  const f = hz(chordAt(t)[0] - 12);
  const hits = beat % 4 === 0 ? [0] : beat % 4 === 1 ? [.25] : [];
  for (const o of hits) add(t + o, .45, x => Math.tanh(1.6 * Math.sin(2 * Math.PI * f * x)) * Math.exp(-x * 5) * Math.min(1, x / .005), .15, 0, .05);
}
add(36.7, 4.3, x => Math.sin(2 * Math.PI * hz(29) * x) * Math.exp(-x * .9) * Math.min(1, x / .01), .2, 0, .05);

// Soft kick on each beat from 4 s; hats from the correction scene.
for (let beat = 8; beat < 80; beat++) {
  const t = beat * .5; if (silent(t, BREAK)) continue; if (t > 39) break;
  add(t, .3, x => Math.sin(2 * Math.PI * (48 * x + 70 * (1 - Math.exp(-x * 30)) / 30)) * Math.exp(-x * 14), .24, 0, .02);
}
for (let beat = 22; beat < 76; beat++) {
  const t = beat * .5 + .25; if (silent(t, BREAK)) continue;
  let hp = 0, prev = 0;
  add(t, .06, x => { const n = rnd(); hp = .7 * (hp + n - prev); prev = n; return hp * Math.exp(-x * 70); }, .03, beat % 2 ? .3 : -.3, .2);
}

// Pluck arpeggio (8ths on beats) from the window reveal, chord tones up an octave.
const pluck = (t, m, g, pan = 0) => {
  const f = hz(m);
  add(t, 1.2, x => (Math.sin(2 * Math.PI * f * x) + .3 * Math.sin(4 * Math.PI * f * x)) * Math.exp(-x * 6) * Math.min(1, x / .003), g, pan, .45);
};
for (let k = 0; ; k++) {
  const t = 8 + k * .5; if (t >= 35.5) break;
  const c = chordAt(t), notes = [c[1], c[2], c[3], c[2]];
  pluck(t, notes[k % 4] + 12, .04, (k % 2 ? .35 : -.35));
}

// SFX — tuned to the key and sent to the same reverb.
const tick = (t, g = .09) => { let lp = 0; add(t, .03, x => { lp += .35 * (rnd() - lp); return lp * Math.exp(-x * 180); }, g, .2, .1); };
const whoosh = (t, len, g) => { let lp = 0; add(t, len, x => { lp += (.02 + .25 * (x / len) ** 2) * (rnd() - lp); return lp * Math.sin(Math.PI * x / len) ** 2; }, g, 0, .6); };
const bell = (t, m, g, len = 2) => add(t, len, x => (Math.sin(2 * Math.PI * hz(m) * x) + .25 * Math.sin(2 * Math.PI * hz(m) * 2.76 * x) * Math.exp(-x * 8)) * Math.exp(-x * 2.5) * Math.min(1, x / .004), g, .15, .6);

// Intro: tile pops, the C draws (rising shimmer), the check lands (bell triad), the name rises.
add(.15, .25, x => Math.sin(2 * Math.PI * hz(41) * x * (1 + 2 * Math.exp(-x * 25))) * Math.exp(-x * 18), .22, 0, .2);
whoosh(.45, .75, .06);
for (const [t, m] of [[1.12, 84], [1.24, 89], [1.36, 93]]) bell(t, m, .055);
for (let i = 0; i < 9; i++) pluck(1.5 + i * .06, [77, 81, 84, 89, 93, 89, 84, 89, 93][i], .018, i % 2 ? .3 : -.3);

for (let i = 0; i < 22; i++) tick(4.82 + i * .068 + (i % 3) * .008);  // typing
whoosh(7.7, .75, .085);                                                // into the window
add(8.15, .12, x => Math.sin(2 * Math.PI * hz(41) * x) * Math.exp(-x * 40), .18, 0, .1); // keycap
for (const [t, m] of [[11.66, 77], [13.86, 77], [18.6, 81], [21.2, 84], [25.36, 77], [27.1, 81]]) { // clicks
  tick(t, .08); pluck(t + .01, m, .03, .1);
}
for (const [t, m] of [[13.9, 84], [14.02, 89], [14.14, 93]]) bell(t, m, .05); // Apply
for (const [t, m] of [[12.6, 81], [17.1, 81], [17.5, 84], [17.9, 88], [21.95, 84], [26.05, 81], [26.35, 84], [26.65, 89]]) pluck(t, m, .035, -.15);
for (const t of [29.2, 29.42, 29.64]) tick(t, .08);                   // "brb"
for (const [t, m] of [[30.0, 89], [30.08, 93], [30.16, 96]]) bell(t, m, .035, 1.5); // expansion sparkle
whoosh(32.15, .5, .05);                                                // to the settings page
for (const [i, m] of [81, 84, 88, 89].entries()) pluck(33.3 + i * .2, m, .02, .2);
for (const [t, m] of [[36.7, 89], [36.7, 84], [36.7, 81], [36.7, 77]]) // outro chord
  add(t, 4.3, x => Math.sin(2 * Math.PI * hz(m) * x) * Math.exp(-x * 1.1) * Math.min(1, x / .01), .035, 0, .7);

// Reverb on the send bus (Schroeder: 4 combs + 2 all-passes per side).
function verb(inp, off) {
  const out = new Float32Array(N);
  for (const [d, g] of [[1557, .80], [1617, .79], [1491, .81], [1422, .78]]) {
    const len = Math.round((d + off) * SR / 44100), buf = new Float32Array(len); let p = 0, lp = 0;
    for (let i = 0; i < N; i++) { const y = buf[p]; lp = .6 * lp + .4 * y; buf[p] = inp[i] + lp * g; p = (p + 1) % len; out[i] += y * .25; }
  }
  for (const d of [225, 556]) {
    const len = d + off, buf = new Float32Array(len); let p = 0;
    for (let i = 0; i < N; i++) { const b = buf[p], x = out[i]; const y = -x + b; buf[p] = x + b * .5; out[i] = y; p = (p + 1) % len; }
  }
  return out;
}
const vL = verb(sendL, 0), vR = verb(sendR, 23);

// Master: sum, fade in/out, gentle tanh, normalize to -1 dBFS.
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR, fade = Math.min(1, t / .05) * Math.min(1, (DUR - t) / 1.6);
  L[i] = Math.tanh((L[i] + vL[i] * .9) * 1.4) * fade; R[i] = Math.tanh((R[i] + vR[i] * .9) * 1.4) * fade;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const norm = 0.89 / peak, data = Buffer.alloc(44 + N * 4);
data.write('RIFF', 0); data.writeUInt32LE(36 + N * 4, 4); data.write('WAVEfmt ', 8); data.writeUInt32LE(16, 16);
data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22); data.writeUInt32LE(SR, 24); data.writeUInt32LE(SR * 4, 28);
data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { data.writeInt16LE(Math.round(L[i] * norm * 32767), 44 + i * 4); data.writeInt16LE(Math.round(R[i] * norm * 32767), 46 + i * 4); }
writeFileSync(process.argv[2] ?? 'music.wav', data);
console.log('peak', peak.toFixed(3));
