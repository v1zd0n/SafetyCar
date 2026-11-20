export type Lang = 'bg' | 'en'

export const dict = {
  bg: {
    nav: { problem: 'Проблемът', how: 'Как работи', features: 'Функции', team: 'Екип', demo: 'Демо' },
    loader: 'Зареждане на пътя',
    hero: {
      eyebrow: 'Пътна безопасност · България',
      title: ['Пътят', 'говори.'],
      sub: 'SafetyCar е прототип за оценка на риска по републиканските пътища. Разгледай примерната карта и изпробвай демото за маршрути.',
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
      eyebrow: '03 / 06 · Потегляне',
      title: 'Симулация в автомобила',
      sub: 'Таблото показва как би изглеждало предупреждение с примерни данни.',
    },
    hud: { k: 'Опасен завой', dist: '1.2 км', meta: '14 ПТП · 3 загинали', limit: 'Намали до 50', spot: '14 ПТП' },
    cluster: { unit: 'км/ч', risk: 'Риск', riskHigh: 'Висок', limit: 'Ограничение' },
    screen: {
      route: 'София → Враца',
      mode: 'Демо',
      boot: ['Стартиране на симулацията…', 'Зареждане на примерен маршрут…', 'Демото е готово.'],
      riskTitle: 'Примерен профил на риска',
      riskNext: 'Примерен рисков участък',
      riskDist: '1.2 км · Искърско дефиле',
      hint: 'Скролни към картата',
      apps: { map: 'Карта', stats: 'Статистики', pipeline: 'Как работи', shield: 'Функции', team: 'Екип', route: 'Маршрут' },
    },
    sections: {
      problem: {
        eyebrow: '01 · Проблемът',
        title: 'Всеки ден по пътищата губим хора.',
        body: 'Данните за катастрофите помагат да откроим участъци, по които тежките произшествия са по-чести.',
        stats: [
          { n: '478', l: 'загинали', c: 'danger' },
          { n: '9 054', l: 'ранени', c: 'signal' },
        ],
        note: 'Източник: данни на МВР за ПТП в България през 2024 г.',
      },
      how: {
        eyebrow: '02 · Как работи',
        title: 'Как оценяваме риска по участъци',
        body: 'За базовата оценка свързваме тежките ПТП извън населени места от 2021–2024 г., за които има координати, с характеристики на пътя от OpenStreetMap.',
        steps: [
          { k: '01 · Данни', v: 'МВР · OpenStreetMap' },
          { k: '02 · Анализ', v: 'Рискови фактори по участъци' },
          { k: '03 · Риск', v: 'Базов клас от 1 до 5' },
        ],
      },
      features: {
        eyebrow: '03 · Функции',
        title: 'Какво можеш да разгледаш',
        items: [
          { t: 'Примерна карта на риска', d: 'Цветовете показват как биха изглеждали струпвания на рискови точки.' },
          { t: 'Демо маршрут', d: 'Избери два града и разгледай отбелязаните участъци по трасето.' },
          { t: 'Оценки от сървъра', d: 'При свързан сървър демото показва оценки за обхванатите участъци по маршрута.' },
          { t: 'Пътни съобщения', d: 'Когато има актуални данни от АПИ, сървърът отчита събитията според вида на МПС.' },
        ],
      },
      team: {
        eyebrow: '04 · Екип',
        title: 'Направено за хакатон.',
        members: [
          { n: 'Виктор Недев', r: 'Frontend · 3D' },
          { n: 'Владимир Василев', r: 'Product Manager' },
          { n: 'Виктор Георгиев', r: 'Backend' },
          { n: 'Калин Димитров', r: 'Mentor' },
        ],
        ctaPrimary: 'Отвори демото',
        ctaGhost: 'GitHub',
      },
    },
    legend: { title: 'Примерни данни', high: 'Висок', mid: 'Среден', low: 'Нисък' },
    footer: {
      title: 'Разгледай демото за маршрути',
      copy: '© 2026 SafetyCar · Хакатон',
      top: '↑ Към началото',
    },
  },
  en: {
    nav: { problem: 'Problem', how: 'How it works', features: 'Features', team: 'Team', demo: 'Demo' },
    loader: 'Loading the road',
    hero: {
      eyebrow: 'Road safety · Bulgaria',
      title: ['The road', 'speaks.'],
      sub: 'SafetyCar is a prototype for assessing risk on Bulgaria’s national roads. Explore the sample map and try the route demo.',
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
      eyebrow: '03 / 06 · Setting off',
      title: 'In-car simulation',
      sub: 'The dashboard uses sample data to show what a warning could look like.',
    },
    hud: { k: 'Dangerous bend', dist: '1.2 km', meta: '14 crashes · 3 deaths', limit: 'Slow to 50', spot: '14 crashes' },
    cluster: { unit: 'km/h', risk: 'Risk', riskHigh: 'High', limit: 'Limit' },
    screen: {
      route: 'Sofia → Vratsa',
      mode: 'Demo',
      boot: ['Starting the simulation…', 'Loading a sample route…', 'Demo ready.'],
      riskTitle: 'Sample risk profile',
      riskNext: 'Example risk segment',
      riskDist: '1.2 km · Iskar gorge',
      hint: 'Scroll to the map',
      apps: { map: 'Map', stats: 'Stats', pipeline: 'How it works', shield: 'Features', team: 'Team', route: 'Route' },
    },
    sections: {
      problem: {
        eyebrow: '01 · The problem',
        title: 'Every day we lose people on our roads.',
        body: 'Crash records help identify stretches of road where serious crashes occur more often.',
        stats: [
          { n: '478', l: 'people killed', c: 'danger' },
          { n: '9,054', l: 'people injured', c: 'signal' },
        ],
        note: 'Source: 2024 crash records for Bulgaria from the Ministry of Interior.',
      },
      how: {
        eyebrow: '02 · How it works',
        title: 'How we assess risk by road segment',
        body: 'For the baseline assessment, we match geolocated serious crashes outside built-up areas from 2021–2024 with road characteristics from OpenStreetMap.',
        steps: [
          { k: '01 · Data', v: 'Ministry of Interior · OpenStreetMap' },
          { k: '02 · Analysis', v: 'Risk factors by segment' },
          { k: '03 · Risk', v: 'Baseline class from 1 to 5' },
        ],
      },
      features: {
        eyebrow: '03 · Features',
        title: 'What you can explore',
        items: [
          { t: 'Sample risk map', d: 'See how clusters of risk points can be visualised on a map.' },
          { t: 'Route demo', d: 'Pick two cities and explore the highlighted stretches along the route.' },
          { t: 'Server-backed estimates', d: 'With the server connected, the demo shows estimates for covered stretches along the route.' },
          { t: 'Road reports', d: 'When recent road agency reports are available, the server accounts for events by vehicle category.' },
        ],
      },
      team: {
        eyebrow: '04 · Team',
        title: 'Built for a hackathon.',
        members: [
          { n: 'Viktor Nedev', r: 'Frontend · 3D' },
          { n: 'Vladimir Vasilev', r: 'Product Manager' },
          { n: 'Viktor Georgiev', r: 'Backend' },
          { n: 'Kalin Dimitrov', r: 'Mentor' },
        ],
        ctaPrimary: 'Open the demo',
        ctaGhost: 'GitHub',
      },
    },
    legend: { title: 'Sample data', high: 'High', mid: 'Medium', low: 'Low' },
    footer: {
      title: 'Explore the route demo',
      copy: '© 2026 SafetyCar · Hackathon',
      top: '↑ Back to top',
    },
  },
}

export type Dict = (typeof dict)['bg']
