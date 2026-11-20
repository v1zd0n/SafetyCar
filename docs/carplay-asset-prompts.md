# Отделни промптове за декора на SafetyCar Demo

Всеки блок е самостоятелен. Генерирайте иконите и рамките като PNG с прозрачност. Ако инструментът не поддържа прозрачност, поискайте **абсолютно равен фон #8000FF** за изрязване. Не слагайте текст в изображенията: надписите, реалната карта, маршрутът и рисковите линии се рисуват от приложението. Палитра: графит `#25221F`, топло оранжево `#FF7A35`, висок риск `#FF3B30`, среден `#FFB340`, нисък `#E8BD7C`. Без glow, bloom, неонови светлини и градиенти.

## 1. Рамка на CarPlay екрана за десктоп — `carplay-frame-desktop.png` · 1920×1080

```text
Create a front-facing 16:9 bezel overlay for an original, unbranded automotive infotainment display. Thin matte graphite frame, precise rounded corners, uniform 12 px visual thickness, one restrained machined-metal edge, tiny physical microphone aperture in the top edge. The entire central display area must be truly transparent so a live interactive map can show through. Keep the outside of the bezel transparent too. Perfectly symmetrical, orthographic, pixel-accurate, no perspective, no interface, no screen content, no text, no logo, no buttons. Flat neutral lighting, no glow, no gradients, no bloom, no vignette. PNG with alpha; if transparency is impossible, use pure solid #8000FF for both the screen opening and the outside area, with no purple reflected on the frame.
```

## 2. Рамка за телефон — `carplay-frame-mobile.png` · 1170×2532

```text
Create a front-facing portrait bezel overlay for an original, unbranded in-car companion display. Thin matte graphite outline with softly rounded corners, consistent edge thickness, a subtle physical top speaker slot. The central screen opening and everything outside the bezel are completely transparent for a live application underneath. Orthographic, perfectly symmetrical, no perspective, no screen content, no text, no brand marks. Flat studio light only; no glow, gradients, bloom or cast shadow. PNG with alpha; if alpha is unavailable, fill only the cutout and outside with perfectly flat #8000FF.
```

## 3. Резервен фон при липсваща карта — `map-fallback.jpg` · 1920×1080

```text
High-resolution straight-down aerial photograph of a Bulgarian mountain road and wooded hills at late afternoon, realistic terrain and asphalt, muted charcoal and natural earth colours, a small amount of warm orange sunlight on a ridge. The centre remains visually calm for overlay panels. This is a background for a route-planning application, not a fictional map: no coloured route, no pins, labels, buildings drawn by hand, cars, text, logo or watermark. Natural photographic contrast, no glow, gradients, bloom or vignette. Full-bleed rectangular image, no cutout.
```

## 4. Текстура за страничните панели — `panel-material.jpg` · 1024×1024

```text
Seamless tileable texture of very fine matte graphite polymer used on a premium car dashboard, subtle micrograin and restrained material detail, uniform dark charcoal #25221F tone. Designed to sit behind white interface text without reducing readability. Even lighting across the whole square: no directional light, highlight, shadow, gradients, glow, pattern, seam, text, logo or watermark. Full-bleed texture, no cutout.
```

## 5. Декор за заглавката на риска — `risk-header.jpg` · 1200×500

```text
Wide realistic editorial photograph of a sharp bend on a Bulgarian mountain road, viewed from a slightly elevated roadside angle, dark asphalt, metal guardrail, dry grass and forest. Leave the left half simple and dark for live UI text. Restrained charcoal, stone and warm earth colours; no artificial coloured road line, no warning icons, no cars, people, text, logo or watermark. Flat natural overcast lighting, no glow, gradients, bloom or vignette. Full-bleed rectangular image, no cutout.
```

## 6. Фон за прехода „Демо“ — `demo-transition.jpg` · 1920×1080

```text
Minimal cinematic still frame for the transition into a vehicle route planner: matte charcoal surface #25221F with one simple solid orange #FF7A35 road stripe crossing the lower third, precise geometry and generous negative space in the centre for live app typography. Original automotive visual language, flat colour fields, subtle physical material texture only. No vehicle, UI, text, logo, glow, gradients, bloom, light streaks or vignette. Full-bleed rectangular image, no cutout.
```

## 7. Икона „Маршрут“ — `icon-route-ui.png` · 512×512

```text
A single original flat vector-style icon for an automotive navigation dock: a clean curved road path connecting two solid circular endpoints, thick rounded strokes, warm orange #FF7A35 and off-white on a transparent canvas. Centred with 20% clear padding, crisp silhouette readable at 24 px. No container tile, text, letters, brand mark, 3D extrusion, shadow, glow or gradient. PNG with alpha; if alpha is impossible use a perfectly flat solid #8000FF background.
```

## 8. Икона „Рискови участъци“ — `icon-risk-ui.png` · 512×512

