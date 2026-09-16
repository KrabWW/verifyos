#!/usr/bin/env python3
"""VerifyOS 宣传片 CosyVoice 配音生成（remotion-tts-video skill 工作流）"""
import os, sys, json
import torch, torchaudio

COSYVOICE_DIR = "/Users/xielaoban/openClaw/tts/CosyVoice"
sys.path.insert(0, COSYVOICE_DIR)
sys.path.insert(0, os.path.join(COSYVOICE_DIR, "third_party/Matcha-TTS"))

from cosyvoice.cli.cosyvoice import CosyVoice

OUTPUT_DIR = "public/audio"  # 相对于 Remotion 项目根
os.makedirs(OUTPUT_DIR, exist_ok=True)

# 口语化文案（3-4 字/秒；去书面标点；数字概括）
NARRATIONS = {
    "hero":    "测试，不该从写用例开始，而应该从一句话开始。",
    "input":   "你只需要告诉它，这次要验证什么。",
    "crawl":   "它会自己打开你的系统，逐页探索，自动发现登录和权限。",
    "login":   "遇到登录墙，就在对话里填一次账号，凭据加密保存，探索自动继续。",
    "crawl2":  "十八个页面，四十二个交互，自动生成应用地图。",
    "suggest": "结合需求和风险，AI 挑出值得验证的点，由你来勾选确认。",
    "run":     "每一步都有截图和网络为证，失败自动归因，直达根因。",
    "mobile":  "移动端也一样，从登录到点击，每一步都有思考和证据。",
    "outro":   "VerifyOS，中文 AI 测试平台，私有化部署，现在就开始。",
}

SPEAKER = "中文女"  # 标准普通话，自然亲切，适合产品介绍

model = CosyVoice(os.path.join(COSYVOICE_DIR, 'pretrained_models/CosyVoice-300M-SFT'),
                  load_jit=False, load_trt=False, fp16=False)

durations = {}
for scene_name, text in NARRATIONS.items():
    out_path = os.path.join(OUTPUT_DIR, f'{scene_name}.wav')
    if os.path.exists(out_path.replace('.wav', '.mp3')):
        # 已生成过，跳过但重新测时长
        import subprocess
        try:
            dur = float(subprocess.check_output([
                'ffprobe', '-v', 'quiet', '-show_entries', 'format=duration',
                '-of', 'csv=p=0', out_path.replace('.wav', '.mp3')]).decode().strip())
            durations[scene_name] = round(dur, 2)
            print(f"skip {scene_name}: {dur:.2f}s (mp3 exists)")
            continue
        except Exception:
            pass
    chunks = []
    for result in model.inference_sft(text, SPEAKER):
        chunks.append(result['tts_speech'])
    full_audio = torch.cat(chunks, dim=1)
    torchaudio.save(out_path, full_audio, 22050)
    durations[scene_name] = round(full_audio.shape[1] / 22050, 2)
    print(f"generated {scene_name}: {durations[scene_name]}s")

# 写入两份：public/audio/durations.json（参考）+ src/durations.json（Root.tsx 静态导入）
json.dump(durations, open(os.path.join(OUTPUT_DIR, 'durations.json'), 'w'), indent=2)
src_durations = {k: v for k, v in durations.items()}
json.dump(src_durations, open('src/durations.json', 'w'), indent=2)
print("durations:", json.dumps(durations, ensure_ascii=False))
