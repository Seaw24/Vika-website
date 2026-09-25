# Website videos

## Hero

`app-preview.mp4` is the full 29.6-second promotional preview. The hero plays it from the beginning and loops the entire file. It pauses outside the viewport, when the tab is hidden, or when the session film plays. Reduced motion and data saver prevent automatic playback.

The source is `Seaw24/Vika`, `.lavish/app-store-upload-2026-09-05/vika-app-preview-iphone-6.7.mp4`. The matching local source was read from `C:/Nam career/Projects/Vinafit_mobile` on 23 September 2026. The web export is 720 × 1560, H.264, CRF 24, with faststart, and is 3,228,768 bytes. Its silent audio track was omitted. FFmpeg measured the source track's maximum and mean volume at -91 dB.

`hero-preview.mp4` is an older 13-second export at 360 pixels wide. The homepage no longer references it.

## Real session film

`session-preview.mp4` is a 20-second edit of the owner's attached recording, supplied on 23 September 2026. It replaces the promotional preview in the lower video section. The original recording remains unchanged in Downloads.

The session film starts automatically when at least 20% of the player is visible and loops the full edit. It pauses offscreen and when the tab is hidden. A visitor's manual pause persists when scrolling away and back. Reduced motion and data saver keep playback manual. The page provides a compact pause control in place of the native video toolbar.

Source filename: `AQPjFKXs6bcXrdebROuINZq_uQBz2pgArENo3L17HWSLHFcp2jCSXPkfWXLfO6UoGWJr3L-8ZLPy8gR9dAIQYf1CK_j7PrM6QhS4BvND-Q.mp4`

Source SHA-256: `9b0c158b2167ebc697c3314f8fcc94225157337245db09c8bc1108e1e19f514f`

The source is 153.433 seconds, 720 × 1560, at 30 fps. The edit uses a continuous excerpt from a Jumping Jack set and its actual 95/100 result. Exercise footage plays at its original speed. Navigation, camera adjustments, and the later squat set are omitted.

The first export included the source's 0:56 to 1:06 passage. That passage has uneven camera updates despite its nominal 30 fps. A comparison of the athlete's image region found 98 nearly unchanged frame transitions in ten seconds, followed by larger jumps in movement. The revised cut uses 0:42 to 0:52, which has only two such transitions. It also removes the brief hold before the first rep. No synthetic motion frames or repeated reps are added.

| Output time | Source time | Content |
| --- | --- | --- |
| 0:00 to 0:03 | 0:37 to 0:40 | Ready countdown |
| 0:03 to 0:13 | 0:42 to 0:52 | Continuous movement |
| 0:13 to 0:18 | 1:09.7 to 1:14.7 | Actual score animation and result |
| 0:18 to 0:20 | Promotional film, 0:27.6 to 0:29.6 | Original Vika logo animation and tagline |

The workout crop trims excess ceiling and removes the OS status bar and lower phone controls. A feathered blur and darker edges reduce distractions at the sides. The room remains visible. The rep counter and pose overlay come from the source recording. The edit removes the floating AssistiveTouch button with a localized patch outside the body and counter.

Ivory and gold titles use the site's Be Vietnam Pro fonts. Short fades separate the workout and result. The ending reuses the final two seconds of `app-preview.mp4`, including its original logo, background, and tagline. The source audio is omitted for a silent website film. The player note explicitly identifies the film as an edited, silent excerpt.

The revised export is 720 × 1560, 30 fps, 600 frames, H.264 Main profile, CRF 21, yuv420p, with faststart. It is 3,252,799 bytes. Lossless intermediate clips feed a single final encode, with a two-second maximum keyframe interval and a 3 Mbps bitrate cap. `session-poster.jpg` is frame 240 of this edit.

`redesign/video-edit/verify-session-media.mjs` checks the full decode, frame timing, camera movement, and ending. The final file has no decode errors and uniform frame timestamps. The ending's structural similarity to the original is 0.996283 after web encoding.

Rebuild from the repository root with Node and FFmpeg 9 or newer:

```powershell
node redesign/video-edit/build-session.mjs '<path-to-original-recording.mp4>' '<path-to-ffmpeg.exe>'
```

The script reads the recording, writes intermediate clips to the system temporary folder, and exports the film and poster into `assets/home`. It does not modify the source.
