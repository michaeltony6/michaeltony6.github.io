# michael-tony-site

Personal project site. Plain HTML, CSS and JavaScript with no build step and no dependencies (fonts come from Google Fonts).

The page is laid out as a five-stage pipeline: **IF** (intro), **ID** (about, coursework, toolchain), **EX** (projects), **MEM** (experience and leadership) and **WB** (contact). The nav tracks which stage you're in. **I/O** sits off the pipeline and links to `graphs.html`, the Desmos graphs page.

## Files

| Path | What it is |
|---|---|
| `index.html` | All main-page content. Edit text here. |
| `graphs.html` | Desmos graphs page. Each graph shows a preview and loads the live embed on click. |
| `img/desmos/` | Graph previews, rendered from each graph with the Desmos calculator's screenshot function. |
| `css/site.css` | Styles. Color and type tokens are at the top; the metallic gold material is at the bottom. |
| `js/util.js` | Shared canvas helpers (sizing, visibility-aware animation loop, RNG). |
| `js/hero.js` | Procedurally generated die, rendered with a WebGL thin-film shader and lit by the cursor. |
| `js/cpu.js` | Five-stage pipeline simulator running a program in the custom ISA (forwarding, load-use stalls, branch flushes). |
| `js/leg.js` | 3-DOF leg: analytic IK, joint-space PD control, Jᵀ F stance torques, torque saturation. |
| `js/unilert.js` | Illustrated Unilert scenario (agents, flood-zone reroute, capacity bottleneck). |
| `js/trace.js` | Desmos Trace merge rule on a quadtree, with a split-view compare. |
| `js/rowhammer.js` | Simplified RowHammer model with a tagged-counter detector. |
| `js/main.js` | Nav state, scroll reveals, decoder panel, click-to-load Desmos embeds, copy-email button. |
| `js/cursor.js` | Gold arrow cursor with a short gold-wire trail routed like a PCB trace (mouse only; off for touch and reduced motion). The trail hides over the leg demo while it follows the pointer. |
| `js/gold.js` | Moves the glare on metallic-gold elements toward the pointer. |
| `404.html` | Custom not-found page (GitHub Pages serves it for any missing URL). |
| `og.jpg` | Link-preview image for LinkedIn, iMessage, Slack and similar. |
| `Michael-Tony-Resume.pdf` | Linked from the nav and contact section. It includes your phone number. |

## Run locally

```bash
cd ~/Documents/michael-tony-site && python3 -m http.server 8000
```

Then open http://localhost:8000.

## Deploy to GitHub Pages

The simplest URL is `https://michaeltony6.github.io/`, which needs a repository named exactly `michaeltony6.github.io`:

```bash
cd ~/Documents/michael-tony-site && git init && git add . && git commit -m "Personal site" && git branch -M main
```

```bash
gh repo create michaeltony6.github.io --public --source . --push
```

Then on GitHub, open **Settings → Pages**, set the source to **Deploy from a branch**, and pick `main` / root. The site goes live at `https://michaeltony6.github.io/` within a minute or two. Your existing `desmos-trace` project keeps working at `/desmos-trace/`.

## Notes

- Every demo runs only while it is on screen, and all motion is turned off for visitors who set "reduce motion".
- The demos are simplified models made for the page. The captions say so, and the real results are stated separately in the text.
