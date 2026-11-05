import type { Plugin } from 'vite'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { openParkingDatabase } from '../ingest/sqlite.mjs'
import { createCombinedParkingStore } from '../ingest/combined-store'
import { createParkingHandler } from './handler'
import {
  createCachedLiveSource,
  createParkingLiveHandler,
} from './live-handler'
import { fetchSeoulLiveParking } from '../providers/seoul-live'
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
      // 실시간 주차 포화율용. 서울시 실시간 값을 60초 캐시하고 시설 DB 좌표와 조인한다.
      server.middlewares.use(
        createParkingLiveHandler(
          store,
          createCachedLiveSource(() => fetchSeoulLiveParking(keys.seoul)),
        ),
      )
      server.httpServer?.once('close', () => database.close())
    },
  }
}
