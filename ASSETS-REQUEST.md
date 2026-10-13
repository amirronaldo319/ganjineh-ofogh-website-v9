# Source material that would make the site better

The site currently uses images extracted from the supplied PDFs (v25, Revised Master). Extracted images are limited by the PDF's embedded resolution and compression. Original files would improve sharpness on large screens, the share image and print use.

| Wanted | Why | Where it goes |
|---|---|---|
| Original renders of the tower — day and dusk, street corner and aerial (PNG/TIFF/JPG, ≥ 3000 px on the long side) | Home hero, gallery, share image; the current hero is 2200 px | `tools/build_images.py` → `assets/img/` |
| Original floor plans for Apartments 1–4 as vector (PDF/DWG/SVG) or ≥ 2400 px | Plan explorer and residence pages; confirms the Type → Apartment mapping | `assets/img/plan-*` |
| Interior renders (kitchen, living, bedrooms, baths) at original size | Residence pages, gallery | gallery |
| Landscape / amenity renders (garden, pool, lobby, rooftop) | Lifestyle page | gallery |
| Final logo (SVG) and brand colours | Header, favicon, share image | `favicon.svg`, header partial |
| Photos of the site / neighbourhood (real, dated) | Location page | gallery |
| Architect's model (IFC / Revit / SketchUp) | Replace the schematic tower model with the real one; confirm floor count and heights | `tower-viewer/` |
| Brochure PDF to offer for download | "Brochure" route on the contact page | `assets/` + link |

When files are supplied: drop them in, run `python3 tools/build_images.py` (needs `pymupdf` + `pillow`) then `python3 tools/build_site.py`.
