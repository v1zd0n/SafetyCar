export type Lang = 'bg' | 'en'

// Stats are placeholder values until the real dataset is connected (see docs/landing-plan.md).
export const dict = {
  bg: {
    nav: { problem: 'Проблемът', how: 'Как работи', features: 'Функции', team: 'Екип', demo: 'Демо' },
    loader: 'Зареждане на пътя',
    hero: {
      eyebrow: 'Пътна безопасност · България · 2020—2026',
      title: ['Пътят', 'говори.'],
      sub: 'SafetyCar превръща хиляди катастрофи по националните пътища в една карта на риска — за да знаеш къде да намалиш, преди да е станало късно.',
      ctaPrimary: 'Влез в колата',
      ctaGhost: 'Как работи',
      scroll: 'Скролни',
    },
    approach: {
      eyebrow: '02 / 06 · Камерата минава през стъклото',
      title: 'Влез.',
      sub: 'Зад всяка цифра има човек. Нека погледнем отвътре.',
    },
    inside: {
      eyebrow: '03 / 06 · Запалване',
      title: 'Колата вече знае къде е опасно.',
      sub: 'Хиляди катастрофи, превърнати в предупреждение — точно на пътя пред теб.',
    },
    hud: { k: 'Опасен завой', dist: '1.2 км', meta: '14 ПТП · 3 загинали', limit: 'Намали до 50', spot: '14 ПТП' },
    cluster: { unit: 'км/ч', risk: 'Риск', riskHigh: 'Висок', limit: 'Ограничение' },
    screen: {
      route: 'I-1 · София → Враца',
      boot: ['Зареждане на 6 812 инцидента…', 'Изчисляване на риска за 19 512 км път…', 'Маршрутът е готов.'],
      riskTitle: 'Риск по маршрута',
      riskNext: 'Следващ опасен участък',
      riskDist: '1.2 км · Искърско дефиле',
      hint: 'Докосни „Карта“',
      apps: { map: 'Карта', stats: 'Статистики', pipeline: 'Как работи', shield: 'Функции', team: 'Екип', route: 'Маршрут' },
    },
    sections: {
      problem: {
        eyebrow: '01 · Проблемът',
        title: 'Всеки ден по пътищата губим хора.',
        body: 'България е сред страните с най-висока смъртност по пътищата в ЕС. Повечето катастрофи се случват на едни и същи участъци — но шофьорите не го знаят.',
        stats: [
          { n: '~530', l: 'загинали годишно', c: 'danger' },
          { n: '6 800+', l: 'тежки ПТП', c: 'signal' },
          { n: '20%', l: 'на 1% от пътищата', c: '' },
        ],
        note: '* Примерни стойности — ще се заменят с реални данни.',
      },
      how: {
        eyebrow: '02 · Как работи',
        title: 'От сурови данни до риск на всеки километър.',
        body: 'Събираме отворени данни за ПТП, трафик и пътна инфраструктура, почистваме ги и изчисляваме индекс на риска за всеки участък.',
        steps: [
          { k: '01 · Данни', v: 'МВР · АПИ · OSM' },
          { k: '02 · Анализ', v: 'клъстери · тренд' },
          { k: '03 · Риск', v: 'индекс 0–100' },
        ],
      },
      features: {
        eyebrow: '03 · Функции',
        title: 'Какво получаваш.',
        items: [
          { t: 'Heatmap на риска', d: 'Цялата пътна мрежа, оцветена по опасност.' },
          { t: 'Опасни участъци', d: 'Топ 100 „черни точки“ с история на инцидентите.' },
          { t: 'Безопасен маршрут', d: 'Маршрут, който избягва най-рисковите отсечки.' },
          { t: 'Предупреждения', d: 'Сигнал 1–2 км преди опасен завой.' },
        ],
      },
      team: {
        eyebrow: '04 · Екип',
        title: 'Направено за хакатон. Мислено за пътя.',
        members: [
          { n: 'Виктор Недев', r: 'Frontend · 3D' },
          { n: 'Владимир Василев', r: 'Product Manager' },
          { n: 'Виктор Георгиев', r: 'Backend' },
          { n: 'Калин Димитров', r: 'Mentor' },
        ],
        ctaPrimary: 'Отвори приложението',
        ctaGhost: 'GitHub',
      },
    },
    legend: { high: 'Висок риск', mid: 'Среден', low: 'Нисък' },
    tooltip: { k: 'I-1 · KM 214 · Завой', v: '14 ПТП · 3 загинали' },
    footer: {
      title: 'Карай информирано.',
      sub: 'Отворени данни, отворен код, по-безопасни пътища.',
      cols: [
        { h: 'Проект', items: ['Проблемът', 'Как работи', 'Функции', 'Екип'] },
        { h: 'Ресурси', items: ['GitHub', 'Данни', 'API', 'Методология'] },
        { h: 'Кредити', items: ['3D модел: автор (CC-BY)', 'Карта: © Mapbox © OpenStreetMap', 'HDRI: Poly Haven (CC0)'] },
      ],
      copy: '© 2026 SafetyCar · Хакатон',
      top: '↑ Към началото',
    },
  },
  en: {
    nav: { problem: 'Problem', how: 'How it works', features: 'Features', team: 'Team', demo: 'Demo' },
    loader: 'Loading the road',
    hero: {
      eyebrow: 'Road safety · Bulgaria · 2020—2026',
      title: ['The road', 'speaks.'],
      sub: 'SafetyCar turns thousands of crashes on national roads into a single risk map — so you know where to slow down before it is too late.',
      ctaPrimary: 'Get in the car',
      ctaGhost: 'How it works',
      scroll: 'Scroll',
    },
    approach: {
      eyebrow: '02 / 06 · The camera goes through the glass',
      title: 'Get in.',
      sub: 'Behind every number is a person. Let’s look from the inside.',
    },
    inside: {
      eyebrow: '03 / 06 · Ignition',
      title: 'The car already knows where it’s dangerous.',
      sub: 'Thousands of crashes turned into one warning — right on the road ahead.',
    },
    hud: { k: 'Dangerous bend', dist: '1.2 km', meta: '14 crashes · 3 deaths', limit: 'Slow to 50', spot: '14 crashes' },
    cluster: { unit: 'km/h', risk: 'Risk', riskHigh: 'High', limit: 'Limit' },
    screen: {
      route: 'I-1 · Sofia → Vratsa',
      boot: ['Loading 6,812 incidents…', 'Scoring risk on 19,512 km of road…', 'Route ready.'],
      riskTitle: 'Route risk',
      riskNext: 'Next dangerous segment',
      riskDist: '1.2 km · Iskar gorge',
      hint: 'Tap “Map”',
      apps: { map: 'Map', stats: 'Stats', pipeline: 'How it works', shield: 'Features', team: 'Team', route: 'Route' },
    },
    sections: {
      problem: {
        eyebrow: '01 · The problem',
        title: 'Every day we lose people on our roads.',
        body: 'Bulgaria has one of the highest road fatality rates in the EU. Most crashes happen on the same stretches — but drivers don’t know it.',
        stats: [
          { n: '~530', l: 'deaths per year', c: 'danger' },
          { n: '6,800+', l: 'serious crashes', c: 'signal' },
          { n: '20%', l: 'on 1% of roads', c: '' },
        ],
        note: '* Placeholder values — to be replaced with real data.',
      },
      how: {
        eyebrow: '02 · How it works',
        title: 'From raw data to risk on every kilometre.',
        body: 'We collect open data on crashes, traffic and road infrastructure, clean it, and compute a risk index for every road segment.',
        steps: [
          { k: '01 · Data', v: 'Police · RIA · OSM' },
          { k: '02 · Analysis', v: 'clusters · trend' },
          { k: '03 · Risk', v: 'index 0–100' },
        ],
      },
      features: {
        eyebrow: '03 · Features',
        title: 'What you get.',
        items: [
          { t: 'Risk heatmap', d: 'The whole road network, coloured by danger.' },
          { t: 'Dangerous segments', d: 'Top 100 black spots with incident history.' },
          { t: 'Safe route', d: 'A route that avoids the riskiest stretches.' },
          { t: 'Alerts', d: 'A heads-up 1–2 km before a dangerous bend.' },
        ],
      },
      team: {
        eyebrow: '04 · Team',
        title: 'Built for a hackathon. Designed for the road.',
        members: [
          { n: 'Viktor Nedev', r: 'Frontend · 3D' },
          { n: 'Vladimir Vasilev', r: 'Product Manager' },
          { n: 'Viktor Georgiev', r: 'Backend' },
          { n: 'Kalin Dimitrov', r: 'Mentor' },
        ],
        ctaPrimary: 'Open the app',
        ctaGhost: 'GitHub',
      },
    },
    legend: { high: 'High risk', mid: 'Medium', low: 'Low' },
    tooltip: { k: 'I-1 · KM 214 · Bend', v: '14 crashes · 3 deaths' },
    footer: {
      title: 'Drive informed.',
      sub: 'Open data, open source, safer roads.',
      cols: [
        { h: 'Project', items: ['Problem', 'How it works', 'Features', 'Team'] },
        { h: 'Resources', items: ['GitHub', 'Data', 'API', 'Methodology'] },
        { h: 'Credits', items: ['3D model: author (CC-BY)', 'Map: © Mapbox © OpenStreetMap', 'HDRI: Poly Haven (CC0)'] },
      ],
      copy: '© 2026 SafetyCar · Hackathon',
      top: '↑ Back to top',
    },
  },
}

export type Dict = (typeof dict)['bg']
