"""
Advanced Image Denoiser — ComfyUI Custom Node
==============================================
Edge-preserving denoising with automatic noise estimation.
Removes noise WITHOUT making the image blurry:
  - smart_auto measures the actual noise level and applies just enough
    denoising (NLM on luminance, stronger on chroma).
  - All methods support edge-aware detail recovery, which restores fine
    texture from the original only where real detail exists (edges),
    not in flat areas where it would re-inject noise.
"""

import numpy as np
import torch
import cv2

try:
    from skimage.restoration import (
        estimate_sigma,
        denoise_wavelet,
        denoise_tv_chambolle,
    )
    HAS_SKIMAGE = True
except ImportError:
    HAS_SKIMAGE = False

try:
    import bm3d as _bm3d
    HAS_BM3D = True
except ImportError:
    HAS_BM3D = False


# ── Tensor conversion ─────────────────────────────────────────────────────

def tensor_to_numpy(tensor):
    """ComfyUI IMAGE [H,W,C] float32 0–1 → numpy [H,W,C] uint8 RGB."""
    return np.clip(tensor.cpu().numpy() * 255.0, 0, 255).astype(np.uint8)


def numpy_to_tensor(img):
    """numpy [H,W,C] uint8 → torch [H,W,C] float32 0–1."""
    return torch.from_numpy(img.astype(np.float32) / 255.0)


def ensure_odd(n, minimum=1):
    n = max(minimum, int(n))
    return n if n % 2 == 1 else n + 1


# ── Noise estimation ──────────────────────────────────────────────────────

def estimate_noise_sigma(img_bgr):
    """Estimate noise standard deviation (0–255 scale).

    Uses skimage's wavelet-based estimator when available, otherwise
    Immerkaer's fast Laplacian method.
    """
    if HAS_SKIMAGE:
        sigma = estimate_sigma(
            img_bgr.astype(np.float32) / 255.0,
            channel_axis=-1, average_sigmas=True,
        )
        return float(sigma) * 255.0

    # Immerkaer (1996): noise variance from a Laplacian convolution
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    kernel = np.array([[1, -2, 1], [-2, 4, -2], [1, -2, 1]], np.float32)
    conv = cv2.filter2D(gray, -1, kernel)
    h, w = gray.shape
    sigma = np.sum(np.abs(conv)) * np.sqrt(np.pi / 2.0) / (6.0 * (w - 2) * (h - 2))
    return float(sigma)


# ── Edge-aware detail recovery ────────────────────────────────────────────

def recover_detail(original, denoised, amount, noise_sigma):
    """Restore high-frequency detail from the original — but only along
    edges and textured regions. Flat areas keep the denoised result so
    noise is not re-injected (the flaw in naive unsharp-style blending).
    """
    if amount <= 0.005:
        return denoised

    orig_f = original.astype(np.float32)
    den_f = denoised.astype(np.float32)

    # High-frequency layer of the original
    blur = cv2.GaussianBlur(orig_f, (0, 0), sigmaX=1.5)
    detail = orig_f - blur

    # Edge map from the DENOISED image (clean gradients, no noise edges)
    gray = cv2.cvtColor(denoised, cv2.COLOR_BGR2GRAY).astype(np.float32)
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    mag = cv2.GaussianBlur(np.sqrt(gx * gx + gy * gy), (0, 0), sigmaX=2.0)

    # Soft threshold: weight 0 in flat areas, →1 where gradient clearly
    # exceeds what the measured noise level could produce.
    lo = max(2.0, noise_sigma * 2.0)
    hi = lo * 4.0
    weight = np.clip((mag - lo) / (hi - lo), 0.0, 1.0)
    weight = weight[..., None]

    out = den_f + detail * weight * amount
    return np.clip(out, 0, 255).astype(np.uint8)


# ── Guided filter (self-guided, pure numpy/cv2 — no contrib needed) ──────

def guided_filter_gray(I, radius, eps):
    """Classic He et al. guided filter, image guiding itself. I in 0–1."""
    r = int(radius)
    ksize = (2 * r + 1, 2 * r + 1)
    mean_I = cv2.boxFilter(I, -1, ksize)
    mean_II = cv2.boxFilter(I * I, -1, ksize)
    var_I = mean_II - mean_I * mean_I
    a = var_I / (var_I + eps)
    b = mean_I - a * mean_I
    mean_a = cv2.boxFilter(a, -1, ksize)
    mean_b = cv2.boxFilter(b, -1, ksize)
    return mean_a * I + mean_b


