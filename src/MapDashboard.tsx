import { useEffect, useState, type FormEvent } from 'react'
import { Mark } from './components/Icons'
import { loadPlaces, loadRoute, makeDemoRoute, places, type Place, type RiskLevel, type RouteResult, type VehicleType } from './data/demoRoute'
import { RouteMap } from './map/RouteMap'
import { DeviceFrame } from './demo/DeviceFrame'
import { useGeolocation } from './demo/useGeolocation'
import { distanceKm } from './demo/geo'
import { TEMP_SCALE } from './map/stationsLayer'
import { clearDemoTransition, hasDemoTransition } from './transition/goToDemo'
import './MapDashboard.css'

const routeApiConfigured = Boolean(import.meta.env.VITE_ROUTE_API_URL)
const riskLabels: Record<RiskLevel, string> = { high: 'Висок риск', medium: 'Среден риск', low: 'Нисък риск' }
const formatTime = (minutes: number) => `${Math.floor(minutes / 60)} ч ${String(minutes % 60).padStart(2, '0')} мин`
const findPlace = (list: Place[], value: string) => list.find((place) => place.name.toLocaleLowerCase('bg') === value.trim().toLocaleLowerCase('bg'))
const MY_LOCATION = 'Моето местоположение'
const formatKm = (km: number) => (km < 1 ? `${Math.round(km * 1000)} м` : `${km.toFixed(km < 10 ? 1 : 0)} км`)
const clockTime = () => new Intl.DateTimeFormat('bg-BG', { hour: '2-digit', minute: '2-digit' }).format(new Date())

