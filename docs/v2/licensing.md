# Third-party licenses for commercial distribution

Audit of 2026-10-19 (not legal advice). V = read the license text or binary, U = inferred.

| Item | License | What it means for a paid, closed-source web app and desktop app |
|---|---|---|
| Remotion 4.0.534 (`remotion`, `@remotion/player`, `web-renderer`, `google-fonts`, `renderer`) | Remotion License (source-available). Free for individuals, for-profits up to 3 people, and non-profits (V) | **4+ people** (contractors included) need a paid license. remotion.pro lists prompt-to-video apps under Automators ($0.01 per render, $100/month minimum) or Enterprise (V, web). Their FAQ forbids letting users "bring their own Remotion code" to your service. **Ask Remotion** whether model-written bespoke TSX counts (U). Client renders always report usage to remotion.pro, including the page origin. Disclose this in the privacy policy (V). Set `NEXT_PUBLIC_REMOTION_LICENSE_KEY`. |
| FFmpeg in `@remotion/compositor-win32-x64-msvc` | GPLv2+ build that also enables `libfdk_aac`, which is GPL-incompatible (V) | Only the dev CLI render (`npm run render`) uses it. **Not shipped in the desktop app** (only `desktop/server` is packaged). Keep it out unless legal approves. |
| Electron 44.9.0 | MIT (V); Chromium third-party notices ship inside the Electron dist (U) | Keep `LICENSE` and `LICENSES.chromium.html` in the install. |
| mediabunny (+ aac/flac/mp3 encoders) | MPL-2.0; the mp3 encoder is WASM LAME, LGPL (V) | Ship the notices. Changes to MPL files must be published. LGPL parts must stay replaceable. |
| sharp / libvips (`@img/sharp-win32-x64`, pulled in by Next) | Apache-2.0 + LGPL-3.0 (V) | It is in the standalone server. Either set `images.unoptimized` and drop it, or meet LGPL (separate DLLs, offer the source). |
| caniuse-lite | CC-BY-4.0 (V) | Attribution. |
| remotion-opus-skill, bang-motion (adapted prompts and kit) | MIT (V) | MIT requires the copyright **and permission text** in copies. Not yet in the repo. Add a `THIRD_PARTY_NOTICES` file. |
| cinetic (`kit/cinetic.tsx`: motion tokens, camera, pace, MaskRise, Scramble) | MIT (V) | Adapted code: the MIT text is in `THIRD_PARTY_NOTICES.md` and the file header. |
| HyperFrames catalog blocks (`kit/blocks.tsx`) | Apache-2.0 (V) | Motion re-implemented, nothing copied; credited in `THIRD_PARTY_NOTICES.md` and the file header. Do not copy their GSAP code (GSAP Standard License forbids no-code animation builders). |
| prompt-motion.com prompts | No licence; "belong to their creators"; robots `use=reference` (V) | Not copied. Only general patterns informed our own brief template. |
| Animation skill rules distilled into the prompt (Emil Kowalski, wheresryan22: MIT; pbakaus/impeccable: Apache-2.0) | as listed (V) | Only paraphrased rules and numbers were used, no code. Attribution is kept in `prompts.ts` and `kit/motion.ts`. |
| Motion (motion.dev) | MIT (V) | Not used. |
| Fonts (40 families via `@remotion/google-fonts`, UI fonts via `next/font`) | Mostly OFL-1.1 / Apache (U per family) | Loaded at runtime, not redistributed. Bundling them for offline use needs each font's license file. |
| Music `public/music` (FreePD) | CC0, per `CREDITS.md`, sourced from a mirror because FreePD closed (V for the repo claim) | Archive proof of the CC0 dedication. |
| Samples (VCSL) | CC0 (V claim) | none |
| Sound effects `public/audio` | synthesized by `scripts/make-audio.mjs` (V) | none |
| ElevenLabs output | per the customer's plan; Starter and above list commercial use (V, pricing page) | Customers use their own keys: say in your terms that a paid ElevenLabs plan is needed for commercial videos. |
| This repository | MIT, and **public** on GitHub (V) | Published commits stay MIT. Going closed means a private repo plus a new license for future work (the owner's decision). |

## Action items

1. Confirm headcount. Buy the Remotion license if over 3 people. Ask Remotion about bespoke code and about desktop distribution.
2. Set `NEXT_PUBLIC_REMOTION_LICENSE_KEY` in production builds.
3. Add `THIRD_PARTY_NOTICES` (MIT texts for remotion-opus-skill and bang-motion; MPL-2.0; LGPL for LAME and libvips; CC-BY; Electron and Chromium notices). Show it on an About screen.
4. Decide on sharp: drop it from the desktop server, or comply with LGPL.
5. Relicense going forward (private repo, proprietary `LICENSE`, EULA in the installer).
6. Archive the FreePD CC0 evidence.
