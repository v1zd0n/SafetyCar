// Postgres pools. DATABASE_URL (read, the API) and DATABASE_URL_WRITE (pollers; defaults to DATABASE_URL).
// Outside the server the values can come from the project's .env (development).
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function fromDotEnv(name) {
  for (const file of [join(root, 'backend', '.env'), join(root, '.env')]) {
    if (!existsSync(file)) continue
    const line = readFileSync(file, 'utf8').split('\n').find(l => l.startsWith(name + '='))
    if (line) return line.slice(name.length + 1).trim()
  }
  return undefined
}

export const env = name => process.env[name] ?? fromDotEnv(name)

const readUrl = env('DATABASE_URL')
if (!readUrl) throw new Error('DATABASE_URL is not set (environment, backend/.env or .env)')

// numeric -> JS number (km, lengths); bigint counts -> number
pg.types.setTypeParser(1700, v => (v === null ? null : Number(v)))
pg.types.setTypeParser(20, v => (v === null ? null : Number(v)))

export const pool = new pg.Pool({ connectionString: readUrl, max: 10, statement_timeout: 30000 })
export const writePool = new pg.Pool({ connectionString: env('DATABASE_URL_WRITE') ?? readUrl, max: 3 })

export const query = (sql, params) => pool.query(sql, params)
export const root_dir = root
