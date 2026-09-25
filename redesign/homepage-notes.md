# Homepage redesign

The root `index.html` is a static Vietnamese landing page served by `home.css`, `home.js`, `home-video.js`, and `home-motion.js`. The other pages use `styles.css`, `script.js`, and the shared refinements in `interior.css`.

The latest pass is recorded in [Website polish](../docs/superpowers/specs/2026-09-23-website-polish.md). It adds pointer depth, screen summaries, video chapter progress, mobile step controls, a tablet hero layout, and matching styles for the secondary pages.

## Iteration 2, 23 September 2026

The current build follows the design in `../docs/superpowers/specs/2026-09-23-homepage-premium-design.md`. Superpower informed the inset dark hero, the gold light behind the subject, the floating pill navigation, the photo step cards, the chapter index, and the striped feature list. Cal AI informed the phone in the hero, the floating chips with real app strings, the sticky phone that swaps screens, and the FAQ cards. Vika keeps its palette, Be Vietnam Pro, Vietnamese copy, and real app captures.

Iteration 1, built earlier the same day from Cal AI and Headspace, is preserved in `iteration-1/` for comparison.

## Files

- `home.js` handles screen switching for the in-session chapters and the signup form. It listens for a `vika:screen` event so the scroll logic can stay separate.
- `home-video.js` handles the muted hero excerpt, the full preview, and the moment buttons that seek to 0, 10, and 20 seconds.
- `home-motion.js` handles navigation, the mobile menu, section reveals, pointer depth, step controls, and the chapter observer. Desktop uses vertical scrolling; phones use a horizontal swipe row.

## Signup

Signup remains connected to the existing Google Apps Script endpoint with the same fields. The form validates phone numbers before sending. The endpoint uses an opaque response, so the client cannot verify that the backend saved a submission. No live test registrations were sent.

## Assets

Production assets live in `../assets/home/`. The app captures and lifestyle photo were copied from the earlier reference exploration; provenance is in `assets/README.md` in this directory. On 23 September 2026 ffmpeg produced WebP versions of the captures, 1200 px JPEG and WebP versions of `Box 2.png` and `Box 3.png` as `place-phone` and `squat-home`, and a 480 px poster from the workout capture. Video details are in `../assets/home/video-provenance.md`.

## Verification

`node redesign/verify-home.mjs` checks local assets, anchors, signup payload normalization, invalid input, and request failure with a mocked endpoint. `node redesign/verify-video.mjs` checks playback preference, visibility, manual pause, full preview, and seek behavior.

Browser checks ran with Playwright driving the installed Chrome at 1440, 1280, 900, and 390 px. They found no console errors, no failed requests, and no horizontal overflow. They exercised chapter switching by click, scroll, and swipe, hero autoplay and pause, full preview play and seek, FAQ disclosure, the mobile menu, form rejection of an invalid phone number with no request sent, reduced motion, and rendering with JavaScript disabled.

The page has not been deployed. About, Support, and Privacy now share the homepage typography and palette.
