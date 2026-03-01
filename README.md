# 🧹 Advanced Image Denoiser — ComfyUI Custom Node

A premium ComfyUI custom node for image denoising with **6 algorithms**, a **dark neon-themed UI**, **separate luminance/chrominance control**, and **built-in sharpening**.

![ComfyUI](https://img.shields.io/badge/ComfyUI-Custom_Node-purple?style=for-the-badge)
![Python](https://img.shields.io/badge/Python-3.10+-blue?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

---

## 📦 Installation

### Option 1: Git Clone (Recommended)

Open a terminal and navigate to your ComfyUI `custom_nodes` folder, then clone:

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/MONKEYFOREVER2/comfyui-advanced-denoiser.git
```

Then install the Python dependencies:

```bash
cd comfyui-advanced-denoiser
pip install -r requirements.txt
```

> **Note:** If you're using a virtual environment or portable ComfyUI, make sure to activate it first before running `pip install`.

### Option 2: Manual Download

1. Click the green **Code** button on this page → **Download ZIP**
2. Extract the ZIP into your `ComfyUI/custom_nodes/` folder
3. Make sure the folder is named `comfyui-advanced-denoiser` (remove any `-main` suffix)
4. Open a terminal in that folder and run: `pip install -r requirements.txt`

### Option 3: ComfyUI Manager

Search for **"Advanced Image Denoiser"** in ComfyUI Manager and click Install.

### After Installation

**Restart ComfyUI.** The node will appear under **image → denoising → 🧹 Advanced Image Denoiser**.

---

## 🔍 Finding the Node

Right-click the canvas → **Add Node** → search for **"Advanced Image Denoiser"**
Or navigate: **image** → **denoising** → **🧹 Advanced Image Denoiser**

---

## 🎨 Features

- **Premium dark-themed UI** with neon purple/green/orange accents
- **6 denoising algorithms** with dynamic method-specific controls
- **Separate luminance & chrominance** denoising (LAB color space)
- **Detail preservation** via high-frequency blending
- **3 sharpening modes** for post-denoise detail enhancement
- **Batch processing** support
- **Beginner-friendly** descriptions, star ratings, and tooltips for every setting

---

## 🧪 Denoising Methods

| Method | Rating | Best For |
|--------|--------|----------|
| ⚡ **Auto-Blend** | ★★★★★ | **Start here.** Smart combo of NLM + Bilateral |
| 🔍 **NLM** | ★★★★☆ | Photos with grain/noise |
| 🎯 **Bilateral** | ★★★★☆ | Portraits, architecture (sharp edges) |
| 〰️ **Wavelet** | ★★★★☆ | Subtle, fine-grained noise |
| ☁️ **Gaussian** | ★★★☆☆ | Quick, light smoothing |
| ⚡ **Median** | ★★★☆☆ | Salt-and-pepper / digital artifacts |

---

## ✨ Sharpening Modes

Applied **after** denoising to recover fine detail:

| Mode | Description |
|------|-------------|
| 🔪 **Unsharp Mask** | Classic sharpening — good for general detail |
| 🔬 **High-Pass** | Extracts and boosts fine micro-detail (textures, pores, hair) |
| 💡 **Luminance Only** | Sharpens brightness without color fringing — best for photos |

---

## ⚙️ Parameters

### Core Controls
| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| **Strength** | 0–1 | 0.50 | Overall denoising intensity |
| **Preserve Detail** | 0–1 | 0.70 | Blends sharp detail from original back in |

### Channel Controls
| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| **Luminance** | 0–1 | 0.50 | Brightness channel denoising |
| **Chrominance** | 0–1 | 0.50 | Color channel denoising |

### Method-Specific (shown/hidden dynamically)
| Parameter | Methods | Description |
|-----------|---------|-------------|
| **Patch Size** | NLM, Auto-Blend | Comparison patch dimension |
| **Search Window** | NLM, Auto-Blend | Area searched for similar patches |
| **Sigma Spatial** | Bilateral, Auto-Blend | Spatial smoothing radius |
| **Sigma Color** | Bilateral, Auto-Blend | Color similarity threshold |
| **Wavelet Levels** | Wavelet | Decomposition depth |

### Sharpening
| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| **Amount** | 0–1 | 0.00 | Sharpening intensity |
| **Radius** | 0.05–1 | 0.30 | Detail scale (low = micro-detail, high = edges) |

### Blending
| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| **Blend Original** | 0–1 | 0.00 | Mix denoised with original for natural results |

---

## 🚀 Quick Start

1. Add a **Load Image** node and connect it to **🧹 Advanced Image Denoiser**
2. Connect the output to a **Preview Image** or **Save Image** node
3. Start with **Auto-Blend** at `strength = 0.3`, `preserve_detail = 0.7`
4. For subtle results, set `blend_original = 0.1–0.3`
5. Enable **Luminance Only** sharpening at `amount = 0.2` for a final polish

```
[Load Image] ──→ [🧹 Advanced Image Denoiser] ──→ [Preview Image]
```

---

## 📋 Requirements

- **ComfyUI** (any recent version)
- **Python** 3.10+
- `opencv-python >= 4.8.0`
- `scikit-image >= 0.21.0` *(optional — wavelet mode falls back to Gaussian if missing)*
- `numpy >= 1.24.0`

---

## 📄 License

MIT — free for personal and commercial use.

---

## 🙏 Credits

Built with ❤️ by [MONKEYFOREVER2](https://github.com/MONKEYFOREVER2)
