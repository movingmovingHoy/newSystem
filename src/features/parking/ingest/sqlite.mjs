import { DatabaseSync } from 'node:sqlite'

/** Node 전용. 브라우저용 providers/index.ts에서는 내보내지 않는다. */
export function openParkingDatabase(path) {
  const db = new DatabaseSync(path)
  db.exec(`
    CREATE TABLE IF NOT EXISTS parking_lots (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      lat REAL NOT NULL, lng REAL NOT NULL, fee TEXT
    );
    CREATE INDEX IF NOT EXISTS parking_coordinates ON parking_lots(lat, lng);
    CREATE TABLE IF NOT EXISTS parking_ingest (id INTEGER PRIMARY KEY CHECK (id = 1), day TEXT NOT NULL);
  `)
  return {
    count: () =>
      Number(
        db.prepare('SELECT COUNT(*) AS count FROM parking_lots').get().count,
      ),
    lastUpdatedDay: () =>
      db.prepare('SELECT day FROM parking_ingest WHERE id = 1').get()?.day ??
      null,
    readBounds: ({ minLat, maxLat, minLng, maxLng }) =>
      db
        .prepare(
          `
      SELECT * FROM parking_lots WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?
    `,
        )
        .all(minLat, maxLat, minLng, maxLng)
        .map((row) => ({
          id: row.id,
          name: row.name,
          location: { lat: row.lat, lng: row.lng },
          fee: row.fee === null ? null : JSON.parse(row.fee),
        })),
    replace(lots, day) {
      db.exec('BEGIN IMMEDIATE')
      try {
        db.exec('DELETE FROM parking_lots')
        const insert = db.prepare(
          'INSERT INTO parking_lots (id, name, lat, lng, fee) VALUES (?, ?, ?, ?, ?)',
        )
        for (const lot of lots)
          insert.run(
            lot.id,
            lot.name,
            lot.location.lat,
            lot.location.lng,
            lot.fee === null ? null : JSON.stringify(lot.fee),
          )
        db.prepare(
          'INSERT INTO parking_ingest (id, day) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET day = excluded.day',
        ).run(day)
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },
    close: () => db.close(),
  }
}
