import path from 'path'
import { startServer } from '@huiming/core-server'
import { huimingServerPlugin } from 'huiming/plugin'
import { landlordServerPlugin } from 'landlord/plugin'
import { nimmtServerPlugin } from 'nimmt/plugin'

const PORT = Number(process.env.PORT) || 3000

startServer({
  port: PORT,
  plugins: [huimingServerPlugin, landlordServerPlugin, nimmtServerPlugin],
  staticPath: path.join(__dirname, '../public'),
}).then(() => {
  console.log('Server started successfully')
}).catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
