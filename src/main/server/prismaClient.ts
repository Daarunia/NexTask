import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../prisma/generated/prisma/client.js'
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

// Path to test.db (mode test), dev.db ou app.db
const IS_TEST = process.argv.includes('--test')
const devDbPath = path.join(process.cwd(), 'dev.db')

let dbPath: string
if (IS_TEST) {
  dbPath = path.join(process.cwd(), 'test.db')
} else if (fs.existsSync(devDbPath)) {
  dbPath = devDbPath
} else {
  dbPath = path.join(app.getPath('userData'), 'app.db')
}

const connectionString = `file:${dbPath}`

const adapter = new PrismaBetterSqlite3({ url: connectionString })

// Create prisma client
export const prisma = new PrismaClient({ adapter, log: ['query'] })
