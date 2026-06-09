/**
 * 🧹 Advanced Image Denoiser — Custom UI
 * Slate + teal themed panel replacing the default widgets:
 * segmented method picker, contextual sliders, collapsible advanced section.
 * All values sync to the hidden standard widgets, so serialization
 * and API workflows keep working.
 */
import { app } from "../../scripts/app.js";

/* ── Method metadata ─────────────────────────────────────────────────── */
const METHODS = {
    smart_auto: {
        label: "Smart Auto", icon: "✨", tag: "RECOMMENDED",
        desc: "Measures the image's real noise level and applies just enough denoising. Strength 0.5 = exactly the measured level.",
    },
    non_local_means: {
        label: "NLM", icon: "🔍", tag: "PHOTO GRAIN",
        desc: "Patch-matching denoiser with separate luminance / color control. Push Color higher — eyes barely notice chroma smoothing.",
    },
    bilateral: {
        label: "Bilateral", icon: "🎯", tag: "HARD EDGES",
        desc: "Smooths flat areas while keeping edges crisp. Good for portraits and architecture.",
    },
    guided_filter: {
        label: "Guided", icon: "🪞", tag: "FAST",
        desc: "Fast edge-preserving smoothing. A good lightweight alternative to bilateral.",
    },
    wavelet: {
        label: "Wavelet", icon: "〰️", tag: "FINE GRAIN",
        desc: "Frequency-band denoising with automatic per-channel noise estimation. Gentle and precise.",
    },
    total_variation: {
        label: "TV", icon: "📐", tag: "AI / FLAT IMAGES",
        desc: "Total Variation — strong smoothing that keeps edges. Great for AI-generated or graphic images.",
    },
    bm3d: {
        label: "BM3D", icon: "🏆", tag: "MAX QUALITY",
        desc: "Best classical denoiser, but slow. Needs `pip install bm3d` — falls back to adaptive NLM without it.",
    },
    median: {
        label: "Median", icon: "⚡", tag: "SPECKLES",
        desc: "Removes salt-and-pepper / impulse artifacts. Not for regular grain.",
    },
};

const SLIDERS = {
    strength:           { label: "Strength",        min: 0,    max: 1, step: 0.01, hint: "Keep low (0.05–0.25). Higher over-smooths." },
    detail_recovery:    { label: "Detail Recovery", min: 0,    max: 1, step: 0.01, hint: "Edge-aware texture restore. Safe to raise." },
    luminance_strength: { label: "Luminance",       min: 0,    max: 1, step: 0.01, hint: "Brightness denoising — this causes blur if overdone." },
    chroma_strength:    { label: "Color",           min: 0,    max: 1, step: 0.01, hint: "Color-noise removal. Can go 2–3× higher than luminance." },
    blend_original:     { label: "Blend Original",  min: 0,    max: 1, step: 0.01, hint: "Mix the untouched input back in (0.1–0.2 looks natural)." },
    patch_size:         { label: "Patch Size",      min: 3,    max: 15, step: 2,  int: true, hint: "NLM patch size. 7 is standard." },
    search_window:      { label: "Search Window",   min: 7,    max: 35, step: 2,  int: true, hint: "NLM search area. Bigger = better, slower." },
    wavelet_level:      { label: "Wavelet Levels",  min: 1,    max: 6, step: 1,   int: true, hint: "Decomposition depth." },
    sharpen_amount:     { label: "Sharpen Amount",  min: 0,    max: 1, step: 0.01, hint: "Post-sharpen intensity." },
    sharpen_radius:     { label: "Sharpen Radius",  min: 0.05, max: 1, step: 0.01, hint: "Low = fine micro-detail, high = broad edges." },
};

/* Which sliders each method uses (main section) */
const METHOD_SLIDERS = {
    smart_auto:      ["strength", "detail_recovery"],
    non_local_means: ["luminance_strength", "chroma_strength", "detail_recovery"],
    bilateral:       ["luminance_strength", "chroma_strength", "detail_recovery"],
    guided_filter:   ["luminance_strength", "chroma_strength", "detail_recovery"],
    wavelet:         ["strength", "detail_recovery"],
    total_variation: ["strength", "detail_recovery"],
    bm3d:            ["strength", "detail_recovery"],
    median:          ["strength", "detail_recovery"],
};

