# Vika website directions

This is the first redesign exploration. It contains five responsive homepage concepts, a reference board, the working brief, and a local shortlist with a feedback field.

Run `node redesign/serve.mjs` from the repository root, then open http://127.0.0.1:4173/redesign/.

The preview server uses only Node's built-in modules and listens on 127.0.0.1. There is no package install or build step. Original website files remain the baseline.

## Files

- index.html, studio.css, and studio.js implement the comparison gallery and desktop/mobile viewer.
- concept.html, concept.css, and concept.js implement the five homepage compositions.
- directions.js contains the direction names and review descriptions.
- review.md records the starting-site findings.
- ../.impeccable.md records the confirmed audience, the mobile project's written brand direction, and open decisions.
- assets/README.md records where the reused images and fonts came from.
- references/ contains screenshots of the existing website and the external reference pages.
- previews/ contains desktop screenshots of each concept for the gallery. Refresh the relevant screenshot after changing a concept's opening.

## Scope

These are local design concepts, not a published replacement website. The selected direction will receive a second round of layout variations. Final artwork, current app captures, the primary conversion action, and production signup handling still need resolution.

The concept pages have functioning navigation, a mobile menu, a screen selector, and FAQ disclosures. Their final experience link goes to the current website's signup section. They do not submit signup data themselves.

The gallery saves the shortlist and review note in this browser. Copy feedback puts a review summary on the clipboard. Nothing sends feedback to the conversation automatically.

## Verification

JavaScript syntax checks passed. Desktop rendering was inspected for all five directions, including full-page checks of the editorial and journal layouts. Phone-width previews were visually inspected. The gallery's iframe provides a 390 px preview frame, with slightly less content width where the browser uses a scrollbar.

The mobile menu, app-screen selector, FAQ disclosures, and shortlist persistence were exercised in the browser. Twenty local page and asset requests returned successfully. This is not a full accessibility audit or testing on a physical phone. Signup delivery was not tested because these concepts hand off to the existing website.
