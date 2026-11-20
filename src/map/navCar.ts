import * as THREE from 'three'
import mapboxgl from 'mapbox-gl'

/**
 * Google-Maps-style 3D navigation car, generated in code and drawn with
 * three.js inside a Mapbox custom layer (shares Mapbox's WebGL context).
 * It keeps a constant on-screen size, sits on the 3D terrain, turns to the
 * travel heading and has a pulsing ring underneath.
 *
 * Model space: Y up, forward = -Z, length 1 unit.
 */

const ORANGE = '#ff7a35'
const CAR_PX = 76 // on-screen length of the car
const REAL_LENGTH_M = 4.6 // never smaller than a real car when zoomed far in

function sideProfileGeometry(points: [number, number][], width: number, bevel: number) {
  const shape = new THREE.Shape()
  shape.moveTo(points[0][0], 0.06)
  shape.lineTo(points[0][0], points[0][1])
  shape.splineThru(points.slice(1).map(([z, y]) => new THREE.Vector2(z, y)))
  shape.lineTo(points[points.length - 1][0], 0.06)
  shape.closePath()
  const depth = width - bevel * 2
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 5, curveSegments: 24 })
  geo.translate(0, 0, -depth / 2)
  geo.rotateY(-Math.PI / 2) // shape X → world Z (front = -Z)
  geo.computeVertexNormals()
  return geo
}

function buildCar() {
  const car = new THREE.Group()

  const paint = new THREE.MeshStandardMaterial({ color: '#f5f2ee', roughness: 0.32, metalness: 0.15 })
  const glass = new THREE.MeshStandardMaterial({ color: '#3d5068', roughness: 0.12, metalness: 0.55 })
  const tyre = new THREE.MeshStandardMaterial({ color: '#1a1a1c', roughness: 0.9 })
  const accent = new THREE.MeshStandardMaterial({ color: ORANGE, emissive: ORANGE, emissiveIntensity: 0.6 })
  const head = new THREE.MeshBasicMaterial({ color: '#ffffff' })
  const tail = new THREE.MeshBasicMaterial({ color: '#ff3b30' })

  const body = new THREE.Mesh(
    sideProfileGeometry(
      [
        [-0.47, 0.11],
        [-0.48, 0.15],
        [-0.42, 0.19],
        [-0.2, 0.205],
        [0.2, 0.215],
        [0.43, 0.2],
        [0.48, 0.15],
        [0.47, 0.11],
      ],
      0.44,
      0.04,
    ),
    paint,
  )
  car.add(body)

  const cabin = new THREE.Mesh(
    sideProfileGeometry(
      [
        [-0.2, 0.2],
        [-0.07, 0.3],
        [0.18, 0.305],
        [0.34, 0.21],
      ],
      0.36,
      0.035,
    ),
    glass,
  )
  car.add(cabin)

  // painted roof panel: from above the car must read as a white car, not a dark box of glass
  const roof = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.016, 0.25), paint)
  roof.position.set(0, 0.334, 0.055)
  car.add(roof)
  // orange roof stripe (brand accent, visible from above like a nav puck)
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.008, 0.3), accent)
  stripe.position.set(0, 0.345, 0.05)
  car.add(stripe)

  // light bars
  const headBar = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.01), head)
  headBar.position.set(0, 0.165, -0.505)
  car.add(headBar)
  const tailBar = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.022, 0.01), tail)
  tailBar.position.set(0, 0.17, 0.505)
  car.add(tailBar)

  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.06, 20)
  wheelGeo.rotateZ(Math.PI / 2)
  for (const x of [-0.21, 0.21]) {
    for (const z of [-0.3, 0.3]) {
      const w = new THREE.Mesh(wheelGeo, tyre)
      w.position.set(x, 0.075, z)
      car.add(w)
    }
  }
  return car
}

function buildGround() {
  const g = new THREE.Group()
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 40), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.35, depthWrite: false }))
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.004
  shadow.scale.set(0.75, 1.25, 1)
  g.add(shadow)
  const ringMat = new THREE.MeshBasicMaterial({ color: ORANGE, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide })
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.66, 64), ringMat)
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.006
  g.add(ring)
  return { group: g, ring, ringMat }
}

export type NavCar = {
  layer: mapboxgl.CustomLayerInterface
  /** position [lng, lat] and heading in degrees clockwise from north */
  set: (lngLat: [number, number], headingDeg: number) => void
}

export function createNavCar(id = 'safetycar-nav-car'): NavCar {
  let map: mapboxgl.Map | null = null
  let renderer: THREE.WebGLRenderer | null = null
  const scene = new THREE.Scene()
  const camera = new THREE.Camera()
  const car = buildCar()
  const ground = buildGround()
  scene.add(ground.group, car)
  scene.add(new THREE.HemisphereLight('#ffffff', '#5a4a3e', 2.2))
  const sun = new THREE.DirectionalLight('#ffffff', 2.2)
  sun.position.set(0.6, 1.4, -0.4)
  scene.add(sun)

  let position: [number, number] | null = null
  let targetHeading = 0
  let heading = 0
  const clock = new THREE.Clock()

  const layer: mapboxgl.CustomLayerInterface = {
    id,
    type: 'custom',
    renderingMode: '3d',
    onAdd(m, gl) {
      map = m
      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true })
      renderer.autoClear = false
    },
    onRemove() {
      renderer?.dispose()
      renderer = null
      map = null
    },
    render(_gl, matrix) {
      if (!map || !renderer || !position) return
      const dt = Math.min(clock.getDelta(), 0.1)
      // ease the heading the short way round
      const diff = ((targetHeading - heading + 540) % 360) - 180
      heading += diff * Math.min(1, dt * 6)

      const zoom = map.getZoom()
      const metersPerPixel = (40075016.686 * Math.cos((position[1] * Math.PI) / 180)) / (512 * 2 ** zoom)
      const lengthM = Math.max(REAL_LENGTH_M, CAR_PX * metersPerPixel)
      const elevation = map.queryTerrainElevation(position, { exaggerated: true }) ?? 0
      const merc = mapboxgl.MercatorCoordinate.fromLngLat(position, elevation)
      const s = merc.meterInMercatorCoordinateUnits() * lengthM

      const model = new THREE.Matrix4()
        .makeTranslation(merc.x, merc.y, merc.z ?? 0)
        .multiply(new THREE.Matrix4().makeRotationZ((heading * Math.PI) / 180))
        .multiply(new THREE.Matrix4().makeScale(s, -s, s))
        .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
      camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix as number[]).multiply(model)

      // pulse ring
      const t = (clock.elapsedTime % 1.8) / 1.8
      ground.ring.scale.setScalar(1 + t * 1.4)
      ground.ringMat.opacity = 0.85 * (1 - t)

      renderer.resetState()
      renderer.clearDepth() // stay readable on top of hills and buildings, like a nav puck
      renderer.render(scene, camera)
      map.triggerRepaint()
    },
  }

  return {
    layer,
    set(lngLat, headingDeg) {
      if (!position) heading = headingDeg
      position = lngLat
      targetHeading = headingDeg
      map?.triggerRepaint()
    },
  }
}
