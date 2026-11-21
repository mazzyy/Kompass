import time, torch, soundfile as sf
from qwen_tts import Qwen3TTSModel
t=time.time()
dev = "mps" if torch.backends.mps.is_available() else "cpu"
m = Qwen3TTSModel.from_pretrained("Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice", device_map=dev, dtype=torch.float32)
print("loaded", round(time.time()-t,1), "s on", dev)
print("speakers", m.get_supported_speakers())
print("languages", m.get_supported_languages())
t=time.time()
wavs, sr = m.generate_custom_voice(text="Meet Kompass. Know who needs you, before the deadline does.", speaker="ryan", language="english")
sf.write("audio/test/qwen_ryan.wav", wavs[0], sr)
print("generated", round(len(wavs[0])/sr,2), "s audio in", round(time.time()-t,1), "s")
