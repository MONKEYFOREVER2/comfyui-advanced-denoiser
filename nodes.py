"""
Advanced Image Denoiser — ComfyUI Custom Node
==============================================
6 denoising algorithms with LAB-space luminance/chrominance control
and high-frequency detail preservation.
"""

import numpy as np
import torch
import cv2


# ── Helpers ───────────────────────────────────────────────────────────────

def tensor_to_numpy(tensor):
    """ComfyUI IMAGE [B,H,W,C] float32 0–1 → numpy [H,W,C] uint8 RGB."""
    return np.clip(tensor[0].cpu().numpy() * 255.0, 0, 255).astype(np.uint8)


def numpy_to_tensor(img):
    """numpy [H,W,C] uint8 → ComfyUI IMAGE [1,H,W,C] float32 0–1."""
    return torch.from_numpy(img.astype(np.float32) / 255.0).unsqueeze(0)


def ensure_odd(n, minimum=1):
    """Clamp to >= minimum and ensure odd."""
    n = max(minimum, int(n))
    return n if n % 2 == 1 else n + 1


def restore_detail(original, denoised, amount):
    """Blend high-frequency detail from original back into denoised result."""
    if amount <= 0.0:
        return denoised
    orig_f = original.astype(np.float32)
    den_f = denoised.astype(np.float32)
    blur = cv2.GaussianBlur(orig_f, (0, 0), sigmaX=3.0)
    detail = orig_f - blur
    return np.clip(den_f + detail * amount, 0, 255).astype(np.uint8)


# ── Per-Channel Denoising (for LAB split) ─────────────────────────────────

def denoise_channel(ch, method, strength, **p):
    """Denoise a single grayscale channel."""
    if strength <= 0.01:
        return ch.copy()

    if method == "nlm":
        h = max(1.0, strength * 30.0)
        tw = ensure_odd(p.get("patch_size", 7), 3)
        sw = ensure_odd(p.get("search_window", 21), 7)
        return cv2.fastNlMeansDenoising(
            ch, None, h=h, templateWindowSize=tw, searchWindowSize=sw
        )

    elif method == "bilateral":
        d = max(1, int(5 + strength * 20))
        sc = p.get("sigma_color", 75.0)
        ss = p.get("sigma_spatial", 75.0)
        return cv2.bilateralFilter(ch, d, sc, ss)

    elif method == "gaussian":
        ks = ensure_odd(int(strength * 12), 1)
        sigma = max(0.1, strength * 5.0)
        return cv2.GaussianBlur(ch, (ks, ks), sigmaX=sigma)

    elif method == "median":
        ks = ensure_odd(int(strength * 10), 3)
        ks = min(ks, 31)
        return cv2.medianBlur(ch, ks)

    return ch.copy()


def denoise_lab_split(img_bgr, method, lum_str, chroma_str, **params):
    """Denoise in LAB space with separate luminance/chrominance strength."""
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
    L, A, B = cv2.split(lab)

    L = denoise_channel(L, method, lum_str, **params)
    A = denoise_channel(A, method, chroma_str, **params)
    B = denoise_channel(B, method, chroma_str, **params)

    return cv2.cvtColor(cv2.merge([L, A, B]), cv2.COLOR_LAB2BGR)


# ── Full-Image Denoise Methods ───────────────────────────────────────────

def denoise_nlm_color(img_bgr, lum_str, chroma_str, patch_size, search_window):
    """Non-Local Means with native luminance/chrominance control.
    Uses positional args for OpenCV 4.13+ compatibility."""
    h = max(1.0, lum_str * 30.0)
    h_c = max(1.0, chroma_str * 30.0)
    tw = ensure_odd(patch_size, 3)
    sw = ensure_odd(search_window, 7)
    # Positional args: src, dst, h, hForColorComponents, templateWindowSize, searchWindowSize
    return cv2.fastNlMeansDenoisingColored(img_bgr, None, h, h_c, tw, sw)


def denoise_bilateral_full(img_bgr, strength, sigma_spatial, sigma_color):
    """Bilateral filter on full BGR image."""
    d = max(1, int(5 + strength * 20))
    return cv2.bilateralFilter(img_bgr, d, sigma_color, sigma_spatial)


def denoise_wavelet_full(img_bgr, strength, wavelet_level):
    """Wavelet denoising (requires scikit-image; falls back to Gaussian)."""
    try:
        from skimage.restoration import denoise_wavelet as _sk_wav
        from skimage import img_as_float, img_as_ubyte

        rgb_f = img_as_float(cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB))
        sigma = max(0.001, strength * 0.3)

        out = _sk_wav(
            rgb_f, method="BayesShrink", mode="soft",
            wavelet_levels=wavelet_level, sigma=sigma,
            channel_axis=-1, rescale_sigma=True
        )
        return cv2.cvtColor(img_as_ubyte(np.clip(out, 0, 1)), cv2.COLOR_RGB2BGR)

    except ImportError:
        print("[AdvancedDenoiser] scikit-image not available — Gaussian fallback")
        ks = ensure_odd(int(strength * 12), 1)
        return cv2.GaussianBlur(img_bgr, (ks, ks), sigmaX=max(0.1, strength * 5.0))


