#!/usr/bin/env python3
"""score.py: the intro's soundtrack, synthesised from scratch (no samples, no licensing).

Original music in a kulintang-inspired style (pentatonic gong melodies over drones and drums; not a
transcription of any real piece), scored scene by scene to the film, plus every sound effect and a
chibi "voice" babble for each line. Times match cutscene/src/scenes/lore.js and lines.js.

    python3 sound/score.py out/intro.wav        (48 kHz stereo WAV, 56.5 s)

Needs only numpy.
"""
import json, math, re, sys, wave
from pathlib import Path
import numpy as np

SR = 48000
# The film starts after a 3 s credits card: every film time below is shifted by OFF; the credits use -3..0.
OFF = 3.0
DUR = 56.5 + OFF
N = int(SR * DUR)
rng = np.random.default_rng(7)
MUS = np.zeros((2, N))   # music bus
FX = np.zeros((2, N))    # effects bus
VO = np.zeros((2, N))    # voices bus


def t_axis(d):
    return np.arange(int(SR * d)) / SR


def mix(*xs):
    """Sums signals of different lengths (zero-padded)."""
    out = np.zeros(max(len(x) for x in xs))
    for x in xs:
        out[:len(x)] += x
    return out


def put(bus, start, sig, gain=1.0, pan=0.0):
    """Mixes mono `sig` into a stereo bus at `start` seconds, equal-power pan (-1 left .. 1 right)."""
    i = int((start + OFF) * SR)
    if i >= N or len(sig) == 0:
        return
    if i < 0:
        sig = sig[-i:]
        i = 0
    sig = sig[: N - i]
    a = (pan + 1) * math.pi / 4
    bus[0, i:i + len(sig)] += sig * gain * math.cos(a)
    bus[1, i:i + len(sig)] += sig * gain * math.sin(a)


def env(n, a=0.005, d=None, curve=4.0):
    """Attack then exponential decay over n samples."""
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4))
    if d is None:
        d = n / SR
    return e * np.exp(-curve * t / d)


def lowpass(x, cut):
    """One-pole low-pass (vectorised via an IIR on the cumulative trick is overkill; small loop in numpy)."""
    a = math.exp(-2 * math.pi * cut / SR)
    y = np.empty_like(x)
    acc = 0.0
    # chunked python loop is too slow for long signals; use lfilter-like recursion via np.frompyfunc fallback
    b = 1 - a
    for i in range(len(x)):
        acc = b * x[i] + a * acc
        y[i] = acc
    return y


def fft_filter(x, lo=None, hi=None):
    """Brick-ish band filter in the frequency domain with soft edges (fast for long signals)."""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    g = np.ones_like(f)
    if hi:
        g *= 1 / (1 + (f / hi) ** 4)
    if lo:
        g *= 1 / (1 + (lo / np.maximum(f, 1e-3)) ** 4)
    return np.fft.irfft(X * g, len(x))


def noise(d):
    return rng.uniform(-1, 1, int(SR * d))


def mtof(m):
    return 440 * 2 ** ((m - 69) / 12)


# ---------- instruments ----------
def gong(freq, d=1.6, bright=1.0):
    """Kulintang-like gong: a bossed-gong fundamental with inharmonic partials, a soft strike."""
    t = t_axis(d)
    s = np.sin(2 * math.pi * freq * t) * np.exp(-2.2 * t / d * 2)
    s += 0.45 * bright * np.sin(2 * math.pi * freq * 2.0 * t) * np.exp(-6 * t)
    s += 0.25 * bright * np.sin(2 * math.pi * freq * 2.76 * t) * np.exp(-9 * t)
    s += 0.12 * bright * np.sin(2 * math.pi * freq * 5.4 * t) * np.exp(-16 * t)
    s *= np.minimum(1, t / 0.004)
    return s * 0.5


def big_gong(freq=82, d=4.0):
    t = t_axis(d)
    wob = 1 + 0.004 * np.sin(2 * math.pi * 3.2 * t)
    s = np.sin(2 * math.pi * freq * wob * t) * np.exp(-0.9 * t)
    for k, a, dec in [(1.51, .5, 1.6), (2.13, .35, 2.2), (2.93, .25, 3.0), (4.1, .15, 4.0)]:
        s += a * np.sin(2 * math.pi * freq * k * t + k) * np.exp(-dec * t)
    s += 0.3 * fft_filter(noise(d), 200, 2500) * np.exp(-20 * t)
    return s * np.minimum(1, t / 0.006) * 0.5


