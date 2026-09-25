# Vika homepage, premium direction

Written 23 September 2026. This records the design behind the root `index.html`, `home.css`, `home.js`, `home-video.js`, and `home-motion.js`. The previous iteration is kept in `redesign/iteration-1/`.

## Goal

Make the Vika homepage look like a product from a well-funded company while staying honest about what the app does today. The owner asked for the look of Superpower first, with the app-native presentation of Cal AI, and for something more creative than either.

## What each reference informs

Superpower (superpower.com):

- The hero is a dark panel inset from the page edge with 28 px corners, not a full-bleed block.
- A warm light source sits behind the subject. Vika uses its own gold for this instead of orange.
- The navigation starts as a plain row and turns into a centered dark pill once the page scrolls.
- "How it works" is a row of numbered photo cards with a small interface element floating on each.
- The product chapter has a numbered index at the right edge that tracks the active part.
- A striped two-column list summarises what is included.

Cal AI (calai.app):

- A real phone sits in the hero and shows the actual app.
- Floating chips beside the phone repeat strings that appear in the app.
- A sticky phone swaps its screen as the reader moves through short chapters.
- Rounded question cards for the FAQ.

Vika keeps its own identity: Be Vietnam Pro, ivory `#f4eee2`, ink `#1f1812`, dark `#17120e`, gold `#e5b33a`, dark gold `#7f5e10` for gold text on ivory. Gold is used as light and as the one primary button colour, never as a section fill except for the film panel.

## Page order and the job of each section

1. Hero. Says what Vika is, shows the app running, and offers the two actions. The phone plays the 13-second silent excerpt; the poster is a real capture. Three proof points close the panel.
2. How it works. Four steps: choose a goal, place the phone, train while Vika counts, review the set. Two steps use lifestyle artwork, two use app captures cropped inside a phone frame.
3. In the session. A sticky phone with three chapters: during the set, after the set, your plan. Scrolling on desktop and swiping on phones both change the screen. Clicking a chapter or the index also works.
4. Film. A gold panel with the full 29.6-second preview, loaded only on request, plus three moments that seek to 0, 10, and 20 seconds. Those times match the three app captures, which were taken from the same recording.
5. Included. Six rows describing features that are visible in the captures or already stated in the current copy.
6. FAQ. The four existing questions.
7. Signup. The same experience form, fields, validation, and Google Apps Script endpoint as before, inside a dark panel that mirrors the hero.
8. Footer.

## Copy rules applied

- Vietnamese, direct, encouraging. Existing approved lines were reused where they fit: "Tập tại nhà. Có Vika hướng dẫn." and the hero description.
- Every chip and callout uses text that appears in the app captures: "Hiệp 01 / 02 · Lunge", "11/11 rep chuẩn", "Tuần 1 · Nền tảng", "2 /11".
- No first-in-Vietnam claim, no app-store badges, no user counts or ratings.
- Captions state that images and video come from the app.

## Motion

- Page load: headline lines, description, buttons, phone, and callouts rise in sequence over about 1.3 seconds.
- Scroll: each section rises once when it enters the viewport; lists stagger their children.
- The gold light behind the hero subject breathes slowly.
- Reduced motion turns all of this off, and the hero video stays unloaded until the visitor presses play.
- Without JavaScript nothing is hidden, because the reveal styles apply only under the `js` class.

## Assets

Derived with ffmpeg on 23 September 2026 into `assets/home/`:

- `place-phone.jpg/.webp` from `Box 2.png`, 1200 px wide.
- `squat-home.jpg/.webp` from `Box 3.png`, 1200 px wide.
- `app-workout.webp`, `app-feedback.webp`, `app-plan.webp`, `training-home.webp` as WebP versions of the existing captures and photo.
- `app-workout-poster.jpg`, 480 px wide, as the poster for the full preview.

The videos are unchanged. The `Box` artwork was not verified as photography; it is used for the placement steps only and never presented as an app screenshot.

## Verification

- `node redesign/verify-home.mjs` checks local assets, anchors, and the signup script with a mocked endpoint.
- `node redesign/verify-video.mjs` checks playback preferences, visibility handling, the full preview, and seeking.
- Browser checks at 1440, 1280, 900, and 390 px: no console errors, no failed requests, no horizontal overflow, chapter switching by click, scroll, and swipe, hero autoplay and pause, full preview play and seek, FAQ, mobile menu, form rejection of a bad phone number with no request sent, reduced motion, and no-JavaScript rendering.

## Open items

- The page is not deployed and not committed.
- About, Support, and Privacy still use the older design and stylesheet.
- A fresh app recording would let the hero open on a coaching frame instead of the launch screen.
- Signup still cannot confirm that the backend saved a request, because the endpoint answers with an opaque response.
