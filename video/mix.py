# Builds the soundtrack for one voice and muxes it with the silent video.
# Usage: python mix.py eleven|kokoro|qwen
import json, subprocess, sys
import numpy as np, soundfile as sf

engine = sys.argv[1]
SR = 48000
T = json.load(open(f'timings_{engine}.json'))
total = T['total']
N = int(total * SR) + SR
out = np.zeros((N, 2), dtype=np.float64)

def load(path):
    a, sr = sf.read(path, always_2d=True)
    if sr != SR:
        tmp = path + f'.{SR}.wav'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-ar', str(SR), tmp], check=True)
        a, sr = sf.read(tmp, always_2d=True)
    if a.shape[1] == 1: a = np.repeat(a, 2, axis=1)
    return a

def place(a, t, gain=1.0):
    i = int(t * SR)
    if i >= N: return
    j = min(N, i + len(a))
    out[i:j] += a[: j - i] * gain

def cut(a, start, dur, fade=0.25):
    s = a[int(start * SR): int((start + dur) * SR)].copy()
    f = int(fade * SR); fi = int(0.01 * SR)
    s[:fi] *= np.linspace(0, 1, fi)[:, None]
    s[-f:] *= np.linspace(1, 0, f)[:, None]
    return s

def norm(a, peak=1.0):
    m = np.abs(a).max()
    return a * (peak / m) if m > 0 else a

# --- voice
voice = np.zeros((N, 2))
for s in T['scenes']:
    path = f'audio/{engine}/{s["id"]}.wav'
    a = load(path)
    room = s['dur'] - (s['voStart'] - s['start']) - 0.25
    if len(a) / SR > room and s['kind'] != 'end':
        # slightly faster so the line fits the scene (only if a voice is longer than the picture)
        tempo = min(1.12, (len(a) / SR) / room)
        tmp = path + '.fit.wav'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-filter:a', f'atempo={tempo:.4f}', '-ar', str(SR), tmp], check=True)
        a = load(tmp)
        print(f'{s["id"]}: tempo x{tempo:.3f}')
    a = norm(a, 0.9)
    i = int(s['voStart'] * SR); j = min(N, i + len(a))
    voice[i:j] += a[: j - i]
    if s.get('appStart'):
        b = norm(load(f'audio/app/{s["id"]}.wav'), 0.85)
        i = int(s['appStart'] * SR); j = min(N, i + len(b))
        voice[i:j] += b[: j - i]

# --- music, ducked under the voice
music = load('audio/sfx/music.wav')
if len(music) < N: music = np.concatenate([music, music])[:N]
music = norm(music[:N], 1.0)
env = np.abs(voice[:, 0])
win = int(0.35 * SR)
env = np.convolve(env, np.ones(win) / win, mode='same')
active = np.clip(env / 0.04, 0, 1)
k = int(0.4 * SR)
active = np.convolve(active, np.ones(k) / k, mode='same')
gain = 0.30 - 0.20 * active            # ~ -10 dB in gaps, ~ -20 dB under the voice
reveal = next((x['start'] for x in T['scenes'] if x['kind'] == 'logo'), 0.0)
fade_in = np.clip((np.arange(N) - (reveal - 0.3) * SR) / (1.2 * SR), 0, 1)   # music arrives with "This is Kompass"
fade_out = np.clip((total * SR - np.arange(N)) / (3.0 * SR), 0, 1)
music = music * (gain * fade_in * fade_out)[:, None]

# --- effects
sw = load('audio/sfx/scifi_swish.wav')
whooshes = [cut(sw, 0.55, 1.5), cut(sw, 47.02, 1.6), cut(sw, 49.66, 1.6), cut(sw, 3.39, 1.6), cut(sw, 38.54, 1.6), cut(sw, 42.52, 1.6)]
swl = load('audio/sfx/swishes.wav')
whooshes.append(cut(swl, 5.5, 1.5))
whooshes = [norm(w, 1.0) for w in whooshes]
bell = norm(cut(load('audio/sfx/glass_bell.wav'), 8.76, 4.0, fade=1.5), 1.0)

def click():
    n = int(0.03 * SR)
    rng = np.random.default_rng(3)
    x = rng.standard_normal(n) * np.exp(-np.linspace(0, 9, n))
    x = np.diff(np.concatenate([[0], x]))          # brighter
    return np.repeat(norm(x, 1.0)[:, None], 2, axis=1)

fx = np.zeros((N, 2))
def put(a, t, g):
    i = int(t * SR)
    if 0 <= i < N:
        j = min(N, i + len(a)); fx[i:j] += a[: j - i] * g

for n, s in enumerate(T['scenes']):
    if n > 0 and s['sfx'] not in ('impact',): put(whooshes[n % len(whooshes)], max(0, s['start'] - 0.55), 0.22)
    if s['sfx'] == 'bell': put(bell, s['start'] + 0.35, 0.28)
    if s.get('wow'): put(bell, s['start'] + 1.3, 0.16)          # when the spotlight appears
    if s['kind'] == 'screen':
        put(click(), s['start'] + 0.75, 0.10)                 # caption appears

# dark bed before the reveal: low drone (fear), clock ticks during the countdown, impact on the stakes
tt = np.arange(N) / SR
drone = (np.sin(2 * np.pi * 55 * tt) * 0.6 + np.sin(2 * np.pi * 82.4 * tt) * 0.35 + np.sin(2 * np.pi * 110 * tt) * 0.15) * (0.75 + 0.25 * np.sin(2 * np.pi * 0.15 * tt))
denv = np.clip(tt / 1.0, 0, 1) * np.clip((reveal + 0.4 - tt) / 1.2, 0, 1)
drone = np.repeat((drone * denv * 0.10)[:, None], 2, axis=1)
def tick():
    n = int(0.05 * SR); x = np.sin(2 * np.pi * 2600 * np.arange(n) / SR) * np.exp(-np.linspace(0, 12, n))
    return np.repeat(x[:, None], 2, axis=1)
def boom():
    n = int(1.6 * SR); k = np.arange(n) / SR
    f = 75 * np.exp(-k * 1.4) + 32
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-k * 2.6)
    return np.repeat(norm(x, 1.0)[:, None], 2, axis=1)
for sc in T['scenes']:
    if sc['kind'] == 'countdown':
        run = max(1.5, sc['dur'] * 0.62)
        k = 0.0; step = 0.42
        while k < run:
            put(tick(), sc['start'] + k, 0.22); step = max(0.16, step * 0.9); k += step
        put(boom(), sc['start'] + run, 0.55)
    if sc.get('sfx') == 'impact':
        put(boom(), sc['start'] + 0.15, 0.5)
mix = voice * 1.0 + music + fx + drone
peak = np.abs(mix).max()
mix = mix / peak * 0.93
# gentle stereo width for music/effects
sf.write(f'audio/mix_{engine}.wav', mix[: int(total * SR)], SR)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', f'out/video_{engine}_silent.mp4', '-i', f'audio/mix_{engine}.wav',
                '-c:v', 'copy', '-af', 'loudnorm=I=-14:TP=-1.2:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', f'out/Kompass_pitch_{engine}.mp4'], check=True)
print('wrote', f'out/Kompass_pitch_{engine}.mp4')
