import { useLang } from '../i18n/LangContext'
import { scrollToLabel } from '../scroll/store'
import { Arrow } from './Icons'

export function HeroOverlay() {
  const { t } = useLang()
  return (
    <div className="hero" data-hero>
      <div className="hero__left">
        <p className="t-mono c-signal hero__eyebrow" data-reveal>
          {t.hero.eyebrow}
        </p>
        <h1 className="t-display-xl hero__title">
          {t.hero.title.map((line) => (
            <span className="line" key={line}>
              <span data-line>{line}</span>
            </span>
          ))}
        </h1>
      </div>
      <div className="hero__right">
        <p className="t-body-l" data-reveal>
          {t.hero.sub}
        </p>
        <div className="hero__ctas" data-reveal>
          <button className="btn btn--primary" onClick={() => scrollToLabel('inside')}>
            {t.hero.ctaPrimary} <Arrow />
          </button>
          <button className="btn btn--ghost" onClick={() => scrollToLabel('how')}>
            {t.hero.ctaGhost} <Arrow />
          </button>
        </div>
      </div>
      <div className="hero__scroll" data-reveal>
        <span className="t-mono c-muted">{t.hero.scroll}</span>
        <i />
      </div>
      <div className="hero__meta t-mono c-muted">
        <span>01 / 06</span>
        <span>42.6977° N · 23.3219° E</span>
      </div>
    </div>
  )
}

export function ApproachOverlay() {
  const { t } = useLang()
  return (
    <div className="approach" data-approach>
      <p className="t-mono c-signal">{t.approach.eyebrow}</p>
      <h2 className="t-display-xl approach__title">{t.approach.title}</h2>
      <p className="t-body-l approach__sub">{t.approach.sub}</p>
    </div>
  )
}

export function InsideCaption() {
  const { t } = useLang()
  return (
    <div className="inside-cap" data-inside>
      <p className="t-mono c-signal" data-inside-line>{t.inside.eyebrow}</p>
      <h2 className="t-display-m" data-inside-line>{t.inside.title}</h2>
      <p className="t-body-m" data-inside-line>{t.inside.sub}</p>
    </div>
  )
}