```text
A single original flat vector-style icon for an automotive navigation dock: a rounded triangular road warning symbol with a short bent road line inside, solid warning red #FF3B30 and off-white, clear at 24 px. Centred with 20% clear padding on transparent canvas. No container tile, text, letters, exclamation mark, logo, shadow, glow, gradient or 3D effect. PNG with alpha; if alpha is impossible use pure solid #8000FF outside the icon.
```

## 9. Икона „Начало“ — `icon-home-ui.png` · 512×512

```text
A single original flat vector-style home icon for an in-car navigation dock: simple house outline with one square doorway, thick rounded off-white strokes and one restrained orange #FF7A35 detail. Centre the icon with 20% clear padding on a transparent canvas; legible at 24 px. No container tile, text, logo, shadow, glow, gradient, texture or 3D effect. PNG with alpha; if needed use a perfectly flat #8000FF chroma-key background.
```

## 10. Икона „Слоеве на картата“ — `icon-layers-ui.png` · 512×512

```text
A single original flat vector-style map-layers icon: three offset rounded squares stacked in a precise isometric symbol, off-white strokes with a small solid orange #FF7A35 top layer. Clear silhouette at 24 px, centred with 20% empty padding, transparent canvas. No container tile, labels, logo, shadow, glow, gradient, bloom or photorealism. PNG with alpha; otherwise a perfectly flat solid #8000FF background.
```

## 11. Икона „Компас“ — `icon-compass-ui.png` · 512×512

```text
A single original flat vector-style compass for a satellite map control: thin circular outline and simple directional pointer, off-white with one solid orange #FF7A35 tip, symmetric and crisp at 24 px. Centre on transparent canvas with 20% clear padding. No letters, cardinal-direction text, container tile, logo, shadow, glow, gradient or 3D depth. PNG with alpha; if unavailable use only flat #8000FF behind the icon.
```

## 12. Икона „Лек автомобил“ — `icon-car-ui.png` · 512×512

```text
A single original flat vector-style side silhouette of a compact passenger car for a vehicle selector, rounded clean outline, graphite #25221F body with a solid orange #FF7A35 roof accent. Clear at 32 px, centred with generous transparent padding. No ground, shadow, text, logo, lighting effect, glow, gradient or 3D rendering. PNG with alpha; otherwise pure solid #8000FF background.
```

## 13. Икона „Над 3.5 тона“ — `icon-truck-ui.png` · 512×512

```text
A single original flat vector-style side silhouette of a European heavy goods truck with a box trailer, simple rounded geometry, graphite #25221F body and one solid orange #FF7A35 accent on the cab. Legible at 32 px, centred with generous transparent padding. No ground, shadow, text, logo, glow, gradient, reflections or 3D rendering. PNG with alpha; otherwise pure solid #8000FF background.
```

## 14. Пин за начална точка — `pin-start.png` · 512×512

```text
A single original flat map marker for a route start: solid off-white circular centre inside a thick orange #FF7A35 ring, with a short pointed bottom, perfectly symmetric and legible at 28 px. Transparent canvas with generous clear padding. No letters, text, label, container tile, cast shadow, glow, gradient or 3D effect. PNG with alpha; if necessary use a flat solid #8000FF backdrop.
```

## 15. Пин за крайна точка — `pin-end.png` · 512×512

```text
A single original flat map marker for a route destination: solid orange #FF7A35 centre within a thick off-white ring, short pointed bottom, perfectly symmetric and legible at 28 px. Transparent canvas with generous clear padding. No letters, text, label, container tile, cast shadow, glow, gradient or 3D effect. PNG with alpha; if necessary use pure solid #8000FF behind it.
```

## 16. Пиктограма „Висок риск“ — `risk-high.png` · 512×512

```text
A single original flat road-risk pictogram: one sharp road bend inside a simple octagonal outline, bold solid red #FF3B30 and off-white, high contrast at 24 px. Centred on transparent canvas with 20% empty padding. No number, text, words, container tile, shadow, glow, gradient, bloom or 3D effect. PNG with alpha; otherwise flat #8000FF background.
```

## 17. Пиктограма „Среден риск“ — `risk-medium.png` · 512×512

```text
A single original flat road-risk pictogram: one moderate road bend inside a simple octagonal outline, bold solid amber #FFB340 and off-white, high contrast at 24 px. Centred on transparent canvas with 20% empty padding. No number, text, words, container tile, shadow, glow, gradient, bloom or 3D effect. PNG with alpha; otherwise flat #8000FF background.
```

## 18. Пиктограма „Нисък риск“ — `risk-low.png` · 512×512

```text
A single original flat road-risk pictogram: one gently curving road inside a simple octagonal outline, bold solid sand #E8BD7C and off-white, high contrast at 24 px. Centred on transparent canvas with 20% empty padding. No number, text, words, container tile, shadow, glow, gradient, bloom or 3D effect. PNG with alpha; otherwise flat #8000FF background.
```
