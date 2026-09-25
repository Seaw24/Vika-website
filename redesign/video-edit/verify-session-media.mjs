import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const [ffmpeg] = process.argv.slice(2);
if (!ffmpeg) throw new Error('Pass the path to ffmpeg.');
const ffprobe = path.join(path.dirname(ffmpeg), 'ffprobe.exe');
const film = 'assets/home/session-preview.mp4';
function run(command, args, binary = false) {
  const result = spawnSync(command, args, { encoding: binary ? undefined : 'utf8', maxBuffer: 32 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr.toString());
  return result;
}
const metadata = JSON.parse(run(ffprobe, ['-v', 'error', '-show_entries',
  'format=duration,size:stream=codec_type,codec_name,profile,width,height,avg_frame_rate,nb_frames', '-of', 'json', film]).stdout);
assert.equal(Number(metadata.format.duration), 20);
const stream = metadata.streams[0];
assert.equal(stream.nb_frames, '600');
assert.equal(stream.avg_frame_rate, '30/1');
assert.equal(stream.profile, 'Main');
assert.equal(stream.width, 720);
assert.equal(stream.height, 1560);
assert.equal(metadata.streams.length, 1);
run(ffmpeg, ['-v', 'error', '-i', film, '-f', 'null', '-']);

const frames = JSON.parse(run(ffprobe, ['-v', 'error', '-show_entries',
  'frame=best_effort_timestamp_time', '-of', 'json', film]).stdout).frames;
for (let i = 1; i < frames.length; i++) {
  const gap = Number(frames[i].best_effort_timestamp_time) - Number(frames[i - 1].best_effort_timestamp_time);
  assert.ok(Math.abs(gap - 1 / 30) < 0.000002, `Irregular frame timing at ${i}`);
}

// Check movement within the athlete's region, away from titles and the rep counter.
// End before the fade. Merely reporting a 30 fps container missed this regression.
const pixels = run(ffmpeg, ['-v', 'error', '-ss', '3', '-t', '9.8', '-i', film, '-an',
  '-vf', 'crop=604:708:58:452,scale=116:136,format=gray', '-f', 'rawvideo', '-'], true).stdout;
const frameSize = 116 * 136;
let nearlyUnchanged = 0;
for (let frame = 1; frame < pixels.length / frameSize; frame++) {
  let difference = 0;
  for (let pixel = 0; pixel < frameSize; pixel++) difference += Math.abs(pixels[frame * frameSize + pixel] - pixels[(frame - 1) * frameSize + pixel]);
  if (difference / frameSize < 0.7) nearlyUnchanged++;
}
assert.ok(nearlyUnchanged < 15, `Camera holds detected in ${nearlyUnchanged} frames`);

const ending = run(ffmpeg, ['-hide_banner', '-ss', '18', '-t', '2', '-i', film,
  '-ss', '27.6', '-t', '2', '-i', 'assets/home/app-preview.mp4', '-an',
  '-lavfi', '[0:v]setpts=PTS-STARTPTS[a];[1:v]setpts=PTS-STARTPTS[b];[a][b]ssim', '-f', 'null', '-']);
const similarity = Number(ending.stderr.match(/All:([\d.]+)/)?.[1]);
assert.ok(similarity > 0.99, `The ending differs from the original film: SSIM ${similarity}`);
console.log(JSON.stringify({ duration: 20, frames: 600, bytes: Number(metadata.format.size), nearlyUnchanged,
  endingSimilarity: similarity, decodeErrors: 0, timing: 'uniform 30 fps' }, null, 2));
