import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { dict, type Dict, type Lang } from './dict'

type Ctx = { lang: Lang; t: Dict; setLang: (l: Lang) => void }
const LangContext = createContext<Ctx | null>(null)

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem('sc-lang')
    if (saved === 'bg' || saved === 'en') return saved
  } catch {
    /* storage unavailable */
  }
  return 'bg'
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(initialLang)
  useEffect(() => {
    document.documentElement.lang = lang
    try {
      localStorage.setItem('sc-lang', lang)
    } catch {
      /* ignore */
    }
  }, [lang])
  return <LangContext.Provider value={{ lang, t: dict[lang] as Dict, setLang }}>{children}</LangContext.Provider>
}

export function useLang() {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useLang must be used inside LangProvider')
  return ctx
}
