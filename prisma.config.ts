import { defineConfig } from 'prisma/config'
import path from 'node:path'

const defaultDbPath = path.join(process.cwd(), 'dev.db')

export default defineConfig({
  schema: 'src/core/prisma/schema.prisma',
  datasource: {
    url: `file:${defaultDbPath}`,
  },
})
