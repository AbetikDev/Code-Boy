# Code Boy original pixel art

The runtime artwork is complete and ships with the extension. No image-generation service is called at runtime. The mascot is an original small robot creature with a navy display face, mint eyes, an orange antenna and a purple programmer hoodie.

## Inventory

- **60 character animations:** eight horizontal 64 × 64 frames per sheet; 512 × 64 PNGs with transparency. Each animation has at least four distinct drawn frames. There are 18 named idle activities plus the default idle loop, four coding stages, four vibe stages, five dances, music, expressions, interaction chains and rare events.
- **28 room assets:** 15 separate transparent props, six complete 192 × 160 room backgrounds, and seven visible cosmetic upgrade overlays. Themes are DEFAULT, NIGHT, CYBER, FOREST, SPACE and RETRO_PC.
- **45 game icons:** original 16 × 16 pixel icons including every supported language. Language tiles are custom abbreviations rather than copied logos.
- **Six animated effects:** hearts, music notes, confetti, bug, sparkles and rain, each with eight 32 × 32 frames.
- **Extension branding:** `icons/activity.svg` is a monochrome pixel silhouette for the VS Code Activity Bar; `icons/extension.png` is a 128 × 128 raster marketplace icon.

`manifest.json` is the complete runtime inventory. All `src` values are relative to the extension root, for example `assets/character/coding/codeboy_coding.png`. Character and effect metadata is also stored beside each PNG as JSON. Metadata specifies the frame size, frame count, FPS, loop flag, priority, rarity where relevant and the next clip for animation chains.

## Rendering contract

Draw room backgrounds at logical size 192 × 160. Draw the character in a 64 × 64 cell at **x = 64, y = 64**. The desk and chair are already behind the character in complete room backgrounds. No character is baked into those backgrounds. Separate room props remain available for customization.

Draw optional `cosmetic_*` room overlays after the background and before the character: `coffee_mug` at (127,95), `poster` at (151,17), `headphones` at (14,65), `new_desk` at (28,107), `rgb_pc` at (155,112), `hoodie` at (136,41), and `rare_room` at (0,0). These replace or decorate the basic room furnishings as the corresponding cosmetics are unlocked.

Sprite sheets have a single horizontal row, no padding or bleed. Frame `n` starts at `n * frameWidth`. Scale by whole integers using nearest-neighbor rendering. Use `image-rendering: pixelated`, disable canvas image smoothing, and never smooth between source pixels.

All runtime pixels have alpha **0 or 255**. The drawings use flat colors, stepped corners, deliberate pixel highlights and dark outlines. There are no antialiased edges or gradients. All animations share the same source character drawing and controlled pose parameters, preventing proportions or palette from drifting between sheets.

## Rebuild

From the repository root:

```sh
python scripts/generate-assets.py
```

Python 3 and its standard library are sufficient. The generator contains the original pixel artwork and a small PNG encoder. It regenerates runtime assets, individual metadata, the manifest, prompt catalog and overview sheets. It does **not** alter the AI concept reference.

## Provenance and prompts

The built-in OpenAI image-generation tool generated `reference/codeboy-concept.png` as an original visual development reference for this project. The image was visually inspected and retained unchanged. It is **reference artwork**, not a frame atlas used by the extension. Aligned runtime sprites and room scenes are original native-resolution drawings implemented in the source generator. No resizing or extraction of generated art is used to simulate aligned pixel sprites.

The exact concept prompt is recorded in `reference/concept-prompt.txt`. `generation-prompts.json` records the character design, every animation prompt, every room asset prompt and every icon prompt, with the distinction between generated reference art and executable runtime art explicit.

`reference/room-overview.png` and `reference/sprite-overview.png` are QA contact sheets made from the runtime artwork at an exact 2× scale. They are development previews; production code reads only the files referenced by the manifest and extension branding.

All artwork was made for this project. No existing game characters, commercial icon library, copyrighted sprite sheet or brand logo was copied.
