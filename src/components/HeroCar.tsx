/**
 * Image-based hero car (public/images/car-hero.webp, cut out from the
 * generated studio shot). Layers: orange rim glow → floor line → reflection →
 * car → light sweep. The scroll timeline later dollies into its side window.
 */
export function HeroCar() {
  return (
    <div className="hero-car" data-hero-car aria-hidden>
      <div className="hero-car__glow" />
      <div className="hero-car__floor" />
      <div className="hero-car__body" data-hero-car-body>
        <img className="hero-car__reflection" src="/images/car-hero.webp" alt="" />
        <img className="hero-car__img" src="/images/car-hero.webp" alt="" />
        <div className="hero-car__sweep" />
      </div>
    </div>
  )
}
