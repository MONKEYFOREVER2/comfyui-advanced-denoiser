/**
 * 🧹 Advanced Image Denoiser — Premium Custom UI
 * ================================================
 * Dark-themed, neon-styled DOM widget with method tabs,
 * descriptions, styled sliders, and dynamic visibility.
 */
import { app } from "../../scripts/app.js";

/* ── Constants ───────────────────────────────────────────────────────── */
const NODE_MIN_WIDTH = 420;
const NODE_TITLE_HEIGHT = 70; // approximate title + input/output row height

const METHODS = {
    auto_blend: {
        icon: "⚡", label: "Auto-Blend", rating: 5, badge: "★ RECOMMENDED",
        desc: "Intelligently combines Non-Local Means + Bilateral for the best of both worlds. Balances noise removal with edge preservation automatically.",
        tip: "Start here! Adjust Preserve Detail to control the NLM ↔ Bilateral mix."
    },
    non_local_means: {
        icon: "🔍", label: "NLM", rating: 4, badge: "BEST FOR PHOTOS",
        desc: "Searches for similar patches across the image and averages them. Excellent at preserving fine textures while removing photographic grain.",
        tip: "Increase Search Window for better quality (slower). Increase Patch Size for smoother results."
    },
    bilateral: {
        icon: "🎯", label: "Bilateral", rating: 4, badge: "EDGE-PRESERVING",
        desc: "Smooths flat areas while keeping sharp edges crisp. Perfect for portraits, architecture, and any image where edge definition matters.",
        tip: "Sigma Color controls how much color variation is smoothed. Sigma Spatial controls the smoothing radius."
    },
    wavelet: {
        icon: "〰️", label: "Wavelet", rating: 4, badge: "SUBTLE & PRECISE",
        desc: "Separates the image into frequency layers and removes noise from each band independently. Very gentle and precise — ideal for fine grain.",
        tip: "Increase Wavelet Level for coarser denoising. Requires scikit-image (falls back to Gaussian if missing)."
    },
    gaussian: {
        icon: "☁️", label: "Gaussian", rating: 3, badge: "QUICK & SIMPLE",
        desc: "Classic Gaussian blur that softens everything evenly. Fast and effective for very light noise or as a gentle smoothing pass.",
        tip: "Keep Strength low (0.1–0.3) for subtle smoothing. Use Preserve Detail to recover sharpness."
    },
    median: {
        icon: "⚡", label: "Median", rating: 3, badge: "ARTIFACT REMOVAL",
        desc: "Replaces each pixel with the median of its neighborhood. Specialized for removing salt-and-pepper noise and digital compression artifacts.",
        tip: "Most effective for impulse noise (random bright/dark pixels). Less effective for Gaussian noise."
    },
};

const METHOD_WIDGETS = {
    auto_blend: ["color_strength", "patch_size", "search_window", "sigma_spatial", "sigma_color", "blend_original"],
    non_local_means: ["luminance_strength", "color_strength", "patch_size", "search_window", "blend_original"],
    bilateral: ["luminance_strength", "color_strength", "sigma_spatial", "sigma_color", "blend_original"],
    wavelet: ["wavelet_level", "blend_original"],
    gaussian: ["luminance_strength", "color_strength", "blend_original"],
    median: ["luminance_strength", "color_strength", "blend_original"],
};