def pluck(freq, d=0.9, bright=0.6):
    """Harp / kudyapi-like pluck: harmonics that die faster the higher they are."""
    t = t_axis(d)
    s = np.zeros_like(t)
    for k in range(1, 7):
        s += (bright ** (k - 1)) / k * np.sin(2 * math.pi * freq * k * t) * np.exp(-(2.5 + k * 1.8) * t)
    return s * np.minimum(1, t / 0.002) * 0.6


def bass(freq, d=0.6):
    t = t_axis(d)
    s = np.sin(2 * math.pi * freq * t) + 0.3 * np.sin(2 * math.pi * 2 * freq * t)
    return s * env(len(t), 0.01, d, 3.0) * 0.7


def pad(freq, d, a=0.6, cut=900):
    """Soft detuned-saw pad, filtered."""
    t = t_axis(d)
    s = np.zeros_like(t)
    for det in (-0.12, 0.0, 0.11):
        f = freq * 2 ** (det / 12)
        s += 2 * ((f * t) % 1) - 1
    s = fft_filter(s / 3, None, cut)
    e = np.minimum(1, t / a) * np.minimum(1, (d - t) / a)
    return s * e * 0.35


def tom(freq=110, d=0.35):
    t = t_axis(d)
    f = freq * (1 + 0.8 * np.exp(-t * 30))
    ph = 2 * math.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 9) * 0.9


def kick(d=0.3):
    t = t_axis(d)
    f = 50 + 120 * np.exp(-t * 35)
    return np.sin(2 * math.pi * np.cumsum(f) / SR) * np.exp(-t * 10)


def shaker(d=0.08):
    return fft_filter(noise(d), 5000, None) * env(int(SR * d), 0.003, d, 5) * 0.35


def woodblock(freq=900, d=0.12):
    t = t_axis(d)
    return (np.sin(2 * math.pi * freq * t) + 0.4 * np.sin(2 * math.pi * freq * 2.7 * t)) * np.exp(-t * 45) * 0.6


def bell(freq, d=1.2):
    t = t_axis(d)
    s = np.sin(2 * math.pi * freq * t) * np.exp(-3 * t) + 0.5 * np.sin(2 * math.pi * freq * 2.4 * t) * np.exp(-6 * t) + 0.25 * np.sin(2 * math.pi * freq * 3.9 * t) * np.exp(-9 * t)
    return s * np.minimum(1, t / 0.002) * 0.35


# ---------- sound effects ----------
def whoosh(d=0.8, f0=300, f1=3000, up=True):
    """A filtered-noise sweep."""
    x = noise(d)
    n = len(x)
    out = np.zeros(n)
    seg = 1024
    for i in range(0, n, seg):
        k = i / n
        c = f0 * (f1 / f0) ** (k if up else 1 - k)
        out[i:i + seg] = fft_filter(x[i:i + seg], c * 0.5, c * 1.6)
    e = np.sin(np.linspace(0, math.pi, n)) ** 1.5
    return out * e * 1.6


def portal_open(d=1.2):
    t = t_axis(d)
    rise = 120 * (1 + 3 * (1 - np.exp(-t * 4)))
    s = np.sin(2 * math.pi * np.cumsum(rise) / SR) * 0.4 + 0.25 * np.sin(2 * math.pi * np.cumsum(rise * 1.5) / SR)
    s *= np.minimum(1, t / 0.05) * np.exp(-t * 1.5)
    return s + whoosh(d, 400, 4000) * 0.6 + sparkle(d) * 0.5


def portal_hum(d):
    t = t_axis(d)
    lfo = 1 + 0.25 * np.sin(2 * math.pi * 2.3 * t)
    s = (np.sin(2 * math.pi * 70 * t) + 0.5 * np.sin(2 * math.pi * 105 * t * (1 + 0.01 * np.sin(2 * math.pi * 0.7 * t)))) * lfo
    s += 0.15 * fft_filter(noise(d), 300, 1200)
    e = np.minimum(1, t / 0.3) * np.minimum(1, (d - t) / 0.3)
    return s * e * 0.25


