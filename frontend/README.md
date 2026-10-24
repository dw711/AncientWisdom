# Frontend: 以古为鉴 / Mirror of the Past

React + Tailwind v4 + GSAP (ScrollTrigger, Flip). Two views of the same result:

| Route | View |
| --- | --- |
| `/fork` | **The Fork**: a scroll-pinned SVG that draws the trunk, then both branches. Event cards pop in as the line reaches them, years roll like an odometer, a draggable "years later" handle rides both paths together, and a year index pinned at the top expands on hover. |
| `/precedent` | **The Precedent**: a newspaper front page. The masthead drops in letter by letter, each edition column "prints" story by story, fit bars fill on scroll, a floating nav docks once the masthead scrolls away, and an initials collage reshuffles on hover. |

```sh
npm install
npm run dev        # http://localhost:5173/fork
npm run build      # typecheck + production build
```

## Data

Components are fed only by `src/data/mirror.mock.json`. Its shape is the `Mirror` type in `src/data/types.ts`, and `normalize.ts` derives everything else (years, years-later, initials, deduplicated sources).

To use the backend, set `VITE_MIRROR_API` to an endpoint that accepts `POST { "dilemma": "…" }` and returns a `Mirror`. "New dilemma" in the top bar then calls it.

Optional fields beyond the original brief, all with fallbacks: `path.reflection` (the one-line answer to "whose ten years later…"), `path.kicker` ("You go", "You stay") and `neitherReflection`.

## Notes

- **Fonts.** The Fork uses Playfair Display, Inter and IBM Plex Mono. The Precedent follows the Stripe Press reference: Editorial New for headlines, Fragment Mono for datelines and Source Serif 4 for body text. Editorial New is a licensed font, so the app uses it only if it's installed locally and otherwise falls back to Playfair Display. To ship it, add the woff2 files to `public/fonts/` and `url()` sources to the `@font-face` rules in `src/index.css`.
- **Reduced motion.** `prefers-reduced-motion: reduce` turns off all GSAP animation, including the pinning; the page then renders fully drawn.
- **Small screens.** Below 1024px wide or 620px tall, the fork turns into two stacked vertical timelines, and a range slider takes the place of the drag handle.