const SLIDER_META = {
    strength: { label: "Strength", min: 0, max: 1, step: 0.01, def: 0.50, unit: "", desc: "Overall denoising power. Higher = more smoothing." },
    preserve_detail: { label: "Preserve Detail", min: 0, max: 1, step: 0.01, def: 0.70, unit: "", desc: "Blends sharp detail from original back in. Higher = more texture kept." },
    luminance_strength: { label: "Luminance", min: 0, max: 1, step: 0.01, def: 0.50, unit: "", desc: "Brightness channel denoising. Controls grain removal." },
    color_strength: { label: "Chrominance", min: 0, max: 1, step: 0.01, def: 0.50, unit: "", desc: "Color channel denoising. Removes color noise / splotches." },
    patch_size: { label: "Patch Size", min: 3, max: 15, step: 2, def: 7, unit: "px", desc: "Comparison patch size. Larger = smoother but slower." },
    search_window: { label: "Search Window", min: 7, max: 35, step: 2, def: 21, unit: "px", desc: "Area searched for similar patches. Larger = better quality." },
    sigma_spatial: { label: "Sigma Spatial", min: 1, max: 300, step: 1, def: 75, unit: "", desc: "Spatial smoothing radius. Higher = smoother over larger areas." },
    sigma_color: { label: "Sigma Color", min: 1, max: 300, step: 1, def: 75, unit: "", desc: "Color similarity threshold. Higher = more colors blended." },
    wavelet_level: { label: "Wavelet Levels", min: 1, max: 5, step: 1, def: 2, unit: "", desc: "Decomposition depth. More levels = coarser denoising." },
    blend_original: { label: "Blend Original", min: 0, max: 1, step: 0.01, def: 0.00, unit: "", desc: "Mix denoised with original for subtle, natural results." },
    sharpen_amount: { label: "Amount", min: 0, max: 1, step: 0.01, def: 0.00, unit: "", desc: "Sharpening intensity. Higher = stronger edge enhancement." },
    sharpen_radius: { label: "Radius", min: 0.05, max: 1, step: 0.01, def: 0.30, unit: "", desc: "Detail scale to sharpen. Low = fine micro-detail, High = broader edges." },
};

const SHARPEN_MODES = {
    off: { icon: "⊘", label: "Off" },
    unsharp_mask: { icon: "🔪", label: "Unsharp" },
    high_pass: { icon: "🔬", label: "High-Pass" },
    luminance_only: { icon: "💡", label: "Luma Only" },
};

const ALL_OPTIONAL = Object.keys(SLIDER_META).filter(k => k !== "strength" && k !== "preserve_detail" && k !== "sharpen_amount" && k !== "sharpen_radius");

