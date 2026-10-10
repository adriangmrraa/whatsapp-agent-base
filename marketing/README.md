# Marketing — assets generados por código

Assets visuales de `whatsapp-agent-base`, generados por código (sin herramientas
de diseño externas) imitando la gramática visual de Formosa.dev. Nada de esto se
compila con la app: es contenido de difusión para la comunidad.

## Qué hay acá

- `carousel/whatsapp-agent-base-carousel.html` — carrusel de 7 slides (1080×1350,
  4:5), estilo "warm editorial" (Manrope 800, paleta Ink/Rosa/Amarillo/Crema/
  Lavanda/Durazno, texturas de trama a lápiz). Abrí el archivo en el navegador para
  verlo (flechas ◀ ▶); el modo `?export&slide=N` es para exportar.
- `carousel/png/` — los 7 slides ya exportados a PNG, listos para subir a redes.
- `video/story-whatsapp-agent-base/` — proyecto HyperFrames (story 1080×1920,
  20 s). Copy en español rioplatense, acento verde WhatsApp (`#25D366`), mascots
  generados con `sharp`. El render final queda en
  `renders/story-whatsapp-agent-base.mp4`.

## Regenerar

```bash
# Carrusel → PNGs
cd marketing
npm install
npx playwright install chromium
npm run export:carousel

# Video → MP4
cd video/story-whatsapp-agent-base
npm run render
```

## Nota de marca

No se usan assets de la marca Formosa.dev (logos, zorritos, capi) en este repo: los
marks propios (burbuja de chat, mascots) se generan con `sharp` vía `gen-assets.mjs`.
