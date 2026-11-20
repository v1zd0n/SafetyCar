import { useEffect, useState, type FormEvent } from 'react'
import { Mark } from './components/Icons'
import { loadRoute, makeDemoRoute, places, type Place, type RiskLevel, type RouteResult, type VehicleType } from './data/demoRoute'
import { RouteMap } from './map/RouteMap'
import { clearDemoTransition, hasDemoTransition } from './transition/goToDemo'
import './MapDashboard.css'

const riskLabels: Record<RiskLevel, string> = { high: 'Висок риск', medium: 'Среден риск', low: 'Нисък риск' }
const formatTime = (minutes: number) => `${Math.floor(minutes / 60)} ч ${String(minutes % 60).padStart(2, '0')} мин`
const findPlace = (value: string) => places.find((place) => place.name.toLocaleLowerCase('bg') === value.trim().toLocaleLowerCase('bg'))
const clockTime = () => new Intl.DateTimeFormat('bg-BG', { hour: '2-digit', minute: '2-digit' }).format(new Date())

export default function MapDashboard() {
  const [origin, setOrigin] = useState('София')
  const [destination, setDestination] = useState('Стара Загора')
  const [vehicle, setVehicle] = useState<VehicleType>('car')
  const [route, setRoute] = useState<RouteResult>(() => makeDemoRoute(places[0], places[3], 'car'))
  const [shownRoute, setShownRoute] = useState({ origin: 'София', destination: 'Стара Загора' })
  const [selectedRisk, setSelectedRisk] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [routeOpen, setRouteOpen] = useState(true)
  const [risksOpen, setRisksOpen] = useState(() => window.innerWidth > 600)
  const [entering, setEntering] = useState(hasDemoTransition)
  const [time, setTime] = useState(clockTime)

  useEffect(() => {
    clearDemoTransition()
    const clock = window.setInterval(() => setTime(clockTime()), 30000)
    const arrival = window.setTimeout(() => setEntering(false), 850)
    return () => { window.clearInterval(clock); window.clearTimeout(arrival) }
  }, [])

  function openRisks() {
    setRisksOpen(true)
    if (window.innerWidth <= 600) setRouteOpen(false)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const from = findPlace(origin)
    const to = findPlace(destination)
    if (!from || !to) { setError('Изберете град от предложенията.'); return }
    if (from.id === to.id) { setError('Началната и крайната точка трябва да са различни.'); return }
    setLoading(true)
    setError('')
    try {
      const result = await loadRoute(from, to, vehicle)
      setRoute(result)
      setShownRoute({ origin: from.name, destination: to.name })
      setSelectedRisk(null)
      openRisks()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Възникна грешка при зареждането на маршрута.')
    } finally {
      setLoading(false)
    }
  }

  const riskCounts = { high: 0, medium: 0, low: 0 }
  route.risks.forEach((risk) => riskCounts[risk.level]++)

  return <div className={`mapdash${entering ? ' is-entering' : ''}`}>
    <div className="mapdash-map" aria-label="Сателитна карта на маршрута"><RouteMap route={route} selectedRisk={selectedRisk} onSelectRisk={(id) => { setSelectedRisk(id); if (id) openRisks() }} /></div>
    <nav className="mapdash-rail" aria-label="Главно меню">
      <a className="rail-brand" href="/" title="SafetyCar — презентация" aria-label="Към презентацията"><Mark /></a>
      <div className="rail-divider" />
      <button className={routeOpen ? 'is-active' : ''} onClick={() => { setRouteOpen(!routeOpen); if (window.innerWidth <= 600) setRisksOpen(false) }} aria-label="Планиране на маршрут" aria-pressed={routeOpen}><span>⌁</span><small>Маршрут</small></button>
      <button className={risksOpen ? 'is-active' : ''} onClick={() => { if (risksOpen) setRisksOpen(false); else openRisks() }} aria-label="Рискови участъци" aria-pressed={risksOpen}><span>◇</span><small>Риск</small></button>
      <a className="rail-presentation" href="/" title="Към презентацията" aria-label="Към презентацията"><span>↗</span><small>Начало</small></a>
      <div className="rail-spacer" /><span className="rail-status" title="Демонстрационен режим">●</span>
    </nav>
    <div className="carplay-status" aria-label={`SafetyCar, ${time}`}><span className="carplay-clock">{time}</span><span className="carplay-status-separator" /><strong>SafetyCar OS</strong><span className="carplay-signal" aria-hidden>▂▄▆</span><span className="carplay-battery" aria-hidden>▰</span></div>

    {routeOpen && <section className="mapdash-panel mapdash-panel--route" aria-labelledby="route-title">
      <header className="panel-header"><div className="panel-brand"><strong>SafetyCar</strong><span>ДЕМО КАРТА</span></div><button className="panel-close" onClick={() => setRouteOpen(false)} aria-label="Затвори панела">×</button></header>
      <div className="panel-scroll">
        <div className="route-intro"><span className="eyebrow"><i /> ПЛАНИРАНЕ НА МАРШРУТ</span><h1 id="route-title">Накъде пътуваш?</h1><p>Открий трасето и виж риска по пътя.</p></div>
        <form className="route-form" onSubmit={submit}>
          <div className="route-inputs">
            <label className="route-field"><span>НАЧАЛНА ТОЧКА</span><div><i className="field-dot field-dot--start" /><input list="route-cities" value={origin} onChange={(event) => setOrigin(event.target.value)} placeholder="Избери град" autoComplete="off" aria-label="Начална точка" /></div></label>
            <button className="swap-button" type="button" onClick={() => { setOrigin(destination); setDestination(origin) }} aria-label="Размени начална и крайна точка">⇅</button>
            <label className="route-field"><span>КРАЙНА ТОЧКА</span><div><i className="field-dot field-dot--end" /><input list="route-cities" value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="Избери град" autoComplete="off" aria-label="Крайна точка" /></div></label>
            <datalist id="route-cities">{places.map((place: Place) => <option key={place.id} value={place.name} />)}</datalist>
          </div>
          <div className="vehicle-field"><span>ВИД МПС</span><div className="vehicle-options" role="group" aria-label="Вид МПС"><button type="button" className={vehicle === 'car' ? 'is-selected' : ''} onClick={() => setVehicle('car')} aria-pressed={vehicle === 'car'}><img src="/images/demo-car.webp" alt="" /><span>Лек автомобил</span></button><button type="button" className={vehicle === 'truck' ? 'is-selected' : ''} onClick={() => setVehicle('truck')} aria-pressed={vehicle === 'truck'}><img src="/images/demo-truck.webp" alt="" /><span>Над 3.5 т</span></button></div></div>
          <button className="route-submit" type="submit" disabled={loading}>{loading ? 'Зареждане…' : 'Покажи маршрута'} <span>→</span></button>
          {error && <p className="route-error" role="alert">{error}</p>}
        </form>
        <div className="panel-rule" />
        <div className="route-result-label"><span>ИЗБРАН МАРШРУТ</span><span className="demo-chip">{route.source === 'demo' ? 'ПРИМЕРНИ ДАННИ' : 'ДАННИ ОТ СЪРВЪРА'}</span></div>
        <div className="route-result"><div className="result-route-line"><span>A</span><i /><span>B</span></div><div><strong>{shownRoute.origin}</strong><small>Начална точка</small><strong>{shownRoute.destination}</strong><small>Крайна точка</small></div></div>
        <div className="route-stats"><div><span>РАЗСТОЯНИЕ</span><strong>{route.distanceKm} <small>км</small></strong></div><div><span>ВРЕМЕ</span><strong>{formatTime(route.durationMinutes)}</strong></div></div>
        <button className="risk-shortcut" onClick={openRisks}><span className="risk-shortcut-icon">!</span><span><strong>{route.risks.length} рискови участъка</strong><small>Виж анализа на маршрута</small></span><span>→</span></button>
      </div>
      <div className="panel-footer"><span className="orange-dot" /> Демонстрационен режим</div>
    </section>}

    {risksOpen && <aside className="mapdash-panel mapdash-panel--risks" aria-labelledby="risks-title">
      <header className="risk-panel-header"><div><span className="eyebrow">АНАЛИЗ НА ТРАСЕТО</span><h2 id="risks-title">Риск по пътя</h2></div><button className="panel-close" onClick={() => setRisksOpen(false)} aria-label="Затвори рисковите участъци">×</button></header>
      <div className="risk-panel-scroll">
        <div className="risk-overview"><div className="risk-overview-number">{route.risks.length.toString().padStart(2, '0')}</div><div><strong>участъка по маршрута</strong><small>{shownRoute.origin} → {shownRoute.destination}</small></div></div>
        <div className="risk-counts">{(['high', 'medium', 'low'] as const).map((level) => <span key={level} className={`risk-count risk-count--${level}`}><i />{riskCounts[level]} {riskLabels[level].toLowerCase()}</span>)}</div>
        <div className="risk-list-heading"><span>УЧАСТЪЦИ</span><span>{route.risks.length} ОБЩО</span></div>
        <div className="risk-list">{route.risks.length ? route.risks.map((risk, index) => <button key={risk.id} className={`risk-item risk-item--${risk.level}${selectedRisk === risk.id ? ' is-selected' : ''}`} onClick={() => setSelectedRisk(selectedRisk === risk.id ? null : risk.id)}><span className="risk-item-top"><span className="risk-item-index">{String(index + 1).padStart(2, '0')}</span><span className={`risk-pill risk-pill--${risk.level}`}>{riskLabels[risk.level]}</span></span><strong>{risk.name}</strong><small>{risk.road} · {risk.lengthKm} км</small><span className="risk-item-description">{risk.description}</span><span className="risk-item-action">Покажи на картата ↗</span></button>) : <p className="risk-empty">За избрания маршрут няма примерни рискови участъци.</p>}</div>
      </div>
      <div className="risk-panel-footer">Данните са примерни и не са за реална навигация.</div>
    </aside>}

    <div className="map-mode-badge"><span>◈</span> САТЕЛИТ · 3D</div>
    <div className="map-legend" aria-label="Легенда на картата"><span><i className="legend-line legend-line--route" /> Маршрут</span><span><i className="legend-line legend-line--high" /> Висок</span><span><i className="legend-line legend-line--medium" /> Среден</span><span><i className="legend-line legend-line--low" /> Нисък</span></div>
  </div>
}