/* ── CSS injection ───────────────────────────────────────────────────── */
function injectCSS() {
    if (document.getElementById("den-styles")) return;
    const style = document.createElement("style");
    style.id = "den-styles";
    style.textContent = `
.den-root {
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    background: #0c0c1a;
    border-radius: 8px;
    padding: 12px;
    color: #d0d0e0;
    user-select: none;
    width: 100%;
    box-sizing: border-box;
    overflow: hidden;
}
.den-header {
    text-align: center;
    padding: 4px 0 8px;
    border-bottom: 1px solid rgba(180, 77, 255, 0.2);
    margin-bottom: 10px;
}
.den-title {
    font-size: 15px; font-weight: 700; letter-spacing: 1.5px;
    text-transform: uppercase;
    background: linear-gradient(135deg, #b44dff, #00ff88);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    background-clip: text; margin: 0;
}
.den-subtitle {
    font-size: 9px; color: #666; letter-spacing: 2px;
    text-transform: uppercase; margin-top: 2px;
}
.den-methods {
    display: flex; flex-wrap: wrap; gap: 4px;
    justify-content: center; margin-bottom: 10px;
}
.den-method-btn {
    padding: 5px 10px;
    border: 1px solid rgba(180, 77, 255, 0.25);
    border-radius: 16px;
    background: rgba(180, 77, 255, 0.06);
    color: #999; cursor: pointer;
    font-size: 10px; font-weight: 500;
    transition: all 0.25s ease; outline: none; white-space: nowrap;
}
.den-method-btn:hover {
    background: rgba(180, 77, 255, 0.15);
    color: #ccc; border-color: rgba(180, 77, 255, 0.5);
}
.den-method-btn.active {
    background: rgba(180, 77, 255, 0.25);
    border-color: #b44dff; color: #fff;
    box-shadow: 0 0 12px rgba(180, 77, 255, 0.3), inset 0 0 8px rgba(180, 77, 255, 0.1);
}
.den-method-btn.recommended { border-color: rgba(0, 255, 136, 0.5); }
.den-method-btn.recommended.active {
    border-color: #00ff88;
    box-shadow: 0 0 14px rgba(0, 255, 136, 0.3), inset 0 0 8px rgba(0, 255, 136, 0.1);
}
.den-info {
    background: rgba(180, 77, 255, 0.06);
    border: 1px solid rgba(180, 77, 255, 0.15);
    border-radius: 8px; padding: 8px 10px;
    margin-bottom: 10px; font-size: 10px; line-height: 1.4;
}
.den-info-badge {
    display: inline-block; font-size: 8px; font-weight: 700;
    letter-spacing: 1px; padding: 2px 6px; border-radius: 4px;
    background: rgba(180, 77, 255, 0.25); color: #b44dff; margin-bottom: 4px;
}
.den-info-badge.recommended { background: rgba(0, 255, 136, 0.2); color: #00ff88; }
.den-info-desc { color: #aaa; margin: 4px 0; }
.den-info-tip { color: #666; font-size: 9px; font-style: italic; margin-top: 4px; }
.den-info-stars { color: #b44dff; font-size: 11px; letter-spacing: 1px; }
.den-section {
    display: flex; align-items: center; gap: 6px;
    margin: 10px 0 6px; font-size: 9px; font-weight: 600;
    letter-spacing: 1.5px; text-transform: uppercase; color: #555;
}
.den-section::before, .den-section::after {
    content: ""; flex: 1; height: 1px;
    background: linear-gradient(90deg, transparent, rgba(180,77,255,0.2), transparent);
}
.den-slider-row {
    display: flex; align-items: center; gap: 8px; margin: 5px 0;
    transition: opacity 0.3s, max-height 0.3s; overflow: hidden;
    max-height: 30px;
}
.den-slider-row.hidden { opacity: 0; max-height: 0; margin: 0; pointer-events: none; }
.den-slider-label {
    min-width: 80px; font-size: 10px; color: #888;
    text-align: right; cursor: help;
}
.den-slider-label:hover { color: #b44dff; }
.den-slider {
    -webkit-appearance: none; appearance: none;
    flex: 1; height: 5px; border-radius: 3px;
    background: linear-gradient(90deg, #1a1030, #3d1d6e);
    outline: none; cursor: pointer;
}
.den-slider:hover { background: linear-gradient(90deg, #1a1030, #5a2ea0); }
.den-slider::-webkit-slider-thumb {
    -webkit-appearance: none; width: 14px; height: 14px;
    border-radius: 50%;
    background: radial-gradient(circle, #fff 30%, #b44dff 100%);
    border: none; cursor: grab;
    box-shadow: 0 0 8px rgba(180, 77, 255, 0.5);
}
.den-slider::-webkit-slider-thumb:hover {
    box-shadow: 0 0 14px rgba(180, 77, 255, 0.8);
}
.den-slider::-moz-range-thumb {
    width: 14px; height: 14px; border-radius: 50%;
    background: radial-gradient(circle, #fff 30%, #b44dff 100%);
    border: none; cursor: grab;
    box-shadow: 0 0 8px rgba(180, 77, 255, 0.5);
}
.den-slider::-moz-range-track {
    height: 5px; border-radius: 3px;
    background: linear-gradient(90deg, #1a1030, #3d1d6e);
}
.den-slider-val {
    min-width: 42px; text-align: right; font-size: 10px;
    font-family: 'Consolas','Monaco',monospace;
    color: #b44dff; font-weight: 600;
}
.den-tooltip { position: relative; }
.den-tooltip::after {
    content: attr(data-tip);
    position: absolute; bottom: 120%; left: 50%;
    transform: translateX(-50%);
    background: #1a1a2e; color: #aaa;
    border: 1px solid rgba(180,77,255,0.3);
    padding: 4px 8px; border-radius: 6px;
    font-size: 9px; max-width: 220px;
    white-space: normal; pointer-events: none;
    opacity: 0; transition: opacity 0.2s; z-index: 999; line-height: 1.3;
}
.den-tooltip:hover::after { opacity: 1; }
.den-slider.green { background: linear-gradient(90deg, #0a1a10, #0d4a2a); }
.den-slider.green:hover { background: linear-gradient(90deg, #0a1a10, #1a6040); }
.den-slider.green::-webkit-slider-thumb {
    background: radial-gradient(circle, #fff 30%, #00ff88 100%);
    box-shadow: 0 0 8px rgba(0, 255, 136, 0.5);
}
.den-slider-row.green .den-slider-val { color: #00ff88; }
.den-slider.orange { background: linear-gradient(90deg, #1a1008, #6e3d1d); }
.den-slider.orange:hover { background: linear-gradient(90deg, #1a1008, #a05a2e); }
.den-slider.orange::-webkit-slider-thumb {
    background: radial-gradient(circle, #fff 30%, #ff9f43 100%);
    box-shadow: 0 0 8px rgba(255, 159, 67, 0.5);
}
.den-slider-row.orange .den-slider-val { color: #ff9f43; }
.den-sharpen-modes {
    display: flex; gap: 4px; justify-content: center; margin-bottom: 6px;
}
.den-sharpen-btn {
    padding: 4px 9px; border: 1px solid rgba(255, 159, 67, 0.25);
    border-radius: 14px; background: rgba(255, 159, 67, 0.06);
    color: #999; cursor: pointer; font-size: 10px; font-weight: 500;
    transition: all 0.25s ease; outline: none; white-space: nowrap;
}
.den-sharpen-btn:hover {
    background: rgba(255, 159, 67, 0.15); color: #ccc;
    border-color: rgba(255, 159, 67, 0.5);
}
.den-sharpen-btn.active {
    background: rgba(255, 159, 67, 0.25); border-color: #ff9f43;
    color: #fff; box-shadow: 0 0 10px rgba(255, 159, 67, 0.3);
}
.den-sharpen-btn.off-mode.active {
    background: rgba(100,100,100,0.15); border-color: #666;
    color: #888; box-shadow: none;
}
`;
    document.head.appendChild(style);
}

