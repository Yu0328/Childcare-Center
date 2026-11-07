// video/lib/tts.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ttsKey } from './timeline.mjs';

export const VOICE = 'zh-TW-HsiaoChenNeural';

export function probeDuration(file) {
  return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());
}

// Cached by voice+rate+text, so re-running a video only re-synthesizes lines that changed.
export function synth(text, { dir, rate = '+0%' }) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${ttsKey(VOICE, rate, text)}.mp3`);
  if (!existsSync(file)) {
    execFileSync('python', ['-m', 'edge_tts', '--voice', VOICE, `--rate=${rate}`, '--text', text, '--write-media', file], { stdio: 'inherit' });
  }
  return { file, duration: probeDuration(file) };
}
