import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const base = 'https://traffic.api.bg/EsriBg.RIA.DatexII.WebApi/api'
export const feeds = [
  'PublicEvent', 'ReversibleLanes', 'Maintenance', 'SurfaceCondition',
  'Weather', 'Visibility', 'Obstruction', 'Accident', 'ClosedRoads', 'AccessRestrictions',
]

async function get(path) {
  const response = await fetch(base + path, {
    headers: { Accept: 'application/json', Referer: 'https://traffic.api.bg/road-status/nap' },
    signal: AbortSignal.timeout(25000),
  })
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
  return response.json()
}

async function latest(feed) {
  const files = await get(`/${feed}/json/files`)
  const file = files.sort((a, b) => b.createdOn - a.createdOn)[0]
  if (!file?.id) throw new Error(`${feed}: no publication available`)
  return get(`/Files/${encodeURIComponent(file.id)}`)
}

function roadRef(number) {
  const ref = String(number ?? '').toUpperCase().replace(/\s/g, '')
  const motorway = /^[AА]-?(\d+)[LR]?$/.exec(ref)
  if (motorway) return 'A' + motorway[1]
  if (/^\d{1,4}$/.test(ref)) return ['I', 'II', 'III', 'III'][ref.length - 1] + '-' + ref
  return /^(?:I|II|III)-\d{1,4}$/.test(ref) ? ref : null
}

function coordinate(lon, lat) {
  return Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90
}