def denoise_guided(img_bgr, lum_str, chroma_str):
    """Edge-preserving guided-filter denoise in LAB space."""
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB).astype(np.float32) / 255.0
    L, A, B = lab[..., 0], lab[..., 1], lab[..., 2]
    if lum_str > 0.005:
        # eps is squared-intensity scale (0–1 image): comparable to the
        # noise variance it should smooth over.
        eps = (0.01 + lum_str * 0.2) ** 2
        L = guided_filter_gray(L, radius=2 + int(lum_str * 4), eps=eps)
    if chroma_str > 0.005:
        eps = (0.02 + chroma_str * 0.3) ** 2
        r = 3 + int(chroma_str * 6)
        A = guided_filter_gray(A, radius=r, eps=eps)
        B = guided_filter_gray(B, radius=r, eps=eps)
    lab = np.clip(np.stack([L, A, B], axis=-1) * 255.0, 0, 255).astype(np.uint8)
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)


# ── Denoise methods ───────────────────────────────────────────────────────

def denoise_nlm(img_bgr, lum_str, chroma_str, patch_size, search_window):
    """Non-Local Means. Strength maps to gentle h values: 0.1 → h≈4."""
    h = lum_str * 40.0
    h_c = chroma_str * 40.0
    if h < 0.5 and h_c < 0.5:
        return img_bgr.copy()
    tw = ensure_odd(patch_size, 3)
    sw = ensure_odd(search_window, 7)
    return cv2.fastNlMeansDenoisingColored(
        img_bgr, None, max(0.5, h), max(0.5, h_c), tw, sw
    )


def denoise_nlm_auto(img_bgr, strength, chroma_boost, patch_size, search_window):
    """Noise-adaptive NLM: h derived from the measured noise level.

    h = 1.15 * sigma is the standard heuristic; `strength` scales it
    (1.0 = exactly the heuristic, lower = gentler).
    """
    sigma = estimate_noise_sigma(img_bgr)
    h = 1.15 * sigma * strength * 2.0          # strength 0.5 = heuristic
    h_c = h * chroma_boost                     # chroma can take more
    if h < 0.5:
        return img_bgr.copy(), sigma
    tw = ensure_odd(patch_size, 3)
    sw = ensure_odd(search_window, 7)
    out = cv2.fastNlMeansDenoisingColored(
        img_bgr, None, h, max(h, h_c), tw, sw
    )
    return out, sigma


def denoise_bilateral(img_bgr, lum_str, chroma_str):
    """Bilateral filter in LAB. Sigmas scale from strength — gentle by default."""
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
    L, A, B = cv2.split(lab)
    if lum_str > 0.005:
        d = 5 + 2 * int(lum_str * 3)
        L = cv2.bilateralFilter(L, d, sigmaColor=10 + lum_str * 60,
                                sigmaSpace=10 + lum_str * 30)
    if chroma_str > 0.005:
        d = 7 + 2 * int(chroma_str * 3)
        A = cv2.bilateralFilter(A, d, sigmaColor=10 + chroma_str * 80,
                                sigmaSpace=10 + chroma_str * 40)
        B = cv2.bilateralFilter(B, d, sigmaColor=10 + chroma_str * 80,
                                sigmaSpace=10 + chroma_str * 40)
    return cv2.cvtColor(cv2.merge([L, A, B]), cv2.COLOR_LAB2BGR)


def denoise_wavelet_img(img_bgr, strength, wavelet_level):
    """Wavelet BayesShrink. sigma=None lets skimage auto-estimate per
    channel; strength then scales the result by blending with the input."""
    if not HAS_SKIMAGE:
        print("[AdvancedDenoiser] scikit-image missing — using guided filter")
        return denoise_guided(img_bgr, strength, strength)
    rgb_f = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    out = denoise_wavelet(
        rgb_f, method="BayesShrink", mode="soft",
        wavelet_levels=int(wavelet_level), sigma=None,
        channel_axis=-1, rescale_sigma=True,
    )
    # strength 1.0 = full wavelet result, lower blends toward original
    mix = np.clip(strength * 2.0, 0.0, 1.0)
    out = rgb_f * (1.0 - mix) + out * mix
    out8 = np.clip(out * 255.0, 0, 255).astype(np.uint8)
    return cv2.cvtColor(out8, cv2.COLOR_RGB2BGR)


