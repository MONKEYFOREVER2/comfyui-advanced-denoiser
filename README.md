# 🧹 Advanced Image Denoiser — ComfyUI Custom Node

A premium ComfyUI custom node for image denoising with **6 algorithms**, a **dark neon-themed UI**, and **separate luminance/chrominance control**.

## Installation

1. Copy this folder into `ComfyUI/custom_nodes/comfyui-advanced-denoiser/`
2. Install dependencies: `pip install -r requirements.txt`
3. Restart ComfyUI — find the node under **image → denoising**

## Methods

| Method | Best For | Rating |
|--------|----------|--------|
| ⚡ **Auto-Blend** | Overall best results (NLM + Bilateral combo) | ★★★★★ |
| 🔍 **NLM** | Photos with grain/noise | ★★★★☆ |
| 🎯 **Bilateral** | Portraits, sharp edges | ★★★★☆ |
| 〰️ **Wavelet** | Subtle, fine-grained noise | ★★★★☆ |
| ☁️ **Gaussian** | Quick, light smoothing | ★★★☆☆ |
| ⚡ **Median** | Salt-and-pepper artifacts | ★★★☆☆ |

## Quick Start

1. Start with **Auto-Blend** at `strength = 0.3`, `preserve_detail = 0.7`
2. For photos with grain, try **NLM** at `strength = 0.4–0.6`
3. For portraits, use **Bilateral** with higher `preserve_detail`
4. Use `blend_original = 0.1–0.3` for the most natural results

## Requirements

- ComfyUI (any recent version)
- `opencv-python >= 4.8.0`
- `scikit-image >= 0.21.0` (optional — wavelet falls back to Gaussian)
- `numpy >= 1.24.0`

## License

MIT
