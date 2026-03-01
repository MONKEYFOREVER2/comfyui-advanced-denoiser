"""
ComfyUI Advanced Image Denoiser
================================
A custom node providing multiple advanced denoising algorithms with
fine-grained control over strength, detail preservation, and luminance/
chrominance channels.

Install:
    Copy this folder into ComfyUI/custom_nodes/
    pip install -r requirements.txt
"""

from .nodes import AdvancedImageDenoiser

NODE_CLASS_MAPPINGS = {
    "AdvancedImageDenoiser": AdvancedImageDenoiser,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AdvancedImageDenoiser": "🧹 Advanced Image Denoiser",
}

WEB_DIRECTORY = "./js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