/* Which sliders appear in the Advanced section, per method */
const METHOD_ADVANCED = {
    smart_auto:      ["patch_size", "search_window", "blend_original"],
    non_local_means: ["patch_size", "search_window", "blend_original"],
    bilateral:       ["blend_original"],
    guided_filter:   ["blend_original"],
    wavelet:         ["wavelet_level", "blend_original"],
    total_variation: ["blend_original"],
    bm3d:            ["blend_original"],
    median:          ["blend_original"],
};

const SHARPEN_MODES = {
    off:            { label: "Off" },
    unsharp_mask:   { label: "Unsharp" },
    luminance_only: { label: "Luma Only" },
};

const PARAM_NAMES = [
    "method", "strength", "detail_recovery", "luminance_strength",
    "chroma_strength", "patch_size", "search_window", "wavelet_level",
    "blend_original", "sharpen_mode", "sharpen_amount", "sharpen_radius",
];

const MIN_WIDTH = 360;

/* ── CSS ─────────────────────────────────────────────────────────────── */
function injectCSS() {
    if (document.getElementById("adv-den-css")) return;
    const s = document.createElement("style");
    s.id = "adv-den-css";
    s.textContent = `
.adn {
    --bg: #14181d; --panel: #1b2129; --line: #2a323d;
    --txt: #c8d2dc; --dim: #76828e; --accent: #2dd4bf; --accent-dim: rgba(45,212,191,.14);
    font-family: 'Segoe UI', system-ui, sans-serif;
    background: var(--bg); color: var(--txt);
    border-radius: 10px;
    box-sizing: border-box; width: 100%; height: 100%;
    overflow-y: auto; overflow-x: hidden;
    user-select: none;
    font-size: 12px; line-height: 1.35;
    scrollbar-width: thin; scrollbar-color: var(--line) transparent;
}
.adn::-webkit-scrollbar { width: 6px; }
.adn::-webkit-scrollbar-thumb { background: var(--line); border-radius: 3px; }
.adn-inner { padding: 10px 12px 12px; box-sizing: border-box; }
.adn-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 9px; }
.adn-head .t { font-weight: 700; font-size: 13px; letter-spacing: .4px; color: #e8eef4; }
.adn-head .u { font-size: 10px; color: var(--dim); }
.adn-grid {
    display: grid; grid-template-columns: repeat(4, 1fr);
    gap: 5px; margin-bottom: 9px;
}
.adn-m {
    display: flex; flex-direction: column; align-items: center; gap: 1px;
    padding: 7px 2px 6px; border-radius: 8px; cursor: pointer;
    background: var(--panel); border: 1px solid var(--line);
    color: var(--dim); transition: all .15s ease; text-align: center;
}
.adn-m .ic { font-size: 14px; }
.adn-m .lb { font-size: 10px; font-weight: 600; }
.adn-m:hover { border-color: #3d4856; color: var(--txt); }
.adn-m.on {
    background: var(--accent-dim); border-color: var(--accent);
    color: #eafffb;
}
.adn-info {
    background: var(--panel); border: 1px solid var(--line);
    border-left: 3px solid var(--accent);
    border-radius: 7px; padding: 7px 10px; margin-bottom: 10px;
    min-height: 44px;
}
.adn-info .tag {
    font-size: 9px; font-weight: 700; letter-spacing: 1px;
    color: var(--accent);
}
.adn-info .d { color: var(--dim); font-size: 11px; margin-top: 2px; }
.adn-row { display: flex; align-items: center; gap: 9px; margin: 7px 0; }
.adn-row .lb { width: 102px; flex: none; font-size: 11px; color: var(--txt); cursor: help; }
.adn-row input[type=range] {
    -webkit-appearance: none; appearance: none; flex: 1; height: 4px;
    border-radius: 2px; background: var(--line); outline: none; cursor: pointer;
}
.adn-row input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none; width: 13px; height: 13px; border-radius: 50%;
    background: var(--accent); border: 2px solid #0e1316; cursor: grab;
}
.adn-row input[type=range]::-moz-range-thumb {
    width: 11px; height: 11px; border-radius: 50%;
    background: var(--accent); border: 2px solid #0e1316; cursor: grab;
}
.adn-row .val {
    flex: none; min-width: 38px; text-align: center; font-size: 10.5px;
    font-family: Consolas, monospace; font-weight: 600;
    background: var(--panel); border: 1px solid var(--line);
    border-radius: 5px; padding: 2px 4px; color: var(--accent);
}
.adn-sec {
    display: flex; align-items: center; gap: 7px; margin: 11px 0 3px;
    font-size: 9.5px; font-weight: 700; letter-spacing: 1.2px;
    text-transform: uppercase; color: var(--dim); cursor: default;
}
.adn-sec::after { content: ""; flex: 1; height: 1px; background: var(--line); }
.adn-sec.click { cursor: pointer; }
.adn-sec.click:hover { color: var(--txt); }
.adn-sec .chev { transition: transform .15s; font-size: 9px; }
.adn-sec.open .chev { transform: rotate(90deg); }
.adn-fold { overflow: hidden; }
.adn-fold.closed { display: none; }
.adn-pills { display: flex; gap: 5px; margin: 6px 0; }
.adn-pill {
    flex: 1; text-align: center; padding: 5px 0; border-radius: 7px;
    background: var(--panel); border: 1px solid var(--line);
    color: var(--dim); font-size: 10.5px; font-weight: 600;
    cursor: pointer; transition: all .15s;
}
.adn-pill:hover { color: var(--txt); border-color: #3d4856; }
.adn-pill.on { background: var(--accent-dim); border-color: var(--accent); color: #eafffb; }
.adn-hide { display: none !important; }
`;
    document.head.appendChild(s);
}