def denoise_gaussian_full(img_bgr, strength):
    """Simple Gaussian blur."""
    if strength <= 0.01:
        return img_bgr.copy()
    ks = ensure_odd(int(strength * 12), 1)
    return cv2.GaussianBlur(img_bgr, (ks, ks), sigmaX=max(0.1, strength * 5.0))


def denoise_median_full(img_bgr, strength):
    """Median filter for impulse noise."""
    if strength <= 0.01:
        return img_bgr.copy()
    ks = ensure_odd(int(strength * 10), 3)
    ks = min(ks, 31)
    return cv2.medianBlur(img_bgr, ks)


def denoise_auto_blend(img_bgr, strength, lum_str, chroma_str,
                       preserve_detail, patch_size, search_window,
                       sigma_spatial, sigma_color):
    """Smart NLM + Bilateral blend weighted by preserve_detail."""
    nlm = denoise_nlm_color(img_bgr, lum_str, chroma_str, patch_size, search_window)
    bilateral = denoise_lab_split(
        img_bgr, "bilateral", lum_str, chroma_str,
        sigma_spatial=sigma_spatial, sigma_color=sigma_color
    )
    a = preserve_detail  # 0 → full NLM, 1 → full bilateral
    return cv2.addWeighted(nlm, 1.0 - a, bilateral, a, 0)


# ── Sharpening ───────────────────────────────────────────────────────────

def sharpen_unsharp_mask(img_bgr, amount, radius):
    """Classic unsharp mask sharpening.
    amount: strength 0-1, radius: blur kernel sigma."""
    if amount <= 0.01:
        return img_bgr
    sigma = max(0.5, radius * 3.0)
    blurred = cv2.GaussianBlur(img_bgr.astype(np.float32), (0, 0), sigmaX=sigma)
    sharpened = img_bgr.astype(np.float32) + amount * 2.0 * (img_bgr.astype(np.float32) - blurred)
    return np.clip(sharpened, 0, 255).astype(np.uint8)


def sharpen_high_pass(img_bgr, amount, radius):
    """High-pass filter sharpening — great for fine micro-detail.
    Extracts high frequencies and adds them back."""
    if amount <= 0.01:
        return img_bgr
    sigma = max(0.5, radius * 5.0)
    img_f = img_bgr.astype(np.float32)
    low_pass = cv2.GaussianBlur(img_f, (0, 0), sigmaX=sigma)
    high_pass = img_f - low_pass
    result = img_f + high_pass * amount * 3.0
    return np.clip(result, 0, 255).astype(np.uint8)


def sharpen_luminance_only(img_bgr, amount, radius):
    """Sharpen only the luminance channel (LAB L) to avoid color fringing."""
    if amount <= 0.01:
        return img_bgr
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
    L, A, B = cv2.split(lab)
    sigma = max(0.5, radius * 3.0)
    L_f = L.astype(np.float32)
    blurred = cv2.GaussianBlur(L_f, (0, 0), sigmaX=sigma)
    L_sharp = L_f + amount * 2.0 * (L_f - blurred)
    L_out = np.clip(L_sharp, 0, 255).astype(np.uint8)
    return cv2.cvtColor(cv2.merge([L_out, A, B]), cv2.COLOR_LAB2BGR)


def apply_sharpening(img_bgr, sharpen_mode, sharpen_amount, sharpen_radius):
    """Dispatch to the correct sharpening method."""
    if sharpen_mode == "off" or sharpen_amount <= 0.01:
        return img_bgr
    if sharpen_mode == "unsharp_mask":
        return sharpen_unsharp_mask(img_bgr, sharpen_amount, sharpen_radius)
    elif sharpen_mode == "high_pass":
        return sharpen_high_pass(img_bgr, sharpen_amount, sharpen_radius)
    elif sharpen_mode == "luminance_only":
        return sharpen_luminance_only(img_bgr, sharpen_amount, sharpen_radius)
    return img_bgr


# ── ComfyUI Node ─────────────────────────────────────────────────────────

