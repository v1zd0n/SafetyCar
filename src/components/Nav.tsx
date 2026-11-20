import { useLang } from '../i18n/LangContext'
import { scrollToLabel } from '../scroll/store'
import { Arrow, Mark } from './Icons'

export function Nav() {
  const { t, lang, setLang } = useLang()
  const links: [string, string][] = [
    ['problem', t.nav.problem],
    ['how', t.nav.how],
    ['features', t.nav.features],
    ['team', t.nav.team],
  ]
  return (
    <header className="nav">
      <a
        className="nav__logo"
        href="#top"
        onClick={(e) => {
          e.preventDefault()
          scrollToLabel('hero')
        }}
      >
        <Mark />
        <span className="t-mono">SafetyCar</span>
      </a>
      <nav className="nav__links" aria-label="Sections">
        {links.map(([id, label]) => (
          <button key={id} onClick={() => scrollToLabel(id)}>
            {label}
          </button>
        ))}
      </nav>
      <div className="nav__right">
        <div className="lang" role="group" aria-label="Language">
          {(['bg', 'en'] as const).map((l) => (
            <button key={l} className={'t-mono' + (lang === l ? ' is-active' : '')} onClick={() => setLang(l)} aria-pressed={lang === l}>
              {l}
            </button>
          ))}
        </div>
        <a className="btn btn--ghost nav__demo" href="#demo">
          {t.nav.demo} <Arrow />
        </a>
      </div>
    </header>
  )
}
