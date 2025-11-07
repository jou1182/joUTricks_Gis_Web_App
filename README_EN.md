# 🌍 JoUTricks GIS Viewer — v3

A lightweight, educational web GIS built with **Leaflet** that runs entirely in the browser.

## ✨ What's new in v3
- Upload support: **GeoJSON / Shapefile(.zip) / KML / KMZ / GPX / CSV / TopoJSON / WKT**
- Elegant **Style Editor** (color, weight, opacity, point size, marker/circle)
- **Session save/restore** using LocalStorage
- **Export** selected layer to GeoJSON or Shapefile
- Visual refinements aligned with JoUTricks brand (Gold #CD980E, Dark Gray #504C5B)

> **Note:** Browser-only support for **GeoPackage (.gpkg)** will land in **v3.1**. For now, please convert to GeoJSON or Shapefile.

## 👤 Credits
- Developed by **Dr. Youssef Seleim — JoUTricks Channel**  
- Supervised by **JoUTricks — Learn Smart. Work Smarter.**

## 🛠️ Usage
1. Open `index.html` in a modern browser.
2. Drag & drop your spatial file into the upload area.
3. Edit layer style via the **Style** button.
4. Save the session and restore it later from header buttons.
5. Export the selected layer as GeoJSON or Shapefile.

## 📦 Libraries (Sources)
- Leaflet — unpkg CDN
- shpjs (Shapefile reader) — jsDelivr
- JSZip (KMZ) — cdnjs
- togeojson (KML/GPX → GeoJSON) — cdnjs
- PapaParse (CSV) — cdnjs
- topojson-client — unpkg
- shp-write (Shapefile export) — unpkg
- terraformer-wkt-parser (WKT) — cdnjs

> All sources are referenced explicitly via `<script>` tags in `index.html`.