def denoise_tv(img_bgr, strength):
    """Total Variation (Chambolle) — removes noise while keeping edges
    piecewise-smooth. Good for synthetic / cartoon-like images."""
    if not HAS_SKIMAGE:
        print("[AdvancedDenoiser] scikit-image missing — using guided filter")
        return denoise_guided(img_bgr, strength, strength)
    rgb_f = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    out = denoise_tv_chambolle(rgb_f, weight=strength * 0.2, channel_axis=-1)
    out8 = np.clip(out * 255.0, 0, 255).astype(np.uint8)
    return cv2.cvtColor(out8, cv2.COLOR_RGB2BGR)


def denoise_bm3d_img(img_bgr, strength):
    """BM3D — best classical denoiser available. Slow but excellent.
    Requires `pip install bm3d`; falls back to auto-NLM otherwise."""
    sigma = estimate_noise_sigma(img_bgr)
    if not HAS_BM3D:
        print("[AdvancedDenoiser] bm3d not installed — using adaptive NLM "
              "(pip install bm3d to enable)")
        out, _ = denoise_nlm_auto(img_bgr, strength, 1.5, 7, 21)
        return out
    rgb_f = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    psd = max(0.5, sigma * strength * 2.0) / 255.0
    out = _bm3d.bm3d_rgb(rgb_f, psd)
    out8 = np.clip(out * 255.0, 0, 255).astype(np.uint8)
    return cv2.cvtColor(out8, cv2.COLOR_RGB2BGR)


def denoise_median_img(img_bgr, strength):
    """Median filter — only for salt-and-pepper / impulse noise."""
    if strength <= 0.005:
        return img_bgr.copy()
    ks = ensure_odd(3 + int(strength * 6), 3)
    return cv2.medianBlur(img_bgr, min(ks, 9))


# ── ComfyUI Node ─────────────────────────────────────────────────────────

