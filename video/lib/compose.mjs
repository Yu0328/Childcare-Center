// video/lib/compose.mjs
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { frameDurations, toSrt, toChapters } from './timeline.mjs';

const MUSIC_VOLUME = 0.22;

export function compose({ name, rec, outDir, music }) {
  mkdirSync(outDir, { recursive: true });
  const D = rec.end.toFixed(3);

  // Frames → concat list (variable frame times), re-timed to constant 30 fps below.
  const durations = frameDurations(rec.frames.map(f => f.t), rec.end);
  const lines = rec.frames.flatMap((f, i) => [`file '${resolve(f.file).replace(/\\/g, '/')}'`, `duration ${durations[i].toFixed(4)}`]);
  lines.push(`file '${resolve(rec.frames.at(-1).file).replace(/\\/g, '/')}'`); // concat demuxer drops the last duration otherwise
  const listFile = join(outDir, `${name}-frames.txt`);
  writeFileSync(listFile, lines.join('\n'));

  // shortcut: every narration clip is its own ffmpeg input; ~400 clips hits the Windows
  // command-line limit — pre-mix narration into one wav first if a script gets that long.
  // Without music (file not there yet) the narration alone becomes the soundtrack.
  const inputs = ['-f', 'concat', '-safe', '0', '-i', listFile];
  if (music) inputs.push('-stream_loop', '-1', '-i', music);
  const first = music ? 2 : 1;
  rec.clips.forEach(c => inputs.push('-i', c.file));
  const voiceParts = rec.clips.map((c, i) => {
    const ms = Math.round(c.start * 1000);
    return `[${i + first}:a]adelay=${ms}|${ms}[v${i}]`;
  });
  const voiceMix = `${rec.clips.map((_, i) => `[v${i}]`).join('')}amix=inputs=${rec.clips.length}:normalize=0`;
  const graph = [
    ...voiceParts,
    ...(music ? [
      `${voiceMix},asplit[voice][key]`,
      `[1:a]volume=${MUSIC_VOLUME},afade=t=in:d=1.5,afade=t=out:st=${Math.max(0, rec.end - 3).toFixed(3)}:d=3[music]`,
      `[music][key]sidechaincompress=threshold=0.02:ratio=6:attack=30:release=500[ducked]`,
      `[voice][ducked]amix=inputs=2:normalize=0,atrim=0:${D}[aout]`,
    ] : [`${voiceMix},apad,atrim=0:${D}[aout]`]),
    `[0:v]scale=${rec.size.w}:${rec.size.h},setsar=1,fps=30,format=yuv420p[vout]`,
  ].join(';');
  const graphFile = join(outDir, `${name}-graph.txt`);
  writeFileSync(graphFile, graph);

  const mp4 = join(outDir, `${name}.mp4`);
  execFileSync('ffmpeg', [
    '-y', '-v', 'warning', ...inputs,
    '-filter_complex_script', graphFile, '-map', '[vout]', '-map', '[aout]',
    '-t', D, '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', mp4,
  ], { stdio: 'inherit' });

  const srt = join(outDir, `${name}.srt`);
  writeFileSync(srt, toSrt(rec.cues));
  const chapters = join(outDir, `${name}-chapters.txt`);
  writeFileSync(chapters, toChapters(rec.chapters));
  return { mp4, srt, chapters };
}