/* ── Build DOM ───────────────────────────────────────────────────────── */
function buildUI() {
    const el = document.createElement("div");
    el.className = "den-root";
    el.innerHTML = `
        <div class="den-header">
            <div class="den-title">Advanced Image Denoiser</div>
            <div class="den-subtitle">6 Algorithms • LAB Control • Sharpening</div>
        </div>
        <div class="den-methods" id="den-methods"></div>
        <div class="den-info" id="den-info"></div>
        <div class="den-section">Core Settings</div>
        <div id="den-core"></div>
        <div class="den-section" id="den-ch-section">Channel Control</div>
        <div id="den-channels"></div>
        <div class="den-section" id="den-method-section">Method Settings</div>
        <div id="den-method-params"></div>
        <div class="den-section">Blending</div>
        <div id="den-blend"></div>
        <div class="den-section">✨ Sharpening</div>
        <div class="den-sharpen-modes" id="den-sharpen-modes"></div>
        <div id="den-sharpen-params"></div>
    `;

    const mc = el.querySelector("#den-methods");
    for (const [key, m] of Object.entries(METHODS)) {
        const btn = document.createElement("button");
        btn.className = "den-method-btn" + (key === "auto_blend" ? " recommended" : "");
        btn.dataset.method = key;
        btn.textContent = `${m.icon} ${m.label}`;
        mc.appendChild(btn);
    }

    el.querySelector("#den-core").appendChild(createSliderRow("strength"));
    el.querySelector("#den-core").appendChild(createSliderRow("preserve_detail"));

    const ch = el.querySelector("#den-channels");
    ch.appendChild(createSliderRow("luminance_strength"));
    ch.appendChild(createSliderRow("color_strength"));

    const mp = el.querySelector("#den-method-params");
    for (const n of ["patch_size", "search_window", "sigma_spatial", "sigma_color", "wavelet_level"])
        mp.appendChild(createSliderRow(n));

    el.querySelector("#den-blend").appendChild(createSliderRow("blend_original", true));

    /* Sharpen mode buttons */
    const smc = el.querySelector("#den-sharpen-modes");
    for (const [key, m] of Object.entries(SHARPEN_MODES)) {
        const btn = document.createElement("button");
        btn.className = "den-sharpen-btn" + (key === "off" ? " off-mode active" : "");
        btn.dataset.smode = key;
        btn.textContent = `${m.icon} ${m.label}`;
        smc.appendChild(btn);
    }

    /* Sharpen sliders */
    const sp = el.querySelector("#den-sharpen-params");
    sp.appendChild(createSliderRow("sharpen_amount", false, true));
    sp.appendChild(createSliderRow("sharpen_radius", false, true));

    return el;
}

