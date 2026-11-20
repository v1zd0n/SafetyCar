import { useEffect, useState } from 'react'
import { useLang } from '../i18n/LangContext'
import { sectionBus, scrollToLabel, type SectionId } from '../scroll/store'
import { Arrow } from './Icons'
import { goToDemo } from '../transition/goToDemo'

const ORDER: Exclude<SectionId, 'intro'>[] = ['problem', 'how', 'features', 'team']

function Rail() {
  const { t } = useLang()
  const [active, setActive] = useState<SectionId>(sectionBus.get())
  useEffect(() => sectionBus.on(setActive), [])
  const labels = [t.nav.problem, t.nav.how, t.nav.features, t.nav.team]
  return (
    <ol className="rail" aria-label="Progress">
      {ORDER.map((id, i) => (
        <li key={id} className={active === id ? 'is-active' : ''}>
          <button onClick={() => scrollToLabel(id)}>
            <i />
            <span className="t-mono">
              {String(i + 1).padStart(2, '0')} {labels[i]}
            </span>
          </button>
        </li>
      ))}
    </ol>
  )
}

export function MapOverlay() {
  const { t } = useLang()
  const s = t.sections
  return (
    <div className="map-ui" data-map-ui>
      <section className="panel panel--left" data-panel="problem" aria-labelledby="p-problem">
        <div className="glass card">
          <p className="t-mono c-signal">{s.problem.eyebrow}</p>
          <h2 id="p-problem" className="t-display-m">{s.problem.title}</h2>
          <p className="t-body-m">{s.problem.body}</p>
        </div>
        <div className="stats">
          {s.problem.stats.map((st) => (
            <div className="glass stat" key={st.l}>
              <span className={'t-number ' + (st.c ? 'c-' + st.c : '')}>{st.n}</span>
              <span className="t-mono c-secondary">{st.l}</span>
            </div>
          ))}
        </div>
        <p className="t-mono c-muted note">{s.problem.note}</p>
      </section>

      <section className="panel panel--left" data-panel="how" aria-labelledby="p-how">
        <div className="glass card">
          <p className="t-mono c-signal">{s.how.eyebrow}</p>
          <h2 id="p-how" className="t-display-m">{s.how.title}</h2>
          <p className="t-body-m">{s.how.body}</p>
        </div>
        <ol className="pipeline">
          {s.how.steps.map((st, i) => (
            <li key={st.k} className={'glass step' + (i === 2 ? ' is-hot' : '')}>
              <span className={'t-mono ' + (i === 2 ? 'c-signal' : '')}>{st.k}</span>
              <span className="t-body-m">{st.v}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="panel panel--right" data-panel="features" aria-labelledby="p-features">
        <div className="glass card">
          <p className="t-mono c-signal">{s.features.eyebrow}</p>
          <h2 id="p-features" className="t-display-m">{s.features.title}</h2>
          <ul className="features">
            {s.features.items.map((f) => (
              <li key={f.t}>
                <p className="t-heading-s">{f.t}</p>
                <p className="t-body-m">{f.d}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="panel panel--center" data-panel="team" aria-labelledby="p-team">
        <div className="glass card card--wide">
          <p className="t-mono c-signal">{s.team.eyebrow}</p>
          <h2 id="p-team" className="t-display-l">{s.team.title}</h2>
          <ul className="team">
            {s.team.members.map((m, i) => (
              <li key={i}>
                <i className="avatar" />
                <p className="t-heading-s">{m.n}</p>
                <p className="t-mono c-secondary">{m.r}</p>
              </li>
            ))}
          </ul>
          <div className="row">
            <a className="btn btn--primary" href="/demo" onClick={goToDemo}>
              {s.team.ctaPrimary} <Arrow />
            </a>
            <a className="btn btn--ghost" href="https://github.com" target="_blank" rel="noreferrer">
              {s.team.ctaGhost} <Arrow />
            </a>
          </div>
        </div>
      </section>

      <Rail />
      <div className="legend glass">
        <span><i className="dot dot--danger" /> <span className="t-mono c-secondary">{t.legend.high}</span></span>
        <span><i className="dot dot--signal" /> <span className="t-mono c-secondary">{t.legend.mid}</span></span>
        <span><i className="dot dot--safe" /> <span className="t-mono c-secondary">{t.legend.low}</span></span>
      </div>
    </div>
  )
}
