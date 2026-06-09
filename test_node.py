"""Standalone smoke test — run with the ComfyUI venv python."""
import numpy as np
import torch
import cv2
import nodes


def make_test_batch():
    """Two synthetic images: edges+gradient with Gaussian noise, and one clean."""
    h, w = 128, 160
    img = np.zeros((h, w, 3), np.float32)
    img[:, :, 0] = np.linspace(0, 1, w)[None, :]          # gradient
    cv2.rectangle(img, (30, 30), (90, 90), (0.2, 0.9, 0.4), -1)  # hard edges
    cv2.circle(img, (120, 64), 25, (0.9, 0.3, 0.2), -1)
    noisy = np.clip(img + np.random.normal(0, 0.05, img.shape), 0, 1)
    batch = np.stack([noisy, img]).astype(np.float32)
    return torch.from_numpy(batch)


def main():
    node = nodes.AdvancedImageDenoiser()
    batch = make_test_batch()
    print(f"skimage={nodes.HAS_SKIMAGE} bm3d={nodes.HAS_BM3D}")

    for method in nodes.AdvancedImageDenoiser.METHODS:
        out, report = node.denoise(batch, method, strength=0.15,
                                   detail_recovery=0.35)
        assert out.shape == batch.shape, f"{method}: shape {out.shape}"
        assert out.dtype == torch.float32
        assert 0.0 <= out.min() and out.max() <= 1.0
        # Denoising should reduce noise: compare residual vs the clean frame
        noisy_mse = ((batch[0] - batch[1]) ** 2).mean().item()
        out_mse = ((out[0] - batch[1]) ** 2).mean().item()
        print(f"{method:18s} MSE noisy={noisy_mse:.5f} -> out={out_mse:.5f}  "
              f"| {report.splitlines()[0]}")

    # Sharpening + blend paths
    out, _ = node.denoise(batch, "smart_auto", 0.15, 0.35,
                          blend_original=0.2, sharpen_mode="luminance_only",
                          sharpen_amount=0.3)
    assert out.shape == batch.shape
    out, _ = node.denoise(batch, "smart_auto", 0.15, 0.35,
                          sharpen_mode="unsharp_mask", sharpen_amount=0.3)
    assert out.shape == batch.shape

    # Zero-strength should be near-identity
    out, _ = node.denoise(batch, "non_local_means", 0.0, 0.0,
                          luminance_strength=0.0, chroma_strength=0.0)
    diff = (out - batch).abs().max().item()
    assert diff < 0.01, f"zero strength changed image by {diff}"
    print("zero-strength identity OK")
    print("ALL TESTS PASSED")


if __name__ == "__main__":
    main()
