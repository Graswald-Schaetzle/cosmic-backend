require('esbuild')
  .build({
    entryPoints: ['server.js'],
    bundle: true,
    platform: 'node',
    target: ['node23'],
    outfile: 'dist/server.js',
    external: ['swagger-ui-express', 'dotenv'],
  })
  .catch(() => process.exit(1));