/** `/demo` = plain full-screen app, `/demo-cp` = the same app inside the CarPlay bezel artwork. */
export default function MapDashboard({ carplay = false }: { carplay?: boolean }) {
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
  const geo = useGeolocation()
  const [locateSignal, setLocateSignal] = useState(0)
  const [navigating, setNavigating] = useState(false)
  const [routeFromMe, setRouteFromMe] = useState(false)

  /** locate button / "my location" chip: find the device and fly the map to the car */
  async function locateMe() {
    try {
      await geo.locate()
      setLocateSignal((n) => n + 1)
    } catch {
      /* message shown from geo.error */
    }
  }

  function startFromMyLocation() {
    setOrigin(MY_LOCATION)
    void locateMe()
  }

  function startNavigation() {
    setNavigating(true)
    setRouteOpen(false)
    setRisksOpen(false)
  }

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
    const fromMe = origin.trim() === MY_LOCATION
    let from = findPlace(placeList, origin)
    if (fromMe) {
      try {
        const here = await geo.locate()
        from = { id: 'me', name: MY_LOCATION, coordinates: [here.lng, here.lat] }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Местоположението не е налично.')
        return
      }
    }
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
      setRouteFromMe(fromMe)
      setNavigating(false)
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

  // navigation banner: the closest marked section to the car
  const here = geo.position ? ([geo.position.lng, geo.position.lat] as [number, number]) : null
  const nextRisk = here
    ? route.risks
        .map((risk) => ({ risk, km: Math.min(...risk.geometry.map((point) => distanceKm(here, point))) }))
        .sort((a, b) => a.km - b.km)[0]
    : undefined

  return <div className={`mapdash${carplay ? ' mapdash--carplay' : ''}${entering ? ' is-entering' : ''}${risksOpen ? ' risks-open' : ''}${navigating ? ' is-navigating' : ''}`}><DeviceFrame enabled={carplay}>
    <div className="mapdash-map" aria-label="Карта на маршрута"><RouteMap route={route} selectedRisk={selectedRisk} mapStyle={mapStyle} resetViewSignal={resetViewSignal} onSelectRisk={(id) => { setSelectedRisk(id); if (id) openRisks() }} userPosition={geo.position} locateStatus={geo.status} navigating={navigating} onLocate={() => void locateMe()} locateSignal={locateSignal} /></div>
    <nav className="mapdash-rail" aria-label="Главно меню">
      <a className="rail-brand" href="/" title="SafetyCar — презентация" aria-label="Към презентацията"><Mark /></a>
      <div className="rail-divider" />
      <button className={routeOpen ? 'is-active' : ''} onClick={() => { setRouteOpen(!routeOpen); if (window.innerWidth <= 600) setRisksOpen(false) }} aria-label="Планиране на маршрут" aria-pressed={routeOpen}><img src="/images/ui/icon-route-ui.webp" alt="" /><small>Маршрут</small></button>
      <button className={risksOpen ? 'is-active' : ''} onClick={() => { if (risksOpen) setRisksOpen(false); else openRisks() }} aria-label="Рискови участъци" aria-pressed={risksOpen}><img src="/images/ui/icon-risk-ui.webp" alt="" /><small>Риск</small></button>
      <a className="rail-presentation" href="/" title="Към презентацията" aria-label="Към презентацията"><img src="/images/ui/icon-home-ui.webp" alt="" /><small>Начало</small></a>
      <div className="rail-spacer" /><span className="rail-status" title="Демонстрационен режим">●</span>
    </nav>
    <div className="carplay-status" aria-label={`SafetyCar, ${time}`}><span className="carplay-clock">{time}</span><span className="carplay-status-separator" /><strong>SafetyCar</strong><span className="carplay-signal" aria-hidden><i /><i /><i /></span></div>

    {routeOpen && <section className="mapdash-panel mapdash-panel--route" aria-labelledby="route-title">
      <header className="panel-header"><div className="panel-brand"><strong>SafetyCar</strong><span>ДЕМО КАРТА</span></div><button className="panel-close" onClick={() => setRouteOpen(false)} aria-label="Затвори панела">×</button></header>
      <div className="panel-scroll">
        <div className="route-intro"><h1 id="route-title">Накъде пътуваш?</h1><p>{routeApiConfigured ? 'Избери два града, за да видиш маршрут и наличните оценки по него.' : 'Избери два от предложените градове, за да разгледаш примерно трасе по коридора София–Бургас.'}</p></div>
        <form className="route-form" onSubmit={submit}>
          <div className="route-inputs">
            <label className="route-field"><span>НАЧАЛНА ТОЧКА</span><div><i className="field-dot field-dot--start" /><input list="route-cities" value={origin} onChange={(event) => setOrigin(event.target.value)} placeholder="Избери град" autoComplete="off" aria-label="Начална точка" /><button type="button" className={`field-locate${origin === MY_LOCATION ? ' is-active' : ''}`} onClick={startFromMyLocation} title={MY_LOCATION} aria-label="Започни от моето местоположение"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="10" r="2.3" fill="currentColor" /></svg></button></div></label>
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
        {routeFromMe && <button className="nav-start" type="button" onClick={startNavigation}><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden><path d="M12 2 20 21l-8-4-8 4 8-19Z" fill="currentColor" /></svg> Старт · навигация от тук</button>}
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
    {navigating && <div className="nav-banner" role="status">
      <span className="nav-banner__icon" aria-hidden>!</span>
      <span className="nav-banner__text">{nextRisk ? <><small>Следващ отбелязан участък · {nextRisk.risk.road}</small><strong>{nextRisk.risk.name} · {formatKm(nextRisk.km)}</strong></> : <><small>Навигация</small><strong>Няма отбелязани участъци по пътя</strong></>}</span>
      <button type="button" className="nav-banner__end" onClick={() => setNavigating(false)}>Край</button>
    </div>}
    {geo.error && <div className="map-toast" role="alert"><span>{geo.error}</span><button type="button" onClick={geo.clearError} aria-label="Затвори">×</button></div>}
    <div className="map-legend" aria-label="Легенда на картата"><span><i className="legend-line legend-line--route" /> {sampleRoute ? 'Примерно трасе' : 'Маршрут'}</span>{shownLevels.map((level) => <span key={level}><i className={`legend-line legend-line--${level}`} />{riskLabels[level]}</span>)}{routeApiConfigured && <span className="legend-temps" title="Температура на въздуха по пътните метеостанции"><b>°C</b>{TEMP_SCALE.map((step) => <span key={step.label}><i className="legend-dot" style={{ background: step.color }} />{step.label}</span>)}</span>}</div>
  </DeviceFrame></div>
}
