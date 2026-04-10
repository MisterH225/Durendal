module.exports = {
  apps: [
    {
      name: 'durendal',
      script: 'node_modules/.bin/next',
      args: 'start',
      cwd: '/var/www/durendal',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
    {
      name: 'forecast-worker',
      script: 'node_modules/.bin/tsx',
      args: 'apps/worker/src/bootstrap.ts',
      cwd: '/var/www/durendal',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      // Restart delay to avoid spin-loop on crash
      restart_delay: 5000,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
