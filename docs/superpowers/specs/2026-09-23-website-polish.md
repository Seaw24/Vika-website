# Vika website polish

This pass builds on the approved ivory, gold, and dark homepage. It keeps the existing photography and real app captures. It adds no runtime dependencies.

## Homepage

The hero image now covers the entire panel. The earlier crop ended abruptly behind the phone. The gold light is softer, and fine contour lines extend the composition around the device. On desktop, the phone tilts by up to three degrees as the pointer moves. The background moves slightly with scrolling. Both effects stop for reduced motion and touch input.

The hero repeats the coaching segment starting at eight seconds in the existing short video. It skips the launch animation and leaves the full recording available in the video section.

The product section pairs each real app capture with a matching summary. The workout shows 2 of 11 reps, the rest screen shows 11 of 11 completed reps, and the plan shows four exercises. These values come from the displayed captures. Scrolling and chapter controls change the screen and summary together. Inactive screenshots are hidden from assistive technology.

Mobile setup steps have previous and next buttons and a position indicator. The product preview no longer inherits a 108-pixel sticky offset on phones. Tablets between 681 and 900 pixels have a separate hero layout that keeps the text and phone side by side.

The video player has a working play/pause button, elapsed time, and chapter progress linked to the recording. The chapter labels now match the footage. The opening introduces Vika, the middle shows counting and feedback, and the last chapter introduces the personal plan.

Buttons have press feedback and a brief highlight on hover. The feature list uses fine separators and numbered rows. FAQ answers enter gently, and the signup panel uses a line motif based on the Vika mark. The logo link now returns to the top of the document.

## Other public pages

About, Support, and Privacy use local Be Vietnam Pro fonts and the homepage palette through `interior.css`. Their simplified navigation links to existing sections. Their existing support and signup integrations remain in place.

Founder stories use native details controls, so visitors can read them with a keyboard or touchscreen. Privacy language buttons expose their selected state and no longer trigger the legacy generic modal handler. The policy body is unchanged. Closed chat controls on About are excluded from keyboard navigation.

## Verification

Run these commands from the project root:

```text
node redesign/verify-home.mjs
node redesign/verify-video.mjs
node redesign/verify-motion.mjs
node redesign/verify-pages.mjs
```

The signup tests mock the endpoint. They do not send registrations. Video tests cover reduced motion, data saving, visibility, manual pause, playback controls, and seeking. Motion tests cover pointer limits, stopping at rest, hidden tabs, touch input, reduced motion, and the observer fallback. The page check verifies local links, assets, headings, and duplicate IDs across all four public pages.

The signup endpoint still returns an opaque response. The client cannot confirm backend storage. This pass does not change that contract.

Chrome checks covered the homepage at 320, 390, 900, and 1440 pixels, plus the secondary pages at desktop and phone sizes. The checked layouts had no horizontal page overflow. Browser interactions covered chapter selection, mobile step controls, menu navigation, the return-to-top link, video seeking and elapsed time, keyboard access to founder stories, and privacy language switching. Reduced-motion and data-saver behavior were checked with the automated fixtures. These checks do not substitute for testing on physical phones or in other browser engines.

Changes remain local and are not deployed.
