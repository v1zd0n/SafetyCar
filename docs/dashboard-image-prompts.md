# Промптове за декоративни изображения на демото

Оригиналите са в `assets-src/images/` като JPG. `python scripts/prepare-demo-images.py` премахва плътния лилав фон на автомобила и камиона и записва прозрачни WebP файлове в `public/images/`. Пътната текстура се оптимизира като WebP и се показва в панела за рискови участъци. Картата и трасето остават интерактивни Mapbox слоеве.

## 1. Автомобил за избор на МПС — `demo-car.jpg`

```text
Premium editorial studio render of a modern unbranded graphite passenger car, three-quarter front view, full vehicle visible with generous space around it, subtle signal orange rim light (#FF6B2B), realistic materials, clean high-end automotive photography. The entire background is one perfectly flat solid purple #8000FF, with no floor, gradient, cast shadow, glow, or purple reflections on the car. No text, logo, license plate, people, or watermark.
```

## 2. Камион за избор на МПС — `demo-truck.jpg`

```text
Premium editorial studio render of a modern unbranded European heavy goods truck over 3.5 tonnes, three-quarter front view, full truck visible with generous space around it, dark graphite body and subtle signal orange rim light (#FF6B2B), realistic materials, clean high-end vehicle photography. The entire background is one perfectly flat solid purple #8000FF, with no floor, gradient, cast shadow, glow, or purple reflections on the truck. No text, logo, license plate, people, or watermark.
```

## 3. Тъмна текстура за информационна секция — `demo-road-texture.jpg`

```text
Wide abstract aerial view of a winding Bulgarian mountain road at dusk, deep charcoal terrain, restrained thin signal orange light tracing the road, sparse amber and red points suggesting changing road risk, refined editorial automotive aesthetic, very dark and low contrast with plenty of negative space for UI text. No cars, labels, text, logos, or watermark. Full-bleed background image; no cutout needed.
```

Картата, трасето и оцветяването на риска трябва да останат интерактивни Mapbox слоеве, а не част от изображение.
