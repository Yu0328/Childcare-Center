// usage: npm run video -- <script name in video/scripts/>   (or npm run video:desktop / video:phone)
import { execSync, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { synth } from './lib/tts.mjs';
import { record } from './lib/recorder.mjs';
import { compose } from './lib/compose.mjs';
import { serve } from './lib/serve.mjs';
import { toChapters } from './lib/timeline.mjs';

const name = process.argv[2];
if (!name) { console.error('usage: npm run video -- <name>'); process.exit(1); }
const script = (await import(pathToFileURL(resolve('video/scripts', `${name}.mjs`)).href)).default;

if (!process.env.SKIP_BUILD) execSync('npm run build:web', { stdio: 'inherit' });
// PROBE=1: drive the steps without narration or rendering — for writing and debugging step scripts.
const probe = Boolean(process.env.PROBE);
const steps = script.steps.map(step => ({ ...step, audio: step.say && !probe ? synth(step.say, { dir: 'video/out/tts' }) : undefined }));
const server = await serve('site');
console.log('recording…');
let rec;
try {
  rec = await record({ layout: script.layout, setup: script.setup, steps, framesDir: `video/out/frames-${name}`, appUrl: `${server.url}/yuying/` });
} finally {
  await server.close();
}
if (probe) { console.log('probe done', rec.unhandled); process.exit(0); }
console.log(`recorded ${rec.frames.length} frames over ${rec.end.toFixed(1)} s (${(rec.frames.length / rec.end).toFixed(1)} fps captured)`);

const musicFile = 'video/assets/music.mp3';
if (!existsSync(musicFile)) console.warn(`warning: ${musicFile} missing — rendering without music`);
const out = compose({ name, rec, outDir: 'video/out', music: existsSync(musicFile) ? musicFile : null });

const template = join('video/descriptions', `${name}.txt`);
if (existsSync(template)) {
  out.description = join('video/out', `youtube-${name}.txt`);
  writeFileSync(out.description, readFileSync(template, 'utf-8').replace('{{chapters}}', toChapters(rec.chapters)));
}
out.thumbnail = join('video/out', `thumb-${name}.png`);
execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', '1', '-i', out.mp4, '-frames:v', '1', out.thumbnail]);
console.log(out);

if (rec.unhandled.length) {
  console.error('requests the recording did not handle (blocked):');
  for (const url of rec.unhandled) console.error(`  ${url}`);
  process.exit(2);
}