def wind(d, f=800):
    x = fft_filter(noise(d), f * 0.4, f * 1.8)
    t = t_axis(d)
    e = np.minimum(1, t / 0.4) * np.minimum(1, (d - t) / 0.3) * (0.7 + 0.3 * np.sin(2 * math.pi * 1.7 * t))
    return x * e * 1.4


def sip(d=0.5):
    """The comic slurp of being pulled in: a quick upward slide."""
    t = t_axis(d)
    f = 200 * (8 ** (t / d))
    s = np.sin(2 * math.pi * np.cumsum(f) / SR) * np.sin(np.linspace(0, math.pi, len(t)))
    return s * 0.5 + whoosh(d, 600, 6000) * 0.5


def pop(freq=500, d=0.25):
    t = t_axis(d)
    f = freq * (1 + 2 * np.exp(-t * 40))
    return np.sin(2 * math.pi * np.cumsum(f) / SR) * np.exp(-t * 18) * 0.8 + fft_filter(noise(d), 800, 5000) * np.exp(-t * 40) * 0.4


def sparkle(d=1.0, n=10, base=1800):
    out = np.zeros(int(SR * d))
    for i in range(n):
        s = bell(base * 2 ** (rng.integers(0, 12) / 6), 0.5) * 0.35
        j = int(rng.uniform(0, d * 0.7) * SR)
        out[j:j + len(s)] += s[: len(out) - j]
    return out


def thud(d=0.35):
    t = t_axis(d)
    return np.sin(2 * math.pi * np.cumsum(60 + 90 * np.exp(-t * 25)) / SR) * np.exp(-t * 12) + fft_filter(noise(d), 80, 900) * np.exp(-t * 25) * 0.6


def clop():
    t = t_axis(0.09)
    return (np.sin(2 * math.pi * 520 * t) * 0.6 + np.sin(2 * math.pi * 840 * t) * 0.4) * np.exp(-t * 60) + fft_filter(noise(0.09), 1000, 4000) * np.exp(-t * 90) * 0.5


def skid(d=0.7):
    return fft_filter(noise(d), 1500, 6000) * np.sin(np.linspace(0, math.pi, int(SR * d))) * 0.8


def neigh(d=0.9):
    t = t_axis(d)
    f = 600 + 250 * np.sin(2 * math.pi * 11 * t) * np.exp(-t * 2) + 300 * np.exp(-t * 3)
    s = np.sign(np.sin(2 * math.pi * np.cumsum(f) / SR)) * 0.4 + np.sin(2 * math.pi * np.cumsum(f * 2) / SR) * 0.3
    s = fft_filter(s, 300, 3000)
    return s * np.minimum(1, t / 0.03) * np.exp(-t * 2.5) * 0.7


def sad_trombone(start, gain=0.5):
    for i, (m, d) in enumerate([(60, .3), (59, .3), (58, .3), (57, .9)]):
        t = t_axis(d)
        f = mtof(m) * (1 + 0.02 * np.sin(2 * math.pi * 6 * t) * (t > 0.3 if d > .5 else 0.3))
        s = fft_filter(2 * ((np.cumsum(f) / SR) % 1) - 1, None, 1400) * np.minimum(1, t / 0.03) * np.minimum(1, (d - t) / 0.08)
        put(MUS, start + sum(x[1] for x in [(60, .3), (59, .3), (58, .3)][:i]), s, gain * 0.5, 0.2)


def paper(d=0.15):
    return fft_filter(noise(d), 2000, 9000) * env(int(SR * d), 0.005, d, 6) * 0.6


def crickets(d):
    out = np.zeros(int(SR * d))
    t0 = 0.0
    while t0 < d - 0.3:
        t = t_axis(0.12)
        c = np.sin(2 * math.pi * 4400 * t) * (0.5 + 0.5 * np.sign(np.sin(2 * math.pi * 30 * t))) * np.sin(np.linspace(0, math.pi, len(t)))
        j = int(t0 * SR)
        out[j:j + len(c)] += c[: len(out) - j] * 0.08
        t0 += rng.uniform(0.35, 0.9)
    return out


def waves(d):
    t = t_axis(d)
    x = fft_filter(noise(d), 150, 1400)
    swell = 0.55 + 0.45 * np.sin(2 * math.pi * t / 4.5 - 1.2) ** 2
    return x * swell * np.minimum(1, t / 0.6) * np.minimum(1, (d - t) / 0.6) * 0.9