function locations(location) {
  const point = location?.locPointLocation?.pointByCoordinates?.pointCoordinates
  if (point && coordinate(point.longitude, point.latitude)) {
    return [{ directional: false, geometry: { type: 'Point', coordinates: [point.longitude, point.latitude] } }]
  }
  const elements = location?.locSingleRoadLinearLocation?.linearWithinLinearElement ?? []
  return elements.flatMap(({ linearElement }) => {
    const element = linearElement?.locLinearElementByLineString
    const line = element?.gmlLineString?.locGmlLineString
    const road = roadRef(element?.roadNumber)
    if (!road || !line?.posList || !line.srsName?.endsWith('::4326')) return []
    const positions = line.posList.trim().split(/\s+/).map(Number)
    if (positions.length < 4 || positions.length % 2) return []
    // EPSG:4326 in GML is latitude/longitude. GeoJSON uses longitude/latitude.
    const coordinates = []
    for (let i = 0; i < positions.length; i += 2) {
      const lon = positions[i + 1]
      const lat = positions[i]
      if (!coordinate(lon, lat)) return []
      coordinates.push([Math.round(lon * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6])
    }
    const names = element.roadName?.values ?? []
    const directional = /[LR]$/i.test(element.roadNumber) ||
      names.some(({ value }) => /посока|towards/i.test(value))
    return [{ road, directional, geometry: { type: 'LineString', coordinates } }]
  })
}

function vehicleRules(characteristics, otherCondition) {
  return (characteristics.length ? characteristics : [{}]).map(rule => {
    const weights = rule.grossWeightCharacteristic ?? []
    const simpleWeights = weights.filter(weight =>
      Number.isFinite(weight.grossVehicleWeight) && weight.grossVehicleWeight > 0 &&
      ['greaterThan', 'greaterThanOrEqualTo', 'lessThan', 'lessThanOrEqualTo', 'equalTo']
        .includes(weight.comparisonOperator?.value) &&
      weight.typeOfWeight?.value === 'maximumPermitted')
    return {
      weights: simpleWeights.map(weight => ({
        tonnes: weight.grossVehicleWeight, operator: weight.comparisonOperator.value,
      })),
      conditional: Boolean(otherCondition || simpleWeights.length !== weights.length ||
        Object.entries(rule).some(([key, value]) => {
          if (key === 'grossWeightCharacteristic') return false
          if (key === 'heightCharacteristic') return value.some(entry => entry.vehicleHeight !== 0)
          if (key === 'lengthCharacteristic') return value.some(entry => entry.vehicleLength !== 0)
          return true
        })),
    }
  })
}

function event(feed, id, type, record, validity, location, characteristics = [], otherCondition = false) {
  const timing = validity?.validityTimeSpecification
  const status = validity?.validityStatus?.value
  if (status !== 'active' && status !== 'planned') return []
  const starts_at = timing?.overallStartTime ?? null
  const ends_at = timing?.overallEndTime ?? null
  if ((starts_at && !Number.isFinite(Date.parse(starts_at))) ||
      (ends_at && !Number.isFinite(Date.parse(ends_at))) || (status === 'planned' && !starts_at)) {
    throw new Error(`${feed}/${id}: invalid validity period`)
  }
  const subtype = record.roadOrCarriagewayOrLaneManagementType?.value ??
    record.generalNetworkManagementType?.value ?? null
  const conditions = [
    ...(record.poorEnvironmentType ?? []),
    ...(record.weatherRelatedRoadConditionType ?? []),
    ...(record.nonWeatherRelatedRoadConditionType ?? []),
  ].map(condition => condition.value)
  return locations(location).map(position => ({
    id, feed, type, subtype, conditions,
    starts_at, ends_at,
    vehicle_rules: vehicleRules(characteristics, otherCondition),
    description: record.troTrafficRegulationExtensionG?.description ??
      record.generalPublicComment?.[0]?.comment?.values?.[0]?.value ?? null,
    ...position,
  }))
}

export function normalize(documents) {
  const events = []
  const publications = {}
  for (const feed of feeds) {
    const doc = documents[feed]
    const publication = doc?.sitSituationPublication ?? doc?.troTrafficRegulationPublication
    if (!Number.isFinite(Date.parse(publication?.publicationTime))) {
      throw new Error(`${feed}: invalid DATEX II publication`)
    }
    publications[feed] = publication.publicationTime
    const rows = feed === 'AccessRestrictions'
      ? publication.trafficRegulationsWithoutTrafficRegulationOrder?.trafficRegulation
      : publication.situation
    if (!Array.isArray(rows)) throw new Error(`${feed}: missing DATEX II record list`)
    for (const row of rows) {
      if (feed === 'AccessRestrictions') {
        const record = row.troTrafficRegulation
        const condition = record.condition
        const vehicle = condition.troVehicleCondition?.vehicleCharacteristics
        const hasOtherCondition = Object.keys(condition).some(key =>
          !['troTimeValidityCondition', 'troLocationCondition', 'troVehicleCondition'].includes(key))
        const [rule] = vehicleRules(vehicle ? [vehicle] : [], hasOtherCondition)
        const weightClass = record.troTrafficRegulationExtensionG?.vehicleWeightRestrictionClass
        const hasUnparsedWeight = Boolean(weightClass && weightClass !== 'none' && !rule.weights.length)
        // The feed also lists advisory records whose vehicle fields contain only zero placeholders.
        if (!rule.weights.length && !rule.conditional && !hasUnparsedWeight) continue
        events.push(...event(feed, record.idG, 'accessRestriction', record,
          condition.troTimeValidityCondition?.implementedValidity,
          condition.troLocationCondition?.implementedLocation,
          vehicle ? [vehicle] : [], hasOtherCondition || hasUnparsedWeight))
        continue
      }
      for (const entry of row.situationRecord) {
        const [type, record] = Object.entries(entry).find(([key]) => !key.endsWith('ExtensionG'))
        events.push(...event(feed, row.idG, type, record, record.validity, record.locationReference,
          record.forVehiclesWithCharacteristicsOf, Boolean(record.applicableForTrafficType?.length)))
      }
    }
  }
  return { publications, events }
}

async function main() {
  const [option, directory, ...extra] = process.argv.slice(2)
  if ((option && (option !== '--from-dir' || !directory)) || extra.length) {
    throw new Error('Usage: node fetch.mjs [--from-dir PATH]')
  }
  const entries = await Promise.all(feeds.map(async feed => [
    feed, directory ? JSON.parse(await readFile(join(directory, feed + '.json'), 'utf8')) : await latest(feed),
  ]))
  const snapshot = normalize(Object.fromEntries(entries))
  const payload = JSON.stringify(snapshot).replace(/[^\x00-\x7f]/g,
    character => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'))
  let tag = '$road_status$'
  while (payload.includes(tag)) tag = tag.slice(0, -1) + '_$'
  // Output a single atomic upsert only after every feed has been downloaded and parsed.
  process.stdout.write(`insert into public.road_status_snapshot (singleton, payload)
values (true, ${tag}${payload}${tag}::jsonb)
on conflict (singleton) do update set payload = excluded.payload
where not exists (
  select 1 from jsonb_each_text(public.road_status_snapshot.payload -> 'publications') previous
  where previous.value::timestamptz > (excluded.payload -> 'publications' ->> previous.key)::timestamptz
);
`)
  process.stderr.write(`${snapshot.events.length} georeferenced records from ${feeds.length} publications\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}
