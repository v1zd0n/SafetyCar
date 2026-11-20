-- osm2pgsql flex style for SafetyCar: only what the segment pipeline needs.
-- Run: osm2pgsql -d safetycar -O flex -S db/osm/safetycar.lua bulgaria.osm.pbf
-- Tables land in schema "osm" (created by db/10_osm_schema.sql before the import).

local S = 'osm'
local tables = {}

-- every highway way (national roads + the minor roads we count as access points / junctions)
tables.highways = osm2pgsql.define_way_table('highways', {
    { column = 'highway', type = 'text', not_null = true },
    { column = 'ref', type = 'text' },
    { column = 'name', type = 'text' },
    { column = 'oneway', type = 'text' },
    { column = 'tags', type = 'jsonb' },
    { column = 'geom', type = 'linestring', projection = 4326, not_null = true },
}, { schema = S })

-- point features on or near roads
tables.road_points = osm2pgsql.define_node_table('road_points', {
    { column = 'kind', type = 'text', not_null = true },   -- crossing, traffic_signals, stop, give_way, bus_stop, speed_camera
    { column = 'tags', type = 'jsonb' },
    { column = 'geom', type = 'point', projection = 4326, not_null = true },
}, { schema = S })

-- built-up areas (settlements), forests, buildings
tables.areas = osm2pgsql.define_area_table('areas', {
    { column = 'kind', type = 'text', not_null = true },   -- builtup, place, forest, building
    { column = 'subkind', type = 'text' },
    { column = 'name', type = 'text' },
    { column = 'geom', type = 'multipolygon', projection = 4326, not_null = true },
}, { schema = S })

-- administrative boundaries (country 2, oblast 4, municipality 6, ...)
tables.admin = osm2pgsql.define_relation_table('admin', {
    { column = 'admin_level', type = 'int' },
    { column = 'name', type = 'text' },
    { column = 'name_en', type = 'text' },
    { column = 'ref', type = 'text' },
    { column = 'geom', type = 'multipolygon', projection = 4326, not_null = true },
}, { schema = S })

-- settlement centre points (fallback when no built-up polygon exists)
tables.places = osm2pgsql.define_node_table('places', {
    { column = 'place', type = 'text', not_null = true },
    { column = 'name', type = 'text' },
    { column = 'population', type = 'text' },
    { column = 'geom', type = 'point', projection = 4326, not_null = true },
}, { schema = S })

local ROAD_KEYS = { 'lanes', 'lanes:forward', 'lanes:backward', 'width', 'est_width', 'maxspeed', 'lit',
    'sidewalk', 'sidewalk:left', 'sidewalk:right', 'sidewalk:both', 'shoulder', 'shoulder:left', 'shoulder:right',
    'surface', 'smoothness', 'bridge', 'tunnel', 'layer', 'junction', 'int_ref', 'overtaking', 'divider',
    'dual_carriageway', 'access', 'motor_vehicle', 'cycleway', 'service', 'tracktype' }

local function pick(tags, keys)
    local t, any = {}, false
    for _, k in ipairs(keys) do
        if tags[k] then t[k] = tags[k]; any = true end
    end
    return any and t or nil
end

local SKIP_HIGHWAY = { footway = true, path = true, steps = true, pedestrian = true, cycleway = true, bridleway = true,
    corridor = true, elevator = true, platform = true, proposed = true, construction = true, raceway = true,
    bus_stop = true, abandoned = true, razed = true, planned = true, rest_area = true, services = true }

function osm2pgsql.process_way(object)
    local t = object.tags
    if t.highway and not SKIP_HIGHWAY[t.highway] and t.area ~= 'yes' then
        tables.highways:insert({
            highway = t.highway, ref = t.ref, name = t.name, oneway = t.oneway,
            tags = pick(t, ROAD_KEYS), geom = object:as_linestring(),
        })
    end
    if object.is_closed then
        local kind, sub
        if t.landuse == 'residential' or t.landuse == 'commercial' or t.landuse == 'retail' or t.landuse == 'industrial' then
            kind, sub = 'builtup', t.landuse
        elseif t.place == 'city' or t.place == 'town' or t.place == 'village' or t.place == 'hamlet' then
            kind, sub = 'place', t.place
        elseif t.landuse == 'forest' or t.natural == 'wood' or t.natural == 'scrub' then
            kind, sub = 'forest', t.landuse or t.natural
        elseif t.building and t.building ~= 'no' then
            kind, sub = 'building', t.building
        end
        if kind then
            tables.areas:insert({ kind = kind, subkind = sub, name = t.name, geom = object:as_polygon() })
        end
    end
end

function osm2pgsql.process_relation(object)
    local t = object.tags
    if t.type == 'boundary' and t.boundary == 'administrative' and t.admin_level then
        tables.admin:insert({
            admin_level = tonumber(t.admin_level), name = t.name, name_en = t['name:en'], ref = t.ref,
            geom = object:as_multipolygon(),
        })
    elseif t.type == 'multipolygon' then
        local kind, sub
        if t.landuse == 'residential' or t.landuse == 'commercial' or t.landuse == 'retail' or t.landuse == 'industrial' then
            kind, sub = 'builtup', t.landuse
        elseif t.place == 'city' or t.place == 'town' or t.place == 'village' or t.place == 'hamlet' then
            kind, sub = 'place', t.place
        elseif t.landuse == 'forest' or t.natural == 'wood' or t.natural == 'scrub' then
            kind, sub = 'forest', t.landuse or t.natural
        end
        if kind then
            tables.areas:insert({ kind = kind, subkind = sub, name = t.name, geom = object:as_multipolygon() })
        end
    end
end

local POINT_KINDS = { crossing = true, traffic_signals = true, stop = true, give_way = true, bus_stop = true,
    speed_camera = true, mini_roundabout = true, motorway_junction = true }

function osm2pgsql.process_node(object)
    local t = object.tags
    if t.highway and POINT_KINDS[t.highway] then
        tables.road_points:insert({ kind = t.highway, tags = pick(t, { 'crossing', 'crossing:markings', 'traffic_signals', 'ref' }),
            geom = object:as_point() })
    elseif t.railway == 'level_crossing' then
        tables.road_points:insert({ kind = 'level_crossing', geom = object:as_point() })
    end
    if t.place == 'city' or t.place == 'town' or t.place == 'village' or t.place == 'hamlet' then
        tables.places:insert({ place = t.place, name = t.name, population = t.population, geom = object:as_point() })
    end
end
