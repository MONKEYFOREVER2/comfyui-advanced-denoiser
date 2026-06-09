# 🧹 Advanced Image Denoiser — ComfyUI Custom Node

Edge-preserving image denoising that removes noise **without making the image blurry**.

The node measures the actual noise level of your image (wavelet-based sigma
estimation) and, in `smart_auto` mode, applies just enough denoising to remove
it — no more. An edge-aware **detail recovery** pass then restores fine texture
from the original image along edges only, so flat areas stay clean while
detail stays sharp.

The node ships with a **custom UI panel** (slate/teal theme): a segmented
method picker with per-method descriptions, contextual sliders that only show
the parameters the selected method uses, and a collapsible advanced section.
All values sync to the standard widgets, so saved workflows and API use keep
working.

## Installation

1. Copy this folder into `ComfyUI/custom_nodes/comfyui-advanced-denoiser/`
2. Install dependencies: `pip install -r requirements.txt`
3. Optional, highest quality: `pip install bm3d`
4. Restart ComfyUI — the node is under **image → denoising**

## Methods

| Method | Best For | Notes |
|--------|----------|-------|
| 🤖 **smart_auto** | Most images — start here | Measures noise, auto-tunes NLM. `strength 0.5` = exactly the measured level |
| 🔍 **non_local_means** | Photo grain, manual control | Separate luminance / chroma strength |
| 🎯 **bilateral** | Portraits, hard edges | LAB-split, edge-preserving |
| 🪞 **guided_filter** | Fast edge-preserving smoothing | Pure numpy implementation, no extra deps |
| 〰️ **wavelet** | Fine grain | BayesShrink with per-channel auto sigma |
| 📐 **total_variation** | Flat/synthetic/AI images | Chambolle TV — strong but keeps edges |
| 🏆 **bm3d** | Maximum quality (slow) | Needs `pip install bm3d`; falls back to adaptive NLM |
| ⚡ **median** | Salt-and-pepper artifacts | Impulse noise only |

## Quick Start

1. Use **smart_auto** with `strength = 0.1–0.25` (yes, that low — higher over-smooths).
2. Raise `detail_recovery` (0.3–0.6) to bring texture back — it's edge-aware, so it won't re-add noise.
3. Color noise? Use **non_local_means** and push `chroma_strength` up (eyes barely notice chroma smoothing).
4. The `noise_report` STRING output tells you the measured noise sigma per image — wire it to a text display node to see what the node detected.

## Key parameters

- **strength** — keep LOW (default 0.15). In smart_auto, 0.5 applies exactly the
  measured noise level; 1.0 doubles it.
- **detail_recovery** — restores original high-frequency detail weighted by an
  edge map computed from the *denoised* image, soft-thresholded against the
  measured noise floor. Safe to raise.
- **luminance_strength / chroma_strength** — manual methods only. Luminance
  smoothing is what causes visible blur; chroma can go 2–3× higher safely.
- **blend_original** — final mix with the untouched input (0.1–0.2 for a
  natural look).
- **sharpen_mode** — optional post-sharpen; `luminance_only` avoids color fringing.

## Requirements

- `opencv-python >= 4.8`
- `scikit-image >= 0.21` (noise estimation, wavelet, TV — strongly recommended)
- `numpy >= 1.24`
- `bm3d` (optional — enables the bm3d method)

## Testing

A standalone smoke test is included — run it with your ComfyUI venv python:

```
python test_node.py
```

It runs every method on a synthetic noisy batch and checks shapes, dtypes,
value ranges, and that denoising actually reduces noise.

## License

MIT