def bonk():
    t = t_axis(0.5)
    s = woodblock(1300, 0.15)
    f = 300 * (1 + 0.4 * np.sin(2 * math.pi * 14 * t) * np.exp(-t * 4))
    boing = np.sin(2 * math.pi * np.cumsum(f) / SR) * np.exp(-t * 5) * 0.5
    out = boing.copy()
    out[: len(s)] += s
    return out


def bark():
    t = t_axis(0.16)
    f = 520 * (1 - 0.4 * t / 0.16)
    s = fft_filter(np.sign(np.sin(2 * math.pi * np.cumsum(f) / SR)) + 0.4 * noise(0.16), 300, 2500)
    return s * np.sin(np.linspace(0, math.pi, len(t))) ** 0.5 * 0.6


def steps(start, d, rate=9, gain=0.4, pan=0.0):
    k = 0.0
    while k < d:
        put(FX, start + k, woodblock(260 + rng.uniform(-40, 40), 0.05) * 0.8 + fft_filter(noise(0.05), 200, 1500) * np.exp(-t_axis(0.05) * 60) * 0.4, gain, pan)
        k += 1 / rate


def alarm(start):
    for i in range(2):
        t = t_axis(0.22)
        s = fft_filter(np.sign(np.sin(2 * math.pi * (880 if i == 0 else 660) * t)), None, 3000) * np.minimum(1, (0.22 - t) / 0.02)
        put(FX, start + i * 0.26, s, 0.18)


def slam(d=1.4):
    out = big_gong(73, d) * 1.2
    out[: int(SR * 0.4)] += kick(0.4)[: int(SR * 0.4)] * 1.2
    return out


# ---------- voices: chibi babble ----------
VOICE = {'lapulapu': 175, 'gabriela': 320, 'rizal': 235, 'bonifacio': 200, 'guard': 140, 'narrator': 0}
PAN = {'lapulapu': -0.2, 'gabriela': 0.1, 'rizal': -0.15, 'bonifacio': 0.05, 'guard': 0.4}


def babble(start, end, who, text, seed):
    """Syllable blips at the speaker's pitch, a vowel formant each, louder and higher on '!' lines."""
    f0 = VOICE[who]
    if not f0:
        return
    r = np.random.default_rng(seed)
    syl = max(2, len(re.findall(r"[aeiouAEIOU]", text)))
    span = min(end - start - 0.25, syl * 0.115)
    shout = text.count('!') >= 1
    for i in range(syl):
        d = 0.09 if i < syl - 1 else 0.18
        t = t_axis(d)
        f = f0 * 2 ** (r.integers(-3, 5) / 12) * (1.15 if shout else 1) * (1 + 0.15 * (i == syl - 1) * (1 if '?' in text else 0) * t / d)
        ph = 2 * math.pi * np.cumsum(f * np.ones_like(t)) / SR
        src = sum(np.sin(k * ph) / k for k in range(1, 9))
        form = [700, 1100, 400, 900, 550][r.integers(0, 5)]
        s = fft_filter(src, form * 0.5, form * 2.2) * np.sin(np.linspace(0, math.pi, len(t))) ** 0.6
        put(VO, start + i * span / syl, s, 0.55 if shout else 0.45, PAN.get(who, 0))


# ---------- music ----------
SCALE = [0, 2, 4, 7, 9]


def deg(root, d, octave=0):
    """Pentatonic degree d above MIDI root."""
    o, i = divmod(d, 5)
    return root + 12 * (o + octave) + SCALE[i]


def melody(start, bpm, notes, root, inst='gong', gain=0.5, pan=0.0, step=0.5):
    """notes: list of degrees or None per step (step in beats)."""
    b = 60 / bpm
    for i, d in enumerate(notes):
        if d is None:
            continue
        t0 = start + i * step * b
        f = mtof(deg(root, d))
        s = gong(f, 1.4) if inst == 'gong' else pluck(f, 1.0) if inst == 'pluck' else bell(f, 1.0)
        put(MUS, t0, s, gain, pan)


def drone(start, d, root, gain=0.35):
    put(MUS, start, pad(mtof(root - 12), d, 0.6, 600), gain, -0.3)
    put(MUS, start, pad(mtof(root - 5), d, 0.6, 700), gain * 0.7, 0.3)


