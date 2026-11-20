# SafetyCar — Landing page план

## Решения от интервюто
| Тема | Решение |
|---|---|
| Стек | Vite + React + React Three Fiber (drei) + GSAP ScrollTrigger (+ Lenis за плавен скрол) |
| 3D кола | Модерен EV, без марка (логата се махат в Blender) |
| Екран в колата | Собствен UI в стил CarPlay, брандиран SafetyCar (без логата/иконите на Apple) |
| Карта | Mapbox GL JS, сателитен стил + 3D терен и 3D сгради |
| Визия | Тъмна, кинематографска; един акцент — сигнално оранжево/червено за „риск" |
| Език | BG по подразбиране + EN превключвател |
| Мобилни | Олекотена 3D версия (по-ниски текстури, без тежък post-processing) |
| Изображения | Промптове за ChatGPT / GPT Image |
| Figma | Нов файл: дизайн система + ключови екрани → одобрение → код |

## Figma
Файл: https://www.figma.com/design/mWESzxopC3wvY2RPLN5yJj
- **Design System** — цветови променливи (колекция `SafetyCar`), 8 текстови стила, компоненти `AppIcon` (6 варианта), `InfoCard`, `Button` (primary/ghost), `Nav`, `MapBase`.
- **Screens** — 01 Hero · 02 Approach · 03 Inside/Home · 04 Map·Проблемът · 05 Map·Как работи+Функции · 06 Екип/CTA → Glitch → Footer · M1/M2 мобилни.

Токени: `bg/base #0A0A0B`, `bg/elevated #141416`, `bg/glass #1C1C20`, `border/subtle #2A2A2F`, `text/primary #F4F4F5`, `text/secondary #A1A1AA`, `text/muted #5C5C66`, `accent/signal #FF5A1F`, `accent/danger #E5212E`, `accent/safe #3DDC97`, `glitch/cyan #00E5FF`, `glitch/magenta #FF2BD6`.
Шрифтове (с кирилица, Google Fonts): **Unbounded** (заглавия), **Onest** (текст), **JetBrains Mono** (етикети/данни).

## Сторибord на скрола
0. **Loader** — брандиран (логото се „чертае" като пътна маркировка), % зареждане на модела.
1. **Hero** — колата в тъмно студио с мъгла и мокър под; бавна орбита на камерата; голямо заглавие.
2. **Approach** — камерата обикаля и се приближава към страничното стъкло/предното стъкло; текстът се разпада.
3. **Inside** — камерата минава през стъклото, оглежда интериора, спира пред централния екран.
4. **Boot** — екранът светва: boot анимация SafetyCar → CarPlay-подобен home екран (док + икони).
5. **Map** — тап на иконата „Карта" → екранът се разширява до fullscreen → Mapbox сателит/3D. Всяка секция е карта-плочка над картата, а при скрол камерата прави `flyTo` към различен участък:
   - Проблемът + статистики (анимирани броячи)
   - Как работи (данни → анализ → риск)
   - Функции на приложението (heatmap, опасни участъци, безопасен маршрут)
   - Екип + CTA
6. **Glitch → Footer** — RGB split + scanlines + datamosh шейдър върху картата, разпад на пиксели и появата на footer.

## 3D модели (Sketchfab, свалят се от вас)
Всички са **CC Attribution** (позволено и за търговско ползване, изисква се кредит в footer-а).

| # | Модел | Полигони | Защо | Линк |
|---|---|---|---|---|
| 1 ⭐ | 2024 Tesla Model 3 + Interior | ~168k | Лек; голям централен екран — идеален за CarPlay UI. Качеството на интериора не е проверено (малко харесвания). | https://sketchfab.com/3d-models/61ddcbdbd3854c239e0c95bf60b00022 |
| 2 ⭐ | Honda E (Detailed Interior) 2021 | ~2.2M | Най-детайлен интериор, екрани по цялото табло. Тежък → ще го decimate-на + Draco/Meshopt. | https://sketchfab.com/3d-models/814cf3f8cfd64594b1c4f96e873c3cef |
| 3 | [FREE] Polestar 1 | ~137k | Много красив екстериор (758 харесвания); има допълнителни файлове в описанието. | https://sketchfab.com/3d-models/4a368c71047c4eb0829525d933752828 |
| 4 | Volvo S90 Recharge | ~3.3M | Много качествен, но най-тежък; авторът препоръчва сваляне през Google Drive (.blend). | https://sketchfab.com/3d-models/9462b07c10244fd4a28d86846dc9e3a9 |

**Как да ги свалите:** бутон *Download 3D Model* → формат **glTF (.gltf + textures)** или **GLB**. Сложете ги в `assets-src/models/<име>/`.
За отражения на боята: HDRI от Poly Haven (CC0), напр. „studio_small_09" или „dikhololo_night" — https://polyhaven.com/hdris

## Референции от Awwwards
- **Forge Automotive** — https://forgeautomotive.co.uk/ (SOTD 25.10.2026) — тъмна палитра + тъмночервен акцент, scroll-scrubbed интро, fake-3D осветление, clip-path меню.
- **SANTAL** — https://santalarch.com (SOTD 15.11.2026) — брандиран loader, Blender + WebGL, най-висок резултат за анимации.
- **197 Historias Ilustradas** — https://www.197historiasilustradas.com/ (SOTD 20.11.2026) — Three.js + GSAP story scroll и grid преходи.
- **Rivian** — https://rivian.com/ — overlay меню и галерия на автомобилен бранд.

Общи модели: почти черен фон + един акцент; скролът „скрабва" анимацията (не я пуска); loader-ът е част от шоуто; подписващи преходи (clip-path, glitch); историята е разказ, не списък от секции.

---

## Промптове за изображения
Вижте **docs/image-prompts.md** — по един пълен промпт за всяко изображение, с чисти цветове за изрязване (#00FF00 / #FF00FF) и скрипт `scripts/cockpit-keys.py`, който ги обработва.

---

## Отворени въпроси / рискове
- **Mapbox токенът** е публичен (`pk.`), но в Mapbox акаунта ограничете го по URL (localhost + домейна). В кода ще е в `.env` като `VITE_MAPBOX_TOKEN`, не се комитва.
- Mapbox върху 3D екрана: картата ще се рендира като HTML слой, синхронизиран с позицията на екрана в 3D, и после се разширява до fullscreen (по-стабилно от текстура в WebGL).
- Реални данни за ПТП: засега mock; трябва източник (МВР / АПИ / data.egov.bg).
- Кредити за модела (CC-BY) задължително във footer-а.
