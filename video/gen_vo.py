# Voice-over per scene. Usage: python gen_vo.py eleven|kokoro|qwen
import json, os, sys, time, urllib.request, urllib.error
import numpy as np, soundfile as sf
engine = sys.argv[1]
script = json.load(open('script.json'))
out = f'audio/{engine}'; os.makedirs(out, exist_ok=True)
dur = {}
if engine == 'kokoro':
    from kokoro import KPipeline
    p = KPipeline(lang_code='a', repo_id='hexgrad/Kokoro-82M')
if engine == 'qwen':
    import torch
    from qwen_tts import Qwen3TTSModel
    dev = 'mps' if torch.backends.mps.is_available() else 'cpu'
    m = Qwen3TTSModel.from_pretrained('Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice', device_map=dev, dtype=torch.float32)
if engine == 'eleven':
    key = [l.split('=', 1)[1].strip() for l in open('../.env.local') if l.startswith('ELEVENLABS_API_KEY=')][0]
for s in script['scenes']:
    text = s['vo']; f = f"{out}/{s['id']}.wav"; t = time.time()
    if engine == 'eleven':
        req = urllib.request.Request(
            'https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb?output_format=mp3_44100_128',
            data=json.dumps({'text': text, 'model_id': 'eleven_multilingual_v2', 'language_code': 'en',
                             'voice_settings': {'stability': 0.45, 'similarity_boost': 0.8, 'style': 0.25, 'use_speaker_boost': True}}).encode(),
            headers={'xi-api-key': key, 'Content-Type': 'application/json'})
        try:
            mp3 = urllib.request.urlopen(req, timeout=120).read()
        except urllib.error.HTTPError as e:
            raise SystemExit(f'ElevenLabs {e.code}: {e.read()[:300]!r}')
        open(f + '.mp3', 'wb').write(mp3)
        import subprocess
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', f + '.mp3', '-ar', '44100', '-ac', '1', f], check=True)
        a, sr = sf.read(f)
    elif engine == 'kokoro':
        a = np.concatenate([np.asarray(x) for _, _, x in p(text, voice='am_michael', speed=1.0)]); sr = 24000
    else:
        wavs, sr = m.generate_custom_voice(text=text, speaker=os.environ.get('QWEN_SPEAKER', 'ryan'), language='english')
        a = np.asarray(wavs[0])
    if engine != 'eleven': sf.write(f, a, sr)
    dur[s['id']] = round(len(a) / sr, 3)
    print(engine, s['id'], dur[s['id']], 's', f'({time.time()-t:.1f}s)', flush=True)
json.dump(dur, open(f'{out}/durations.json', 'w'), indent=1)
