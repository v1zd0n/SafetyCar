import type mapboxgl from 'mapbox-gl'

// Mapbox styles label places in English (name_en). Mapbox has no Bulgarian translation field,
// but every feature also has its local name: Cyrillic in Bulgaria (София, Пловдив, България),
// the local language abroad. Switch every label that shows a name to that local name.
// Road number shields (ref) are left alone. Call on 'style.load'.
export function applyLocalNames(map: mapboxgl.Map) {
  for (const layer of map.getStyle()?.layers ?? []) {
    if (layer.type !== 'symbol') continue
    const field = map.getLayoutProperty(layer.id, 'text-field')
    if (field && JSON.stringify(field).includes('name')) {
      map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name'], ['get', 'name_en']])
    }
  }
}