class AdvancedImageDenoiser:
    """🧹 Advanced Image Denoiser"""

    METHODS = [
        "auto_blend",
        "non_local_means",
        "bilateral",
        "wavelet",
        "gaussian",
        "median",
    ]

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "method": (cls.METHODS, {"default": "auto_blend"}),
                "strength": ("FLOAT", {
                    "default": 0.50, "min": 0.0, "max": 1.0, "step": 0.01,
                    "display": "slider",
                }),
                "preserve_detail": ("FLOAT", {
                    "default": 0.70, "min": 0.0, "max": 1.0, "step": 0.01,
                    "display": "slider",
                }),
            },
            "optional": {
                "luminance_strength": ("FLOAT", {
                    "default": 0.50, "min": 0.0, "max": 1.0, "step": 0.01,
                    "display": "slider",
                }),
                "color_strength": ("FLOAT", {
                    "default": 0.50, "min": 0.0, "max": 1.0, "step": 0.01,
                    "display": "slider",
                }),
                "patch_size": ("INT", {
                    "default": 7, "min": 3, "max": 15, "step": 2,
                }),
                "search_window": ("INT", {
                    "default": 21, "min": 7, "max": 35, "step": 2,
                }),
                "sigma_spatial": ("FLOAT", {
                    "default": 75.0, "min": 1.0, "max": 300.0, "step": 1.0,
                }),
                "sigma_color": ("FLOAT", {
                    "default": 75.0, "min": 1.0, "max": 300.0, "step": 1.0,
                }),
                "wavelet_level": ("INT", {
                    "default": 2, "min": 1, "max": 5, "step": 1,
                }),
                "blend_original": ("FLOAT", {
                    "default": 0.00, "min": 0.0, "max": 1.0, "step": 0.01,
                    "display": "slider",
                }),
                "sharpen_mode": (["off", "unsharp_mask", "high_pass", "luminance_only"], {
                    "default": "off",
                }),
                "sharpen_amount": ("FLOAT", {
                    "default": 0.00, "min": 0.0, "max": 1.0, "step": 0.01,
                    "display": "slider",
                }),
                "sharpen_radius": ("FLOAT", {
                    "default": 0.30, "min": 0.05, "max": 1.0, "step": 0.01,
                    "display": "slider",
                }),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "denoise"
    CATEGORY = "image/denoising"

    DESCRIPTION = (
        "Advanced image denoising with 6 algorithms, separate luminance/"
        "chrominance control, detail preservation, and fine-detail sharpening."
    )

    def denoise(self, image, method, strength, preserve_detail,
                luminance_strength=0.5, color_strength=0.5,
                patch_size=7, search_window=21,
                sigma_spatial=75.0, sigma_color=75.0,
                wavelet_level=2, blend_original=0.0,
                sharpen_mode="off", sharpen_amount=0.0,
                sharpen_radius=0.3):
        """Process each image in the batch."""

        results = []
        for i in range(image.shape[0]):
            img_np = tensor_to_numpy(image[i:i + 1])          # [H,W,C] RGB u8
            img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
            original = img_bgr.copy()

            # ── dispatch ──
            if method == "non_local_means":
                # NLM natively supports separate lum/chroma via h params
                out = denoise_nlm_color(
                    img_bgr, luminance_strength, color_strength,
                    patch_size, search_window
                )

            elif method == "bilateral":
                # Per-channel LAB split for separate lum/chroma control
                out = denoise_lab_split(
                    img_bgr, "bilateral", luminance_strength, color_strength,
                    sigma_spatial=sigma_spatial, sigma_color=sigma_color
                )

            elif method == "wavelet":
                out = denoise_wavelet_full(img_bgr, strength, wavelet_level)

            elif method == "gaussian":
                out = denoise_lab_split(
                    img_bgr, "gaussian", luminance_strength, color_strength
                )

            elif method == "median":
                out = denoise_lab_split(
                    img_bgr, "median", luminance_strength, color_strength
                )

            elif method == "auto_blend":
                out = denoise_auto_blend(
                    img_bgr, strength, luminance_strength, color_strength,
                    preserve_detail, patch_size, search_window,
                    sigma_spatial, sigma_color
                )
            else:
                out = img_bgr

            # ── detail preservation ──
            if preserve_detail > 0.0 and method != "auto_blend":
                out = restore_detail(original, out, preserve_detail)

            # ── blend with original ──
            if blend_original > 0.0:
                out = cv2.addWeighted(
                    out, 1.0 - blend_original, original, blend_original, 0
                )

            # ── sharpening (post-denoise) ──
            if sharpen_mode != "off" and sharpen_amount > 0.01:
                out = apply_sharpening(out, sharpen_mode, sharpen_amount, sharpen_radius)

            # ── back to RGB tensor ──
            out_rgb = cv2.cvtColor(out, cv2.COLOR_BGR2RGB)
            results.append(numpy_to_tensor(out_rgb))

        return (torch.cat(results, dim=0),)
