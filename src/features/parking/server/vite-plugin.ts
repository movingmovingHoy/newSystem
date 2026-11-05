import type { Plugin } from 'vite'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { openParkingDatabase } from '../ingest/sqlite.mjs'
import { createCombinedParkingStore } from '../ingest/combined-store'
import { createParkingHandler } from './handler'
export function parkingPlugin(keys: { seoul: string; ts: string }): Plugin {
  return {
    name: 'local-parking-api',
    configureServer(server) {
      const directory = join(server.config.root, 'data')
      mkdirSync(directory, { recursive: true })
      const database = openParkingDatabase(
        join(directory, 'parking-combined-v1.sqlite'),
      )
      const store = createCombinedParkingStore(database, keys)
      server.middlewares.use(createParkingHandler(store))
      server.httpServer?.once('close', () => database.close())
    },
  }
}