class AdvancedImageDenoiser:
    """🧹 Advanced Image Denoiser"""

    METHODS = [
        "smart_auto",
        "non_local_means",
        "bilateral",
        "guided_filter",
        "wavelet",
        "total_variation",
        "bm3d",
        "median",
    ]

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "method": (cls.METHODS, {
                    "default": "smart_auto",
                    "tooltip": "smart_auto measures the noise level and "
                               "applies just enough denoising. bm3d is the "
                               "highest quality (needs `pip install bm3d`).",
                }),
                "strength": ("FLOAT", {
                    "default": 0.15, "min": 0.0, "max": 1.0, "step": 0.01,
                    "display": "slider",
                    "tooltip": "Keep this LOW (0.05–0.25). In smart_auto, "
                               "0.5 applies exactly the measured noise level; "
                               "higher over-smooths.",
                }),
                "detail_recovery": ("FLOAT", {
                    "default": 0.35, "min": 0.0, "max": 1.0, "step": 0.01,
                    "display": "slider",
                    "tooltip": "Edge-aware: restores fine texture from the "
                               "original along edges only, so flat areas stay "
                               "clean. Safe to raise.",
                }),
            },
            "optional": {
                "luminance_strength": ("FLOAT", {
                    "default": 0.10, "min": 0.0, "max": 1.0, "step": 0.01,
                    "display": "slider",
                    "tooltip": "Manual methods only. Brightness-channel "
                               "denoising — keep low, this is what causes "
                               "blur if overdone.",
                }),
                "chroma_strength": ("FLOAT", {
                    "default": 0.30, "min": 0.0, "max": 1.0, "step": 0.01,
                    "display": "slider",
                    "tooltip": "Color-noise removal. Eyes are less sensitive "
                               "to chroma blur, so this can be 2–3× higher "
                               "than luminance.",
                }),
                "patch_size": ("INT", {
                    "default": 7, "min": 3, "max": 15, "step": 2,
                    "tooltip": "NLM comparison patch (odd). 7 is standard.",
                }),
                "search_window": ("INT", {
                    "default": 21, "min": 7, "max": 35, "step": 2,
                    "tooltip": "NLM search area (odd). Bigger = better but slower.",
                }),
                "wavelet_level": ("INT", {
                    "default": 3, "min": 1, "max": 6, "step": 1,
                    "tooltip": "Wavelet decomposition depth.",
                }),
                "blend_original": ("FLOAT", {
                    "default": 0.0, "min": 0.0, "max": 1.0, "step": 0.01,
                    "display": "slider",
                    "tooltip": "Mix the untouched original back in for a "
                               "natural look (0.1–0.2 is plenty).",
                }),
                "sharpen_mode": (["off", "unsharp_mask", "luminance_only"], {
                    "default": "off",
                    "tooltip": "Optional post-sharpen. luminance_only avoids "
                               "color fringing.",
                }),
                "sharpen_amount": ("FLOAT", {
                    "default": 0.20, "min": 0.0, "max": 1.0, "step": 0.01,
                    "display": "slider",
                    "tooltip": "Sharpening intensity.",
                }),
                "sharpen_radius": ("FLOAT", {
                    "default": 0.30, "min": 0.05, "max": 1.0, "step": 0.01,
                    "display": "slider",
                    "tooltip": "Detail scale: low = fine micro-detail.",
                }),
            },
        }

    RETURN_TYPES = ("IMAGE", "STRING")
    RETURN_NAMES = ("image", "noise_report")
    FUNCTION = "denoise"
    CATEGORY = "image/denoising"

    DESCRIPTION = (
        "Edge-preserving denoising with automatic noise estimation and "
        "edge-aware detail recovery — removes noise without blur."
    )

    def denoise(self, image, method, strength, detail_recovery,
                luminance_strength=0.10, chroma_strength=0.30,
                patch_size=7, search_window=21, wavelet_level=3,
                blend_original=0.0, sharpen_mode="off",
                sharpen_amount=0.20, sharpen_radius=0.30):

        results = []
        reports = []

        for i in range(image.shape[0]):
            img_np = tensor_to_numpy(image[i])
            img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
            original = img_bgr.copy()

            sigma = estimate_noise_sigma(img_bgr)

            if method == "smart_auto":
                out, sigma = denoise_nlm_auto(
                    img_bgr, strength, chroma_boost=1.8,
                    patch_size=patch_size, search_window=search_window,
                )
            elif method == "non_local_means":
                out = denoise_nlm(img_bgr, luminance_strength,
                                  chroma_strength, patch_size, search_window)
            elif method == "bilateral":
                out = denoise_bilateral(img_bgr, luminance_strength,
                                        chroma_strength)
            elif method == "guided_filter":
                out = denoise_guided(img_bgr, luminance_strength,
                                     chroma_strength)
            elif method == "wavelet":
                out = denoise_wavelet_img(img_bgr, strength, wavelet_level)
            elif method == "total_variation":
                out = denoise_tv(img_bgr, strength)
            elif method == "bm3d":
                out = denoise_bm3d_img(img_bgr, strength)
            elif method == "median":
                out = denoise_median_img(img_bgr, strength)
            else:
                out = img_bgr

            out = recover_detail(original, out, detail_recovery, sigma)

            if blend_original > 0.005:
                out = cv2.addWeighted(out, 1.0 - blend_original,
                                      original, blend_original, 0)

            if sharpen_mode != "off" and sharpen_amount > 0.005:
                out = apply_sharpening(out, sharpen_mode,
                                       sharpen_amount, sharpen_radius)

            out_rgb = cv2.cvtColor(out, cv2.COLOR_BGR2RGB)
            results.append(numpy_to_tensor(out_rgb))
            reports.append(
                f"img {i}: noise sigma={sigma:.2f}/255 "
                f"({'low' if sigma < 3 else 'moderate' if sigma < 8 else 'high'}), "
                f"method={method}"
            )

        return (torch.stack(results, dim=0), "\n".join(reports))


# ── Sharpening ───────────────────────────────────────────────────────────

def apply_sharpening(img_bgr, mode, amount, radius):
    sigma = max(0.5, radius * 3.0)
    if mode == "unsharp_mask":
        img_f = img_bgr.astype(np.float32)
        blurred = cv2.GaussianBlur(img_f, (0, 0), sigmaX=sigma)
        out = img_f + amount * 1.5 * (img_f - blurred)
        return np.clip(out, 0, 255).astype(np.uint8)
    if mode == "luminance_only":
        lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
        L, A, B = cv2.split(lab)
        L_f = L.astype(np.float32)
        blurred = cv2.GaussianBlur(L_f, (0, 0), sigmaX=sigma)
        L_out = np.clip(L_f + amount * 1.5 * (L_f - blurred), 0, 255)
        return cv2.cvtColor(
            cv2.merge([L_out.astype(np.uint8), A, B]), cv2.COLOR_LAB2BGR
        )
    return img_bgr