def beat(start, d, bpm, pattern, inst, gain, step=0.5, pan=0.0, freq=None):
    b = 60 / bpm
    i = 0
    t = start
    while t < start + d - 1e-6:
        v = pattern[i % len(pattern)]
        if v:
            s = inst() if freq is None else inst(freq)
            put(MUS, t, s, gain * v, pan)
        i += 1
        t = start + i * step * b


_ = None


def compose():
    R = 57  # A3 root region
    # 0–4 title: dark drone, slow bells, the crack and the flash
    drone(0, 4.3, 50, 0.4)
    for i, d in enumerate([4, 2, 3, 1]):
        put(MUS, 0.4 + i * 0.5, bell(mtof(deg(62, d, 1)), 1.4), 0.35, -0.4 + i * 0.25)
    # 4–12 Mactan: warm gong melody over waves, turns tense when the portal opens
    drone(4, 1.8, 57, 0.3)
    melody(4.05, 96, [0, _, 2, _, 4, _, 2, 3], 69, 'gong', 0.42, -0.1)
    beat(4.05, 1.5, 96, [1, 0, 0, 0], lambda: bass(mtof(45), 0.6), 0.5)
    put(MUS, 5.5, pad(mtof(46), 4.6, 0.3, 500), 0.4)           # tense low cluster under the portal
    put(MUS, 5.5, pad(mtof(52), 4.6, 0.3, 700), 0.25)
    melody(6.2, 96, [3, _, 2, _, 3, _, 1, _, 3, _, 2, _, 0, _, _, _], 69, 'pluck', 0.35, 0.2)   # "Ano 'tong ilaw?" question
    beat(8.3, 1.3, 140, [1, 1, 1, 1], lambda: tom(150, 0.2), 0.35)
    put(MUS, 10.5, gong(mtof(69 + 12), 1.4), 0.4, 0.3)
    # 12–20 Ilocos: a galloping 6/8 groove, cut off by the skid; a comic sad-horse tag
    drone(12, 2.2, 55, 0.25)
    melody(12.0, 132, [4, 4, 3, 2, _, 4, 5, 4, 3, 2, _, 0], 67, 'gong', 0.4, -0.15, step=0.5)
    beat(12.0, 2.1, 132, [1, 0, 1, 1, 0, 1], lambda: tom(120, 0.2), 0.35, 0.5)
    put(MUS, 15.2, pad(mtof(47), 3.2, 0.3, 600), 0.35)
    melody(15.8, 100, [1, _, 0, _, 1, _, 3, _, 2, _, _, _], 67, 'pluck', 0.3, 0.2)
    sad_trombone(18.7, 0.9)
    # 20–28 Dapitan: night, harp arpeggios, then a fast scramble; a beat of silence for the hat
    drone(20, 1.9, 52, 0.25)
    for i in range(12):
        put(MUS, 20.05 + i * 0.15, pluck(mtof(deg(64, [0, 2, 4, 2][i % 4], 0 + (i // 8))), 1.1), 0.33, -0.3 + 0.05 * i)
    put(MUS, 21.8, pad(mtof(44), 4.5, 0.2, 600), 0.4)
    beat(24.4, 1.9, 160, [1, 0, 1, 0, 1, 1, 1, 0], lambda: tom(140, 0.18), 0.4)
    # 26.3–27: silence (the hat hovers) → zip
    put(MUS, 27.05, bell(mtof(88), 0.8), 0.35, 0.3)
    # 28–36 Manila: a rally march on drums and gongs, Bonifacio's charge
    drone(28, 1.8, 50, 0.3)
    beat(28.0, 1.8, 112, [1, 0, 1, 0, 1, 1, 1, 0], lambda: tom(100, 0.3), 0.45)
    melody(28.0, 112, [0, _, 0, 2, 4, _, 4, _, 5, 4, 2, _], 62, 'gong', 0.45, -0.1)
    put(MUS, 29.8, pad(mtof(44), 3.4, 0.2, 600), 0.4)
    melody(31.4, 112, [4, _, 4, _, 5, _, 7, _, 9, _, _, _], 62, 'gong', 0.42, 0.1)   # "Hindi ako takot!" — rising, brave
    beat(32.9, 1.0, 112, [1, 1, 1, 1, 1, 1, 1, 1], lambda: tom(110, 0.2), 0.45)
    beat(33.3, 0.6, 220, [1], lambda: tom(150, 0.15), 0.45)
    put(MUS, 34.3, big_gong(98, 2.0), 0.5)
    # 36–41 tunnel: a whirling arpeggio that speeds up, a riser into white
    for i in range(48):
        tt = 36 + 4.9 * (1 - (1 - i / 48) ** 1.6)
        put(MUS, tt, bell(mtof(deg(69, [0, 2, 4, 5, 7, 5, 4, 2][i % 8])), 0.6), 0.25, math.sin(i * 0.9) * 0.7)
    drone(36, 5.0, 53, 0.35)
    beat(36.0, 5.0, 128, [1, 0, 0, 1, 0, 0, 1, 0], lambda: kick(0.3), 0.45)
    # 41–47 museum: plucky, curious, then a sparkle of recognition; the beam's alarm
    drone(41.3, 5.2, 57, 0.22)
    melody(42.4, 118, [2, _, 1, _, 2, 3, _, _, 4, _, 3, _, 2, _, _, _], 69, 'pluck', 0.35)
    melody(44.15, 118, [5, 7, 9, 7, 10, _, _, _], 69, 'gong', 0.35, 0.2)
    put(MUS, 46.2, pad(mtof(46), 1.0, 0.1, 800), 0.35)
    # 47–52.5 guard + chase: fast drums, a chase riff from TAKBO on
    beat(47.0, 2.6, 150, [1, 0, 0, 1, 0, 0, 1, 0], lambda: tom(90, 0.25), 0.45)
    put(MUS, 47.0, pad(mtof(45), 2.6, 0.2, 700), 0.35)
    beat(49.6, 2.9, 168, [1, 0, 1, 1, 0, 1, 1, 0], lambda: tom(120, 0.18), 0.45)
    beat(49.6, 2.9, 168, [1, 1, 1, 1], shaker, 0.35, 0.25)
    melody(49.6, 168, [4, 4, 3, 2, 4, 4, 3, 2, 5, 5, 4, 3, 2, 3, 4, _], 69, 'gong', 0.42, 0.1)
    # 52.5–56.5 the title: big gong slam and the theme, then up into the portal
    melody(52.85, 100, [0, _, 2, _, 4, _, 7, _, 9, _, 7, 4, 7, _, _, _], 69, 'gong', 0.5, -0.05)
    drone(52.8, 3.5, 57, 0.4)
    beat(52.85, 2.6, 100, [1, 0, 0, 0, 1, 0, 1, 0], lambda: tom(90, 0.3), 0.45)


def effects():
    # title
    put(FX, 2.1, fft_filter(noise(0.6), 1500, 8000) * env(int(SR * 0.6), 0.003, 0.6, 4) * (np.sign(np.sin(np.arange(int(SR * 0.6)) / SR * 2 * math.pi * 23)) * 0.5 + 0.5), 0.5)
    put(FX, 2.95, whoosh(0.5, 300, 5000), 0.5)
    put(FX, 3.2, sparkle(1.0, 14), 0.6)
    put(FX, 3.2, big_gong(110, 1.6), 0.25)
    # Mactan
    put(FX, 4.0, waves(8.0), 0.35, -0.4)
    put(FX, 5.5, portal_open(1.3), 0.6, 0.4)
    put(FX, 5.6, portal_hum(5.1), 0.6, 0.4)
    put(FX, 5.65, pop(700, 0.2), 0.3, -0.2)                       # his "!" take
    put(FX, 7.4, woodblock(700, 0.1), 0.25)                        # creeping steps
    put(FX, 7.7, woodblock(650, 0.1), 0.25)
    put(FX, 8.0, woodblock(760, 0.1), 0.25)
    put(FX, 8.3, wind(2.1, 900), 0.55, 0.3)
    put(FX, 9.6, sip(0.75), 0.7, 0.3)
    put(FX, 10.4, pop(380, 0.3), 0.7, 0.3)
    put(FX, 10.45, sparkle(0.8, 6), 0.4, 0.3)
    # Ilocos
    for i in range(14):
        put(FX, 12.0 + i * 0.15 + (0.05 if i % 3 == 2 else 0), clop(), 0.45, -0.6 + i * 0.05)
    put(FX, 13.9, portal_open(1.2), 0.55, 0.45)
    put(FX, 14.0, portal_hum(4.4), 0.55, 0.45)
    put(FX, 14.1, skid(0.75), 0.55, -0.1)
    put(FX, 14.1, neigh(0.9), 0.6, -0.1)
    put(FX, 14.45, whoosh(0.6, 500, 2500), 0.5)
    put(FX, 15.15, thud(), 0.8, 0.1)
    put(FX, 15.25, bell(1500, 0.8) * 0.5 + bell(1900, 0.8) * 0.5, 0.25, 0.1)   # dizzy tweet
    put(FX, 17.0, wind(1.4, 1000), 0.5, 0.4)
    put(FX, 17.5, sip(0.75), 0.7, 0.4)
    put(FX, 18.3, pop(380, 0.3), 0.7, 0.4)
    # Dapitan
    put(FX, 20.0, crickets(8.0), 1.0, -0.5)
    for i in range(7):
        put(FX, 20.2 + i * 0.17, paper(0.06), 0.25, 0.1)          # quill scratches
    put(FX, 21.5, whoosh(0.3, 2000, 6000), 0.3)
    put(FX, 21.8, portal_open(1.2), 0.55, 0.5)
    put(FX, 21.85, portal_hum(5.5), 0.55, 0.5)
    put(FX, 24.2, wind(3.2, 1100), 0.55, 0.4)
    for i in range(4):
        put(FX, 24.5 + i * 0.18, paper(0.25), 0.45, 0.2 + 0.1 * i)
    put(FX, 24.85, pop(900, 0.15), 0.4, 0.1)                       # the hat pops off
    put(FX, 25.6, sip(0.7), 0.7, 0.45)
    put(FX, 27.0, whoosh(0.35, 800, 7000), 0.55, 0.45)             # the hat zips in after him
    put(FX, 27.35, pop(420, 0.3), 0.7, 0.45)
    # Manila
    put(FX, 29.8, portal_open(1.3), 0.6, -0.5)
    put(FX, 29.85, portal_hum(4.5), 0.55, -0.5)
    steps(33.3, 0.55, 12, 0.45, -0.2)
    put(FX, 33.85, whoosh(0.5, 400, 4000), 0.55, -0.4)
    put(FX, 34.3, mix(thud(0.4) * 0.6, pop(160, 0.35)), 0.8, -0.5)     # the portal gulps
    put(FX, 34.8, fft_filter(noise(0.6), 200, 1500) * env(int(SR * 0.6), 0.02, 0.6, 3), 0.4, -0.5)
    # tunnel
    put(FX, 36.0, wind(5.0, 700), 0.6)
    put(FX, 37.9, bonk(), 0.8)
    put(FX, 39.7, whoosh(1.3, 200, 8000), 0.7)
    put(FX, 40.6, sparkle(0.6, 10), 0.6)
    # museum
    put(FX, 41.05, sparkle(0.6, 6), 0.4)
    put(FX, 41.1, portal_open(0.8), 0.45)
    for tt, p in [(41.45, -0.4), (41.7, -0.1), (41.95, 0.1), (42.2, 0.3)]:
        put(FX, tt, thud(), 0.8, p)
    put(FX, 42.6, mix(woodblock(1600, 0.12), bell(2400, 0.4) * 0.5), 0.45, -0.05)   # hat lands on Rizal
    put(FX, 43.4, pop(500, 0.2), 0.35)                              # pop up
    put(FX, 44.15, sparkle(1.0, 12), 0.6)
    alarm(46.2)
    # guard
    steps(47.0, 0.8, 5, 0.5, 0.6)
    for tt in [47.8, 48.15, 48.5, 49.0, 49.35]:
        put(FX, tt, bark(), 0.6, 0.55)
    put(FX, 47.95, pop(800, 0.2) * 0.6 + pop(1000, 0.2) * 0.4, 0.4, -0.1)   # the heroes' !! take
    for i in range(4):
        put(FX, 50.1 + i * 0.07, whoosh(0.4, 600, 3000), 0.4, -0.3 - 0.15 * i)
    steps(50.1, 1.2, 14, 0.4, -0.5)
    steps(50.5, 1.8, 7, 0.5, 0.2)                                   # the guard's heavy chase steps
    put(FX, 51.3, whoosh(0.4, 900, 5000), 0.45, -0.2)              # Rizal dashes back for his hat
    put(FX, 51.6, pop(1100, 0.12), 0.35, -0.2)
    put(FX, 51.9, whoosh(0.4, 900, 5000), 0.45, -0.5)
    put(FX, 52.0, whoosh(0.5, 3000, 300, up=False), 0.35)            # iris closes
    # title
    put(FX, 52.5, portal_open(1.0), 0.4)
    put(FX, 52.8, slam(1.6), 0.8)
    put(FX, 52.8, sparkle(0.8, 10), 0.5)
    put(FX, 55.5, whoosh(0.8, 200, 7000), 0.8)
    put(FX, 55.55, wind(0.8, 1200), 0.5)
    put(FX, 56.1, sparkle(0.4, 10), 0.6)


def voices():
    src = (Path(__file__).parent.parent / 'src/scenes/lines.js').read_text()
    body = src[src.index('{', src.index('window.LORE_FILM')):src.rindex('}') + 1]
    js = re.sub(r"(\w+):", r'"\1":', body)                      # keys → JSON
    js = js.replace("'", '"').replace('’', "'")
    js = re.sub(r",\s*([\]}])", r"\1", js)
    film = json.loads(js.replace("'", '’'))
    for s in film['scenes']:
        for i, (a, b, who, text) in enumerate(s['lines']):
            babble(s['start'] - OFF + a + 0.15, s['start'] - OFF + b, who, text, sum(map(ord, text)) % 1000 + i)


def reverb(x, seconds=1.6, mix=0.18):
    n = int(SR * seconds)
    ir = rng.uniform(-1, 1, n) * np.exp(-np.arange(n) / SR * 4.5)
    ir[0] = 0
    L = len(x) + n
    nfft = 1 << (L - 1).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, nfft) * np.fft.rfft(ir, nfft), nfft)[: len(x)]
    y /= np.max(np.abs(y)) + 1e-9
    return x + y * mix * np.max(np.abs(x))


def credits():
    """-3..0: the credits card. A soft gong, a rising bell arpeggio as the names type on, a sparkle, then hush."""
    put(MUS, -2.95, big_gong(mtof(45), 3.0), 0.35)
    put(MUS, -2.9, pad(mtof(57), 2.6, 0.5, 700), 0.25, -0.3)
    put(MUS, -2.9, pad(mtof(64), 2.6, 0.5, 800), 0.18, 0.3)
    for i, d in enumerate([0, 2, 4, 7, 9, 7]):
        put(MUS, -2.5 + i * 0.28, bell(mtof(deg(69, d)), 1.1), 0.22, -0.4 + i * 0.16)
    put(FX, -2.45, sparkle(1.2), 0.25)
    put(FX, -1.9, sparkle(1.0), 0.2, 0.3)


def main(out):
    credits()
    compose()
    effects()
    voices()
    mixdown(out)


def mixdown(out):
    """Ducks music under voices, adds room, fades, limits and writes the buses (MUS / FX / VO, length N) as a WAV."""
    # sidechain-ish: duck music a little under each line
    duck = np.ones(N)
    k = np.abs(VO).sum(0)
    k = np.convolve(k, np.ones(SR // 10) / (SR // 10), 'same')
    duck -= 0.45 * np.clip(k / (k.max() + 1e-9) * 3, 0, 1)
    mus = np.stack([reverb(MUS[c], 2.2, 0.25) for c in range(2)]) * duck * 0.8
    fx = np.stack([reverb(FX[c], 1.2, 0.12) for c in range(2)])
    vo = np.stack([reverb(VO[c], 0.8, 0.1) for c in range(2)]) * 1.1
    mix = mus + fx + vo
    fade = np.minimum(1, np.minimum(np.arange(N) / (SR * 0.05), (N - np.arange(N)) / (SR * 0.3)))
    mix *= fade
    peak = np.max(np.abs(mix))
    mix = np.tanh(mix / peak * 1.4) / np.tanh(1.4) * 0.75   # gentle limiter
    pcm = (mix.T * 32767).astype('<i2')
    with wave.open(out, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f'wrote {out} ({N / SR:.2f}s)')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'out/intro.wav')
