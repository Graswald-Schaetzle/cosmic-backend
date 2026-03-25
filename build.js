require('esbuild')
  .build({
    entryPoints: ['server.js'],
    bundle: true,
    platform: 'node',
    target: ['node22'],
    outfile: 'dist/server.js',
    external: [
      'swagger-ui-express',
      'dotenv',
      '@google-cloud/storage',
      '@google-cloud/batch',
      'multer',
      'jsonwebtoken',
      'buffer-equal-constant-time',
    ],
  })
  .catch(() => process.exit(1));
