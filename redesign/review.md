# Vika website review

Reviewed the local website on 23 September 2026. This document describes the starting point for the redesign.

## Confirmed audience

The owner confirmed that the main audience remains Vietnamese beginners and busy people who want guided workouts at home.

## Existing site

The site uses static HTML, CSS, and JavaScript. Its main pages are the homepage, About, Support, and Privacy. The repository has no package manifest or build step. The CNAME points to vikavn.app.

The visual identity uses Vika's logo, yellow #ffb701, warm backgrounds, and Be Vietnam Pro. The About page explains VIKA as Vui, Khỏe, An Toàn. The project also contains a saved Swap Commerce reference page and its assets. That saved page is not the Vika application.

## What the redesign needs to resolve

1. The homepage repeats the product explanation through the problem, comparison, solution, and features sections. The actual camera coaching explanation appears below several screens of content. Lead with the product and a short explanation of what the visitor can do next.
2. The navigation has five desktop menus and includes planned features. The blog tiles open the experience signup modal. Link labels should match their destinations, and navigation should give priority to available content.
3. The headline claims that Vika is the first product of its kind for Vietnamese users. The repository does not substantiate that claim. Use descriptive product copy in the concepts.
4. The homepage cites survey percentages and labels quotations as beta-user feedback, although some quotations discuss a future product. Confirm sources and testimonial context before carrying those claims into the redesign.
5. Four PNG banners total about 17.3 MiB. The homepage loads all four without lazy loading, alongside other large PNGs. Use one purposeful hero visual and responsive compressed assets in the selected design.
6. The existing images include text within the bitmap. That text cannot reflow on mobile or be read as page text. Keep headings and explanations in HTML in new concepts.
7. Signup sends contact details to a Google Apps Script endpoint using no-cors mode, then assumes success. A production redesign needs a verifiable response before it reports a completed registration.
8. The signup modal sets aria-hidden and scroll locking but does not move or contain keyboard focus. The replacement should use an accessible form or properly managed dialog.
9. The chat uses scripted welcome messages and requires contact details before conversation. Its message renderer inserts text through innerHTML. Review this separately before reusing it in the new implementation.

## Preserve through implementation

- Use Vietnamese as the primary language and fonts that cover Vietnamese diacritics.
- Keep the Vika identity recognizable until the owner chooses a visual direction.
- Preserve access to About, Support, and the existing Privacy page.
- Retain the signup field requirements and referral support unless the product flow changes.
- Use the existing privacy document as the source for data handling statements. Product copy must reflect available functionality.

## Review process

Confirm the primary visitor action and brand tone. Collect references and explain which design choices each reference informs. Build five distinct concepts with a comparable content brief, including body sections and mobile layouts. Let the owner choose a direction before expanding it into three layout variations and a final implementation.

Preview work lives in redesign/. The original pages remain the baseline for comparison.
