# Промптове за изображения (ChatGPT / GPT Image)

**Как да ги ползвате**
- Всеки промпт е самостоятелен — копирайте целия блок.
- Запишете резултата като **PNG** с точното име от заглавието в една папка, напр. `assets-src/images/`.
- После пуснете: `python -I scripts/cockpit-keys.py assets-src/images` — скриптът изрязва зеления/магента фон, прави `.webp`, слага ги в `public/images/` и отпечатва новите координати на екраните за `src/cockpit/config.ts`. Сайтът ги взима автоматично (до тогава се ползват векторни заместители).
- Цветове за изрязване: **#00FF00** (чисто зелено) и **#FF00FF** (чисто магента) — плоски, без градиент, без отражения.
- Ако ChatGPT предложи „transparent background“ за иконите — може и така, тогава зеленият фон не е нужен.

---

## 1. `cockpit-interior.png` — интериорът (най-важното)
Размер: **1536×1024**

```
Photorealistic interior of an original, unbranded premium electric car, seen from the exact centre of the cabin between the two front seats, camera at driver eye height, perfectly symmetrical one-point perspective, looking straight forward through the windshield. Left-hand drive.

Car design: minimalist futuristic EV cabin. A low, wide, wraparound dashboard that sweeps from door to door in one continuous curve, upholstered in dark graphite leather with fine horizontal stitching, a thin brushed dark-titanium trim strip and a single continuous hairline ambient light strip in warm signal orange (#FF5A1F) running along the full width of the dashboard. A squared-off, flat-top-and-bottom steering yoke in black leather with a small round hub, on the left side. Behind the yoke, a slim floating horizontal digital driver display. In the centre, a large floating landscape touchscreen (about 16:10) on a thin stalk, slightly tilted towards the driver. A floating centre console with a wireless charging pad and a minimal drive selector. Frameless door windows, thin A-pillars, a panoramic glass roof edge visible at the top. Materials: graphite nappa leather, matte black recycled fabric, dark smoked titanium, piano black only around the screens. No buttons clutter, no visible logos.

Lighting: night, cabin lit only by the orange ambient strip and a soft cool glow, cinematic, moody, high-end automotive photography, sharp focus, ultra-detailed.

IMPORTANT for compositing:
- The entire windshield and both side windows are filled with a perfectly flat, solid pure green #00FF00, no reflections, no gradient, no outside scenery.
- The centre touchscreen surface AND the driver display surface are both filled with a perfectly flat, solid pure magenta #FF00FF, no reflections, no UI, no glare, with crisp straight edges and a thin black bezel around them.
- Nothing green or magenta anywhere else in the image.
No text, no logos, no watermarks.
```

## 2. `cockpit-road.png` — пътят през предното стъкло
Размер: **1536×1024**

```
Cinematic night photograph of a two-lane mountain road in the Balkan mountains of Bulgaria, seen from a low driver's eye level in the middle of the lane, one-point perspective with the vanishing point slightly above the vertical centre of the image. Wet dark asphalt with sharp white edge lines and a dashed white centre line converging to the horizon. The road gently curves to the right in the distance into a dangerous bend, with a metal crash barrier on the right. Dark pine-forest silhouettes and mountain ridges, thin low mist in the valley, a deep navy night sky with a subtle warm orange glow on the horizon from a distant town, two tiny red taillights far ahead. Moody, calm, high-end car-commercial colour grade, anamorphic lens look, subtle film grain. No car interior, no dashboard, no windshield frame, no people, no road signs with readable text, no text, no logos, no watermarks.
```

## 3. `payner-wallpaper.png` — тапет на Payner OS
Размер: **1536×1024**

```
Abstract premium wallpaper for a car infotainment screen. A smooth deep graphite-to-black gradient with soft, glowing, flowing curved light trails that look like road lines seen from above at night: one trail glowing warm signal orange (#FF5A1F), two faint cool white trails, subtle blur and bokeh, a gentle frosted-glass feeling, very dark overall so white UI text stays readable on top. Lots of calm empty space. No text, no logos, no icons, no watermarks.
```

---

## Иконите (6 броя) — по един промпт за всяка
Размер: **1024×1024** · фон **#00FF00**

### 4. `icon-map.png` — Карта
```
A single premium app icon for a car infotainment system: a rounded-square (squircle) tile made of dark frosted smoked glass with a soft inner glow and a thin bright highlight along the top edge, subtle 3D depth, centred and filling about 85% of the canvas. On the tile, a minimal white glyph of a folded paper map with a glowing signal-orange (#FF5A1F) location pin. Original design, Apple-level polish, soft studio lighting. The background around the tile is a perfectly flat, solid pure green #00FF00 with no shadow and no gradient. No text, no letters, no logos, no watermarks.
```