function createSliderRow(name, green = false, orange = false) {
    const m = SLIDER_META[name];
    const row = document.createElement("div");
    const colorClass = orange ? " orange" : green ? " green" : "";
    row.className = "den-slider-row" + colorClass;
    row.id = "den-row-" + name;
    const isInt = Number.isInteger(m.step) && Number.isInteger(m.min);
    const valStr = isInt ? String(m.def) : m.def.toFixed(2);
    const sliderColor = orange ? ' orange' : green ? ' green' : '';
    row.innerHTML = `
        <span class="den-slider-label den-tooltip" data-tip="${m.desc}">${m.label}</span>
        <input type="range" class="den-slider${sliderColor}"
               id="den-s-${name}" min="${m.min}" max="${m.max}" step="${m.step}" value="${m.def}">
        <span class="den-slider-val" id="den-v-${name}">${valStr}${m.unit ? ' ' + m.unit : ''}</span>
    `;
    return row;
}

function formatVal(name, val) {
    const m = SLIDER_META[name];
    const isInt = Number.isInteger(m.step) && Number.isInteger(m.min);
    const s = isInt ? String(Math.round(val)) : parseFloat(val).toFixed(2);
    return m.unit ? s + " " + m.unit : s;
}

function updateInfoBox(el, method) {
    const m = METHODS[method];
    const stars = "★".repeat(m.rating) + "☆".repeat(5 - m.rating);
    const bc = method === "auto_blend" ? " recommended" : "";
    el.querySelector("#den-info").innerHTML = `
        <span class="den-info-badge${bc}">${m.badge}</span>
        <span class="den-info-stars">${stars}</span>
        <div class="den-info-desc">${m.desc}</div>
        <div class="den-info-tip">💡 ${m.tip}</div>
    `;
}

function updateVisibility(el, method) {
    const visible = new Set(METHOD_WIDGETS[method] || []);
    for (const name of ALL_OPTIONAL) {
        const row = el.querySelector("#den-row-" + name);
        if (row) row.classList.toggle("hidden", !visible.has(name));
    }
    const chSec = el.querySelector("#den-ch-section");
    if (chSec) chSec.style.display = (visible.has("luminance_strength") || visible.has("color_strength")) ? "" : "none";
    const mSec = el.querySelector("#den-method-section");
    if (mSec) mSec.style.display = ["patch_size", "search_window", "sigma_spatial", "sigma_color", "wavelet_level"].some(n => visible.has(n)) ? "" : "none";
}

function getWidget(node, name) {
    return node.widgets?.find(w => w.name === name);
}

/* ── Aggressively hide a default ComfyUI widget ─────────────────────── */
function hideDefaultWidget(w) {
    if (!w) return;
    w.hidden = true;
    w.type = "hidden";
    w.computeSize = () => [0, -4];
    // Prevent any drawing
    w.draw = function () { };
    w.mouse = function () { return false; };
}

/* ── Calculate proper node size based on visible DOM content ─────────── */
function calcNodeSize(el, node) {
    // Count visible slider rows
    const visibleRows = el.querySelectorAll(".den-slider-row:not(.hidden)").length;
    const visibleSections = el.querySelectorAll(".den-section:not([style*='display: none'])").length;

    // Approximate heights
    const headerH = 55;       // header + subtitle
    const methodBtnsH = 35;   // method tab buttons
    const infoBoxH = 80;      // info panel
    const sectionH = 24;      // section divider
    const sliderH = 26;       // each slider row
    const paddingH = 30;      // root padding + gaps

    const domH = headerH + methodBtnsH + infoBoxH
        + (visibleSections * sectionH)
        + (visibleRows * sliderH)
        + paddingH;

    const totalH = NODE_TITLE_HEIGHT + domH + 10;
    const currentW = Math.max(node.size?.[0] || 0, NODE_MIN_WIDTH);

    return [currentW, totalH];
}