/* ── DOM builders ────────────────────────────────────────────────────── */
function buildUI() {
    const el = document.createElement("div");
    el.className = "adn";
    const inner = document.createElement("div");
    inner.className = "adn-inner";
    el.appendChild(inner);
    inner.innerHTML = `
        <div class="adn-head"><span class="t">🧹 Denoiser</span><span class="u">edge-preserving · auto noise detect</span></div>
        <div class="adn-grid"></div>
        <div class="adn-info"><span class="tag"></span><div class="d"></div></div>
        <div class="adn-main"></div>
        <div class="adn-sec click adn-adv-h"><span class="chev">▶</span> Advanced</div>
        <div class="adn-fold closed adn-adv"></div>
        <div class="adn-sec">Sharpen</div>
        <div class="adn-pills adn-sharp"></div>
        <div class="adn-fold closed adn-sharp-p"></div>
    `;

    const grid = el.querySelector(".adn-grid");
    for (const [key, m] of Object.entries(METHODS)) {
        const b = document.createElement("div");
        b.className = "adn-m";
        b.dataset.m = key;
        b.title = m.desc;
        b.innerHTML = `<span class="ic">${m.icon}</span><span class="lb">${m.label}</span>`;
        grid.appendChild(b);
    }

    const main = el.querySelector(".adn-main");
    const adv = el.querySelector(".adn-adv");
    for (const name of Object.keys(SLIDERS)) {
        const target = ["sharpen_amount", "sharpen_radius"].includes(name)
            ? el.querySelector(".adn-sharp-p")
            : (["patch_size", "search_window", "wavelet_level", "blend_original"].includes(name) ? adv : main);
        target.appendChild(buildSlider(name));
    }

    const sharp = el.querySelector(".adn-sharp");
    for (const [key, m] of Object.entries(SHARPEN_MODES)) {
        const b = document.createElement("div");
        b.className = "adn-pill";
        b.dataset.s = key;
        b.textContent = m.label;
        sharp.appendChild(b);
    }
    return el;
}

function buildSlider(name) {
    const m = SLIDERS[name];
    const row = document.createElement("div");
    row.className = "adn-row";
    row.dataset.row = name;
    row.innerHTML = `
        <span class="lb" title="${m.hint}">${m.label}</span>
        <input type="range" min="${m.min}" max="${m.max}" step="${m.step}" value="${m.min}">
        <span class="val">–</span>
    `;
    return row;
}

function fmt(name, v) {
    return SLIDERS[name].int ? String(Math.round(v)) : Number(v).toFixed(2);
}

/* ── Widget helpers ──────────────────────────────────────────────────── */
function getW(node, name) {
    return node.widgets?.find((w) => w.name === name);
}

function hideW(w) {
    if (!w) return;
    w.hidden = true;
    w.type = "hidden";
    w.computeSize = () => [0, -4];
    w.draw = () => {};
    w.mouse = () => false;
}