### 5. `icon-stats.png` — Статистики
```
A single premium app icon for a car infotainment system: a rounded-square (squircle) tile made of dark frosted smoked glass with a soft inner glow and a thin bright highlight along the top edge, subtle 3D depth, centred and filling about 85% of the canvas. On the tile, a minimal white glyph of three rising bar-chart columns with a small glowing signal-orange (#FF5A1F) warning triangle at the top right. Original design, Apple-level polish, soft studio lighting. The background around the tile is a perfectly flat, solid pure green #00FF00 with no shadow and no gradient. No text, no letters, no logos, no watermarks.
```

### 6. `icon-pipeline.png` — Как работи
```
A single premium app icon for a car infotainment system: a rounded-square (squircle) tile made of dark frosted smoked glass with a soft inner glow and a thin bright highlight along the top edge, subtle 3D depth, centred and filling about 85% of the canvas. On the tile, a minimal white glyph of three connected circular nodes forming a data pipeline, the last node glowing signal orange (#FF5A1F). Original design, Apple-level polish, soft studio lighting. The background around the tile is a perfectly flat, solid pure green #00FF00 with no shadow and no gradient. No text, no letters, no logos, no watermarks.
```

### 7. `icon-shield.png` — Функции
```
A single premium app icon for a car infotainment system: a rounded-square (squircle) tile made of dark frosted smoked glass with a soft inner glow and a thin bright highlight along the top edge, subtle 3D depth, centred and filling about 85% of the canvas. On the tile, a minimal white glyph of a protective shield with a dashed road centre line running vertically through it in glowing signal orange (#FF5A1F). Original design, Apple-level polish, soft studio lighting. The background around the tile is a perfectly flat, solid pure green #00FF00 with no shadow and no gradient. No text, no letters, no logos, no watermarks.
```

### 8. `icon-team.png` — Екип
```
A single premium app icon for a car infotainment system: a rounded-square (squircle) tile made of dark frosted smoked glass with a soft inner glow and a thin bright highlight along the top edge, subtle 3D depth, centred and filling about 85% of the canvas. On the tile, a minimal white glyph of three abstract people silhouettes standing together, the one on the right glowing signal orange (#FF5A1F). Original design, Apple-level polish, soft studio lighting. The background around the tile is a perfectly flat, solid pure green #00FF00 with no shadow and no gradient. No text, no letters, no logos, no watermarks.
```

### 9. `icon-route.png` — Маршрут
```
A single premium app icon for a car infotainment system: a rounded-square (squircle) tile made of dark frosted smoked glass with a soft inner glow and a thin bright highlight along the top edge, subtle 3D depth, centred and filling about 85% of the canvas. On the tile, a minimal white glyph of a curved dashed route line from a white start point at the bottom left to a glowing signal-orange (#FF5A1F) destination point at the top right. Original design, Apple-level polish, soft studio lighting. The background around the tile is a perfectly flat, solid pure green #00FF00 with no shadow and no gradient. No text, no letters, no logos, no watermarks.
```

---

## Колата отвън (същият дизайн като интериора)

### 10. `car-hero.png` — колата за мобилна версия / изрязване
Размер: **1536×1024**

```
Studio product photograph of an original, unbranded premium electric fastback sedan, three-quarter front view from the left at a low camera height, the whole car visible and centred with margin around it.

Car design: long, low and wide stance with a short front overhang; a smooth clamshell bonnet with no grille; a razor-thin full-width LED light bar across the nose and a matching full-width orange (#FF5A1F) rear light bar; a single continuous panoramic smoked-glass canopy flowing from the windshield into a sloping fastback roof; frameless windows; flush pop-out door handles; clean sculpted flanks with one sharp shoulder line; a thin glowing signal-orange accent line along the lower sill; 21-inch five-spoke aero wheels in dark titanium with small orange centre caps; deep graphite metallic paint with a glossy clearcoat. No badges, no logos, no licence plate.

Lighting: soft overhead studio strip light and a warm orange rim light from behind outlining the silhouette, crisp reflections on the paint, ultra-detailed, high-end car commercial.

The background is a perfectly flat, solid pure green #00FF00 — no floor, no shadow on the background, no reflections of green on the car. No text, no watermarks.
```

### 11. `og-image.png` — картинка за споделяне в социални мрежи
Размер: **1536×1024** (ще я изрежа до 1200×630)

```
Wide cinematic key visual at night: an original unbranded graphite electric fastback sedan with a full-width white light bar, seen from above at a 45-degree angle, driving along a winding mountain road in Bulgaria. The road surface is overlaid with a glowing data heatmap that runs from cool white to signal orange (#FF5A1F) to red, intensifying on the sharpest bends to mark dangerous segments. Dark forest, mist in the valleys, satellite-map feel blended with a car commercial. The left third of the image is calm and dark for a headline. No text, no logos, no watermarks.
```

---

### Бележки
- Шум, scanlines, глич, HUD проекцията и UI на екрана се правят в кода — не са нужни изображения за тях.
- „Payner“ е съществуваща търговска марка. На сайта е само като текст „Payner OS“, без лого. Ако сайтът ще е публичен, проверете дали имате право да я ползвате.