/* ── Extension ───────────────────────────────────────────────────────── */
app.registerExtension({
    name: "AdvancedImageDenoiser.PremiumUI",

    nodeCreated(node) {
        if (node.comfyClass !== "AdvancedImageDenoiser") return;
        injectCSS();

        const paramNames = ["method", "strength", "preserve_detail",
            "luminance_strength", "color_strength", "patch_size",
            "search_window", "sigma_spatial", "sigma_color",
            "wavelet_level", "blend_original",
            "sharpen_mode", "sharpen_amount", "sharpen_radius"];

        /* Aggressively hide all default parameter widgets */
        for (const name of paramNames) {
            hideDefaultWidget(getWidget(node, name));
        }

        /* Build custom UI */
        const el = buildUI();

        /* Add DOM widget — serialize:false so it doesn't conflict with hidden widgets */
        node.addDOMWidget("denoiser_ui", "customwidget", el, {
            serialize: false,
        });

        /* Force minimum width */
        if (!node.size || node.size[0] < NODE_MIN_WIDTH) {
            node.size = [NODE_MIN_WIDTH, 600];
        }

        /* ── Sync: sliders → hidden widgets ─────────────────────── */
        for (const name of Object.keys(SLIDER_META)) {
            const slider = el.querySelector("#den-s-" + name);
            if (!slider) continue;
            slider.addEventListener("input", () => {
                const w = getWidget(node, name);
                if (w) { w.value = parseFloat(slider.value); if (w.callback) w.callback(w.value); }
                const ve = el.querySelector("#den-v-" + name);
                if (ve) ve.textContent = formatVal(name, slider.value);
            });
        }

        /* ── Method buttons → hidden widget + UI update ─────────── */
        const methodBtns = el.querySelectorAll(".den-method-btn");
        methodBtns.forEach(btn => {
            btn.addEventListener("click", () => {
                const method = btn.dataset.method;
                const w = getWidget(node, "method");
                if (w) { w.value = method; if (w.callback) w.callback(method); }
                methodBtns.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                updateInfoBox(el, method);
                updateVisibility(el, method);

                /* Resize: preserve current width, only adjust height */
                requestAnimationFrame(() => {
                    const newSize = calcNodeSize(el, node);
                    node.setSize(newSize);
                    node.setDirtyCanvas(true, true);
                });
            });
        });

        /* ── Sharpen mode buttons → hidden widget ─────────────── */
        const sharpenBtns = el.querySelectorAll(".den-sharpen-btn");
        function updateSharpenVisibility(mode) {
            const paramsEl = el.querySelector("#den-sharpen-params");
            if (paramsEl) paramsEl.style.display = (mode === "off") ? "none" : "";
        }
        sharpenBtns.forEach(btn => {
            btn.addEventListener("click", () => {
                const mode = btn.dataset.smode;
                const w = getWidget(node, "sharpen_mode");
                if (w) { w.value = mode; if (w.callback) w.callback(mode); }
                sharpenBtns.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                updateSharpenVisibility(mode);
                requestAnimationFrame(() => {
                    const newSize = calcNodeSize(el, node);
                    node.setSize(newSize);
                    node.setDirtyCanvas(true, true);
                });
            });
        });

        /* ── Sync: hidden widgets → DOM (workflow load) ─────────── */
        function syncFromWidgets() {
            for (const name of Object.keys(SLIDER_META)) {
                const w = getWidget(node, name);
                const slider = el.querySelector("#den-s-" + name);
                const ve = el.querySelector("#den-v-" + name);
                if (w && slider) {
                    slider.value = w.value;
                    if (ve) ve.textContent = formatVal(name, w.value);
                }
            }
            const mw = getWidget(node, "method");
            const cur = mw?.value || "auto_blend";
            methodBtns.forEach(b => b.classList.toggle("active", b.dataset.method === cur));
            updateInfoBox(el, cur);
            updateVisibility(el, cur);
            /* Sync sharpen mode */
            const sw = getWidget(node, "sharpen_mode");
            const curS = sw?.value || "off";
            sharpenBtns.forEach(b => b.classList.toggle("active", b.dataset.smode === curS));
            updateSharpenVisibility(curS);
        }

        /* Hook onConfigure (workflow load) */
        const origConfigure = node.onConfigure;
        node.onConfigure = function (info) {
            origConfigure?.apply(this, arguments);
            setTimeout(() => {
                syncFromWidgets();
                const sz = calcNodeSize(el, node);
                node.setSize(sz);
                node.setDirtyCanvas?.(true, true);
            }, 80);
        };

        /* Initial sync + size */
        setTimeout(() => {
            syncFromWidgets();
            const sz = calcNodeSize(el, node);
            node.setSize(sz);
            node.setDirtyCanvas?.(true, true);
        }, 150);
    },
});