/* ── Extension ───────────────────────────────────────────────────────── */
app.registerExtension({
    name: "AdvancedImageDenoiser.UI",

    nodeCreated(node) {
        if (node.comfyClass !== "AdvancedImageDenoiser") return;
        injectCSS();

        for (const n of PARAM_NAMES) hideW(getW(node, n));

        /* The frontend's DOM widget layout sizes the widget area from
           options.getMinHeight. Report the panel's real measured content
           height as the minimum so the layout always allocates enough
           space; if the user drags the node taller, the panel
           (height:100%) stretches to fill the extra room. */
        const el = buildUI();
        const inner = el.querySelector(".adn-inner");
        let contentH = 300;
        node.addDOMWidget("denoiser_ui", "adn", el, {
            serialize: false,
            getMinHeight: () => contentH,
        });

        function measure() {
            if (inner.offsetHeight) contentH = inner.offsetHeight + 2;
        }

        /* Track reflow (e.g. text wrapping after a width change) so the
           layout's minimum height stays accurate. Passive: never resizes
           the node itself. */
        new ResizeObserver(() => measure()).observe(inner);

        const setVal = (name, v) => {
            const w = getW(node, name);
            if (w) { w.value = v; w.callback?.(v); }
        };

        /* sliders → widgets */
        for (const name of Object.keys(SLIDERS)) {
            const row = el.querySelector(`[data-row="${name}"]`);
            const input = row.querySelector("input");
            const val = row.querySelector(".val");
            input.addEventListener("input", () => {
                setVal(name, parseFloat(input.value));
                val.textContent = fmt(name, input.value);
            });
        }

        /* method buttons */
        el.querySelectorAll(".adn-m").forEach((b) => {
            b.addEventListener("click", () => {
                setVal("method", b.dataset.m);
                refresh();
            });
        });

        /* sharpen pills */
        el.querySelectorAll(".adn-pill").forEach((b) => {
            b.addEventListener("click", () => {
                setVal("sharpen_mode", b.dataset.s);
                refresh();
            });
        });

        /* advanced fold */
        let advOpen = false;
        const advH = el.querySelector(".adn-adv-h");
        advH.addEventListener("click", () => {
            advOpen = !advOpen;
            refresh();
        });

        /* ── refresh: widgets → DOM + visibility + size ──────────── */
        function refresh() {
            const method = getW(node, "method")?.value ?? "smart_auto";
            const sharpen = getW(node, "sharpen_mode")?.value ?? "off";

            el.querySelectorAll(".adn-m").forEach((b) =>
                b.classList.toggle("on", b.dataset.m === method));
            el.querySelectorAll(".adn-pill").forEach((b) =>
                b.classList.toggle("on", b.dataset.s === sharpen));

            const info = METHODS[method] ?? METHODS.smart_auto;
            el.querySelector(".adn-info .tag").textContent = info.tag;
            el.querySelector(".adn-info .d").textContent = info.desc;

            const mainSet = new Set(METHOD_SLIDERS[method] ?? []);
            const advSet = new Set(METHOD_ADVANCED[method] ?? []);
            for (const name of Object.keys(SLIDERS)) {
                const row = el.querySelector(`[data-row="${name}"]`);
                const w = getW(node, name);
                if (w) {
                    row.querySelector("input").value = w.value;
                    row.querySelector(".val").textContent = fmt(name, w.value);
                }
                if (["sharpen_amount", "sharpen_radius"].includes(name)) continue;
                row.classList.toggle("adn-hide", !(mainSet.has(name) || advSet.has(name)));
            }

            advH.classList.toggle("open", advOpen);
            el.querySelector(".adn-adv").classList.toggle("closed", !advOpen);
            el.querySelector(".adn-sharp-p").classList.toggle("closed", sharpen === "off");

            /* After the DOM settles, compare the panel's content height to
               the space the node actually gave it (both are real DOM
               measurements — no guessed offsets) and grow/shrink the node
               by exactly the difference. Width is never touched. */
            requestAnimationFrame(() => {
                measure();
                const delta = inner.offsetHeight - el.clientHeight;
                if (Math.abs(delta) > 3 && el.clientHeight > 0) {
                    node.setSize([node.size[0], node.size[1] + delta]);
                }
                node.setDirtyCanvas?.(true, true);
            });
        }

        /* sync after workflow load */
        const origConfigure = node.onConfigure;
        node.onConfigure = function (...args) {
            const r = origConfigure?.apply(this, args);
            setTimeout(refresh, 60);
            return r;
        };

        setTimeout(refresh, 60);
    },
});
