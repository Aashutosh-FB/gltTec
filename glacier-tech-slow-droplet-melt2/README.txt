# Glacier Tech — Slow Realistic Droplet Melt Edition

This version keeps the original Glacier Tech website structure, copy,
navigation, responsive layout, supplied logo, and supplied glacier artwork.

## Animation behavior

The hero animation is intentionally slower and smoother:
- 0.3 second hold with the glacier fully intact.
- About 11.2 seconds of slow melting for a human-friendly visual rhythm.
- The glacier does not slide downward as one solid mass.
- The lower ice edge gradually recedes upward with irregular, natural variation.
- Sparse melt droplets form at the active ice edge instead of creating a broad blue stream.
- Droplets stretch into thin wet-ice threads, form heavier tips, detach, and fall into the water.
- Droplets fade when they meet the water, with a very subtle impact shimmer.
- The animation continuously reforms and repeats in a seamless 16.8-second loop.
- The animation layer renders only changed pixels, so the original image does not visibly pop back in as a second copy.
- The glacier remains upright and precisely aligned with the background image.
- Mouse-parallax remains synchronized between the background and animation.
- If WebGL is unavailable, the static hero background remains visible.

## Files

- `index.html` — page structure and hero canvas.
- `style.css` — original styling and animation-layer positioning.
- `script.js` — navigation/parallax plus the updated WebGL melt engine.
- `justWebsiteBG.png` — supplied glacier artwork, unchanged.
- `logo.png` — supplied logo, unchanged.

## Run

Keep all five files in the same folder and open `index.html` in a modern browser.
No server or external JavaScript library is required.
