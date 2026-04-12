module.exports = {
  apps: [
    {
      name: 'everysong',
      script: 'server.js',
      node_args: '--experimental-sqlite',
      cwd: '/home/ubuntu/everysong',
      env: {
        NODE_ENV: 'production',
        PORT: 3010,
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      error_file: '/home/ubuntu/everysong/logs/error.log',
      out_file: '/home/ubuntu/everysong/logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
