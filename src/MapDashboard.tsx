import { useEffect, useState, type FormEvent } from 'react'
import { Mark } from './components/Icons'
import { loadPlaces, loadRoute, makeDemoRoute, places, type Place, type RiskLevel, type RouteResult, type VehicleType } from './data/demoRoute'
import { RouteMap } from './map/RouteMap'
import { clearDemoTransition, hasDemoTransition } from './transition/goToDemo'
import './MapDashboard.css'

const routeApiConfigured = Boolean(import.meta.env.VITE_ROUTE_API_URL)
const riskLabels: Record<RiskLevel, string> = { high: 'Висок риск', medium: 'Среден риск', low: 'Нисък риск' }
const formatTime = (minutes: number) => `${Math.floor(minutes / 60)} ч ${String(minutes % 60).padStart(2, '0')} мин`
const findPlace = (list: Place[], value: string) => list.find((place) => place.name.toLocaleLowerCase('bg') === value.trim().toLocaleLowerCase('bg'))
const clockTime = () => new Intl.DateTimeFormat('bg-BG', { hour: '2-digit', minute: '2-digit' }).format(new Date())

export default function MapDashboard() {
  const [origin, setOrigin] = useState('София')
  const [destination, setDestination] = useState('Стара Загора')
  const [placeList, setPlaceList] = useState<Place[]>(places)
  useEffect(() => { loadPlaces().then(setPlaceList) }, [])
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
  const [mapStyle, setMapStyle] = useState<'satellite' | 'streets'>('satellite')
  const [resetViewSignal, setResetViewSignal] = useState(0)

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
    const from = findPlace(placeList, origin)
    const to = findPlace(placeList, destination)
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
  const shownLevels = (['high', 'medium', 'low'] as const).filter((level) => riskCounts[level] > 0)
  const sampleRoute = route.source === 'demo'
  const sourceLabel = sampleRoute ? 'Примерни данни' : 'Данни от сървъра'

  return <div className={`mapdash${entering ? ' is-entering' : ''}`}>
    <div className="mapdash-map" aria-label="Карта на маршрута"><RouteMap route={route} selectedRisk={selectedRisk} mapStyle={mapStyle} resetViewSignal={resetViewSignal} onSelectRisk={(id) => { setSelectedRisk(id); if (id) openRisks() }} /></div>
    <nav className="mapdash-rail" aria-label="Главно меню">
      <a className="rail-brand" href="/" title="SafetyCar — презентация" aria-label="Към презентацията"><Mark /></a>
      <div className="rail-divider" />
      <button className={routeOpen ? 'is-active' : ''} onClick={() => { setRouteOpen(!routeOpen); if (window.innerWidth <= 600) setRisksOpen(false) }} aria-label="Планиране на маршрут" aria-pressed={routeOpen}><img src="/images/ui/icon-route-ui.webp" alt="" /><small>Маршрут</small></button>
      <button className={risksOpen ? 'is-active' : ''} onClick={() => { if (risksOpen) setRisksOpen(false); else openRisks() }} aria-label="Рискови участъци" aria-pressed={risksOpen}><img src="/images/ui/icon-risk-ui.webp" alt="" /><small>Риск</small></button>
      <a className="rail-presentation" href="/" title="Към презентацията" aria-label="Към презентацията"><img src="/images/ui/icon-home-ui.webp" alt="" /><small>Начало</small></a>
      <div className="rail-spacer" /><span className="rail-status" title="Демонстрационен режим">●</span>
    </nav>
    <div className="carplay-status" aria-label={`SafetyCar, ${time}`}><span className="carplay-clock">{time}</span><span className="carplay-status-separator" /><strong>SafetyCar OS</strong></div>

    {routeOpen && <section className="mapdash-panel mapdash-panel--route" aria-labelledby="route-title">
      <header className="panel-header"><div className="panel-brand"><strong>SafetyCar</strong><span>ДЕМО КАРТА</span></div><button className="panel-close" onClick={() => setRouteOpen(false)} aria-label="Затвори панела">×</button></header>
      <div className="panel-scroll">
        <div className="route-intro"><h1 id="route-title">Накъде пътуваш?</h1><p>{routeApiConfigured ? 'Избери два града, за да видиш маршрут и наличните оценки по него.' : 'Избери два от предложените градове, за да разгледаш примерно трасе по коридора София–Бургас.'}</p></div>
        <form className="route-form" onSubmit={submit}>
          <div className="route-inputs">
            <label className="route-field"><span>НАЧАЛНА ТОЧКА</span><div><i className="field-dot field-dot--start" /><input list="route-cities" value={origin} onChange={(event) => setOrigin(event.target.value)} placeholder="Избери град" autoComplete="off" aria-label="Начална точка" /></div></label>
            <button className="swap-button" type="button" onClick={() => { setOrigin(destination); setDestination(origin) }} aria-label="Размени начална и крайна точка">⇅</button>
            <label className="route-field"><span>КРАЙНА ТОЧКА</span><div><i className="field-dot field-dot--end" /><input list="route-cities" value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="Избери град" autoComplete="off" aria-label="Крайна точка" /></div></label>
            <datalist id="route-cities">{placeList.map((place: Place) => <option key={place.id} value={place.name} />)}</datalist>
          </div>
          <div className="vehicle-field"><span>ВИД МПС</span><div className="vehicle-options" role="group" aria-label="Вид МПС"><button type="button" className={vehicle === 'car' ? 'is-selected' : ''} onClick={() => setVehicle('car')} aria-pressed={vehicle === 'car'}><img className="vehicle-illustration" src="/images/demo-car.webp" alt="" /><span><img className="vehicle-symbol" src="/images/ui/icon-car-ui.webp" alt="" />Лек автомобил</span></button><button type="button" className={vehicle === 'truck' ? 'is-selected' : ''} onClick={() => setVehicle('truck')} aria-pressed={vehicle === 'truck'}><img className="vehicle-illustration" src="/images/demo-truck.webp" alt="" /><span><img className="vehicle-symbol" src="/images/ui/icon-truck-ui.webp" alt="" />Над 3.5 т</span></button></div></div>
          <button className="route-submit" type="submit" disabled={loading}>{loading ? 'Зареждане…' : 'Покажи маршрута'} <span>→</span></button>
          {error && <p className="route-error" role="alert">{error}</p>}
        </form>
        <div className="panel-rule" />
        <div className="route-result-label"><span>ПОКАЗАН МАРШРУТ</span><span className="demo-chip">{sourceLabel.toUpperCase()}</span></div>
        <div className="route-result"><div className="result-route-line"><img src="/images/ui/pin-start.webp" alt="" /><i /><img src="/images/ui/pin-end.webp" alt="" /></div><div><strong>{shownRoute.origin}</strong><small>Начална точка</small><strong>{shownRoute.destination}</strong><small>Крайна точка</small></div></div>
        <div className="route-stats"><div><span>РАЗСТОЯНИЕ</span><strong>{route.distanceKm} <small>км</small></strong></div><div><span>ПРИБЛ. ВРЕМЕ</span><strong>{formatTime(route.durationMinutes)}</strong></div></div>
        <button className="risk-shortcut" onClick={openRisks}><span className="risk-shortcut-icon">!</span><span><strong>Оценки по маршрута</strong><small>Отбелязани участъци ({route.risks.length})</small></span><span>→</span></button>
      </div>
      <div className="panel-footer"><span className="orange-dot" /> {routeApiConfigured ? 'Видът МПС се отчита в пътните съобщения, когато са налични.' : 'Видът МПС променя примерното време за пътуване.'}</div>
    </section>}

    {risksOpen && <aside className="mapdash-panel mapdash-panel--risks" aria-labelledby="risks-title">
      <header className="risk-panel-header"><div><span className="eyebrow">{sourceLabel.toUpperCase()}</span><h2 id="risks-title">Риск по маршрута</h2></div><button className="panel-close" onClick={() => setRisksOpen(false)} aria-label="Затвори панела за риска">×</button></header>
      <div className="risk-panel-scroll">
        <div className="risk-overview"><div className="risk-overview-number">{route.risks.length.toString().padStart(2, '0')}</div><div><strong>отбелязани участъци</strong><small>{shownRoute.origin} → {shownRoute.destination}</small></div></div>
        <div className="risk-counts">{shownLevels.map((level) => <span key={level} className={`risk-count risk-count--${level}`}><img src={`/images/ui/risk-${level}.webp`} alt="" />{riskCounts[level]} · {riskLabels[level]}</span>)}</div>
        <div className="risk-list-heading"><span>УЧАСТЪЦИ</span></div>
        <div className="risk-list">{route.risks.length ? route.risks.map((risk, index) => <button key={risk.id} className={`risk-item risk-item--${risk.level}${selectedRisk === risk.id ? ' is-selected' : ''}`} onClick={() => setSelectedRisk(selectedRisk === risk.id ? null : risk.id)}><span className="risk-item-top"><span className="risk-item-index">{String(index + 1).padStart(2, '0')}</span><span className={`risk-pill risk-pill--${risk.level}`}><img src={`/images/ui/risk-${risk.level}.webp`} alt="" />{riskLabels[risk.level]}</span></span><strong>{risk.name}</strong><small>{risk.road} · {risk.lengthKm} км</small><span className="risk-item-description">{risk.description}</span><span className="risk-item-action">Покажи на картата ↗</span></button>) : <p className="risk-empty">{sampleRoute ? 'В това примерно трасе няма отбелязани участъци.' : 'Сървърът не върна отбелязани участъци за този маршрут.'}</p>}</div>
      </div>
      <div className="risk-panel-footer">{sampleRoute ? 'Трасето и оценките са само за демонстрация.' : 'Показани са само участъците, върнати от сървъра. Покритието на оценките е частично.'}</div>
    </aside>}

    <div className="map-tools"><button className="map-mode-badge" type="button" onClick={() => setMapStyle(mapStyle === 'satellite' ? 'streets' : 'satellite')} title="Смени стила на картата" aria-label={`Стил на картата: ${mapStyle === 'satellite' ? 'сателит' : 'стандартна'}. Смени стила.`}><img src="/images/ui/icon-layers-ui.webp" alt="" />{mapStyle === 'satellite' ? 'САТЕЛИТ · 3D' : 'КАРТА · 3D'}</button><button className="map-reset-button" type="button" onClick={() => setResetViewSignal((value) => value + 1)} title="Покажи целия маршрут" aria-label="Покажи целия маршрут"><img src="/images/ui/icon-compass-ui.webp" alt="" /></button></div>
    <div className="map-legend" aria-label="Легенда на картата"><span><i className="legend-line legend-line--route" /> {sampleRoute ? 'Примерно трасе' : 'Маршрут'}</span>{shownLevels.map((level) => <span key={level}><i className={`legend-line legend-line--${level}`} />{riskLabels[level]}</span>)}</div>
  </div>
}
