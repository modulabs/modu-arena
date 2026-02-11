module.exports = {
  apps: [
    {
      name: 'modu-arena-web',
      script: 'node_modules/.bin/next',
      args: 'start -p 8989',
      cwd: '/home/developer/modu-arena/apps/web',
      env: {
        NODE_ENV: 'production',
        PORT: '8989',
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      error_file: '/home/developer/logs/modu-arena-error.log',
      out_file: '/home/developer/logs/modu-arena-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
