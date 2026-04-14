const path = require('path')
const fs = require('fs')
const dotenv = require('dotenv')

/**
 * Charge les secrets depuis la racine du déploiement (ex. /var/www/durendal).
 * .env.local surcharge .env (comme Next en local).
 * Après modification d’un fichier env : `pm2 reload ecosystem.config.js --update-env`
 * ou `pm2 delete …` puis `pm2 start ecosystem.config.js`.
 */
const root = __dirname
const envFile = path.join(root, '.env')
const envLocalFile = path.join(root, '.env.local')
if (fs.existsSync(envFile)) {
  dotenv.config({ path: envFile })
}
if (fs.existsSync(envLocalFile)) {
  dotenv.config({ path: envLocalFile, override: true })
}

function appEnv(overrides) {
  return { ...process.env, ...overrides }
}

/** Répertoire de l’app (là où se trouve ecosystem.config.js, package.json, .next). */
const appRoot = __dirname
const nextBin = path.join(appRoot, 'node_modules/next/dist/bin/next')
const tsxBin = path.join(appRoot, 'node_modules/tsx/dist/cli.mjs')

module.exports = {
  apps: [
    {
      name: 'durendal',
      // Évite le wrapper shell `.bin/next` sous PM2 (502 si le process n’écoute pas vraiment).
      interpreter: 'node',
      script: nextBin,
      // Écoute sur toutes les interfaces (évite 502 si Nginx n’utilise pas 127.0.0.1).
      args: 'start -H 0.0.0.0',
      cwd: appRoot,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: appEnv({
        NODE_ENV: 'production',
        PORT: process.env.PORT || '3000',
      }),
    },
    {
      name: 'forecast-worker',
      interpreter: 'node',
      script: tsxBin,
      args: 'apps/worker/src/bootstrap.ts',
      cwd: appRoot,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      restart_delay: 5000,
      max_restarts: 50,
      env: appEnv({
        NODE_ENV: 'production',
      }),
    },
  ],
}
