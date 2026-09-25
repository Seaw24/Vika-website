import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// Run from the repository root. The original recording is read without modification.
const [recording, ffmpeg] = process.argv.slice(2);
if (!recording || !ffmpeg) throw new Error('Usage: node redesign/video-edit/build-session.mjs <recording.mp4> <ffmpeg.exe>');
const scratch = path.join(os.tmpdir(), 'vika-session-edit-20260923');
await mkdir(scratch, { recursive: true });
const ink = '0x17120e';
const ivory = '0xf4eee2';
const gold = '0xe5b33a';
const font = 'assets/home/fonts/BeVietnamPro-Regular.ttf';
const bold = 'assets/home/fonts/BeVietnamPro-Bold.ttf';
const textRoot = 'redesign/video-edit';
const copy = {
  brand: 'Vika',
  intro: 'MỘT HIỆP TẬP THẬT',
  ready: 'Sẵn sàng cùng Vika.',
  workout: 'Cứ tập. Vika đếm rep.',
  exercise: 'JUMPING JACK',
  resultLabel: 'SAU HIỆP TẬP',
  result: 'Nhìn lại từng rep.',
  foot: 'Trích đoạn ghi hình từ ứng dụng',
  readyFoot: 'Đặt điện thoại. Vào vị trí.',
  resultFoot: 'Kết quả của hiệp tập vừa rồi',
};
for (const [key, value] of Object.entries(copy)) await writeFile(`${textRoot}/${key}.txt`, value, 'utf8');
const label = (key, x, y, size, color = ivory, weight = font, extra = '') =>
  `drawtext=fontfile=${weight}:textfile=${textRoot}/${key}.txt:x=${x}:y=${y}:fontsize=${size}:fontcolor=${color}${extra}`;
const heading = (small, title) => [
  label('brand', 48, 62, 42, gold, bold),
  'drawbox=x=48:y=132:w=624:h=1:color=0xe5b33a@0.3:t=fill',
  label(small, 48, 178, 21, gold),
  label(title, 48, 216, 38, ivory, bold),
].join(',');
const footer = key => [
  'drawbox=x=48:y=1378:w=624:h=1:color=0xe5b33a@0.25:t=fill',
  label(key, '(w-tw)/2', 1420, 25),
  label('foot', '(w-tw)/2', 1470, 20, '0xb6a992'),
].join(',');

const clips = [
  { name: 'ready', start: 37, duration: 3, title: 'ready', small: 'intro', foot: 'readyFoot', fadeIn: true },
  // Later camera frames become uneven. Keep the continuous, smoothly recorded passage.
  { name: 'reps', start: 42, duration: 10, title: 'workout', small: 'exercise', foot: 'exercise', fadeOut: true },
  { name: 'result', start: 69.7, duration: 5, title: 'result', small: 'resultLabel', foot: 'resultFoot', result: true, fadeIn: true, fadeOut: true },
];

function run(args) {
  const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`FFmpeg exited with ${result.status}`);
}
// Encode the whole timeline together so cuts share one decoder configuration.
const encode = ['-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-profile:v', 'main', '-level:v', '4.0',
  '-pix_fmt', 'yuv420p', '-fps_mode', 'cfr', '-r', '30', '-g', '60', '-bf', '2', '-refs', '3', '-maxrate', '3M', '-bufsize', '6M',
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
  '-video_track_timescale', '15360', '-movflags', '+faststart'];
const intermediates = [];
const lossless = ['-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '0', '-pix_fmt', 'yuv420p', '-r', '30', '-threads', '4'];
for (const clip of clips) {
  let treatment;
  if (clip.result) {
    // Only remove the floating iOS AssistiveTouch button, away from result content.
    treatment = '[0:v]delogo=x=598:y=1110:w=110:h=145:show=0,crop=720:1120:0:120,scale=624:970,setsar=1[content];';
  } else {
    // Keep the full width of the athlete. Crop the ceiling and device controls.
    // A feathered blur affects only the far sides below the athlete's shoulders.
    treatment = '[0:v]crop=692:1030:14:260,format=yuv420p,eq=contrast=1.055:brightness=-0.017:saturation=0.90,split=3[clean][soft][mask];' +
      '[soft]gblur=sigma=14,eq=brightness=-0.105:saturation=0.72[blurred];' +
      "[mask]geq=lum='255*clip((abs(X-W/2)-W*(0.46-0.14*clip((Y-300)/220,0,1)))/65,0,1)':cb=128:cr=128[edge];" +
      '[clean][blurred][edge]maskedmerge=planes=1,delogo=x=595:y=865:w=92:h=145:show=0,' +
      'vignette=angle=PI/6,scale=720:1072,setsar=1[content];';
  }
  const y = 286;
  const x = clip.result ? 48 : 0;
  let finish = `${heading(clip.small, clip.title)},${footer(clip.foot)}`;
  if (clip.fadeIn) finish += `,fade=t=in:st=0:d=0.2:color=${ink}`;
  if (clip.fadeOut) finish += `,fade=t=out:st=${clip.duration - 0.2}:d=0.2:color=${ink}`;
  const filter = `${treatment}color=c=${ink}:s=720x1560:r=30:d=${clip.duration}[base];` +
    `[base][content]overlay=x=${x}:y=${y}:shortest=1,${finish}[out]`;
  const filterPath = path.join(scratch, `${clip.name}.filter`);
  const intermediate = path.join(scratch, `${clip.name}-lossless.mp4`);
  await writeFile(filterPath, filter, 'utf8');
  console.log(`Rendering ${clip.name}`);
  run(['-ss', String(clip.start), '-t', String(clip.duration), '-i', recording, '-filter_complex_threads', '2',
    '-/filter_complex', filterPath, '-map', '[out]', '-t', String(clip.duration), ...lossless, '-y', intermediate]);
  intermediates.push(intermediate);
}

// Reuse the exact final two seconds of the original promotional film.
const ending = path.join(scratch, 'original-ending-lossless.mp4');
run(['-ss', '27.6', '-t', '2', '-i', 'assets/home/app-preview.mp4', '-vf', 'scale=720:1560,setsar=1', '-t', '2', ...lossless, '-y', ending]);
intermediates.push(ending);
const concatPath = path.join(scratch, 'lossless-concat.txt');
await writeFile(concatPath, intermediates.map(file => `file '${file.replaceAll('\\', '/')}'`).join('\n'), 'utf8');
const finalPath = path.join(scratch, 'session-final.mp4');
console.log('Rendering the 20-second session with the original Vika ending');
run(['-f', 'concat', '-safe', '0', '-i', concatPath, '-t', '20', ...encode, '-threads', '4', '-y', finalPath]);
await copyFile(finalPath, 'assets/home/session-preview.mp4');
run(['-ss', '8', '-i', 'assets/home/session-preview.mp4', '-frames:v', '1', '-q:v', '2', '-update', '1', '-y', 'assets/home/session-poster.jpg']);
console.log('Saved the 20-second session film and its poster.');
