import { useLang } from '../i18n/LangContext'
import { scrollToLabel } from '../scroll/store'
import { Mark } from './Icons'
import { goToDemo } from '../transition/goToDemo'

export function Footer() {
  const { t, lang, setLang } = useLang()
  return (
    <footer className="footer" id="demo">
      <div className="footer__bg" aria-hidden>
        <img src="/images/og-image.webp" alt="" loading="lazy" />
      </div>
      <div className="footer__top">
        <Mark width={40} height={40} />
        <h2 className="t-display-m">{t.footer.title}</h2>
        <a className="btn btn--primary" href="/demo" onClick={goToDemo} style={{ marginTop: 24 }}>{t.nav.demo} →</a>
      </div>
      <p className="footer__word" aria-hidden>
        SafetyCar
      </p>
      <div className="footer__bottom t-mono c-muted">
        <span>{t.footer.copy}</span>
        <button className="t-mono c-muted" onClick={() => setLang(lang === 'bg' ? 'en' : 'bg')}>
          BG / EN
        </button>
        <button className="t-mono c-signal" onClick={() => scrollToLabel('hero')}>
          {t.footer.top}
        </button>
      </div>
    </footer>
  )
}
