#!/usr/bin/env node
/**
 * Adds (or replaces) the minimap image of an existing reconstruction job, e.g. of a space that
 * was imported before minimaps existed.
 *
 * Usage:
 *   node scripts/set-minimap.js --job 13 --minimap ./minimap.png \\
 *     --minimap-frame ./minimap-frame.json [--storage supabase] [--dry-run]
 *
 * --minimap-frame is a JSON file (or the JSON itself) with the image's top-left corner `origin`
 * and the vectors `u` (along the width) and `v` (along the height), in the source coordinates of
 * the job's splat. See docs/minimap.md. --storage and the environment work as in
 * scripts/import-splat-space.js.
 */
require('dotenv').config({ quiet: true });
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { Storage } = require('@google-cloud/storage');
const { readMinimapFrame } = require('./minimapArgs');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) args[key] = true;
    else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const jobId = Number(args.job);
  const bucketName = process.env.GCS_3D_PIPELINE_BUCKET || 'cosmic-3d-pipeline';

  if (!Number.isInteger(jobId) || !args.minimap || !args['minimap-frame']) {
    fail(
      '--job, --minimap and --minimap-frame are required (see header of this script).',
    );
  }
  if (!fs.existsSync(args.minimap))
    fail(`Minimap image not found: ${args.minimap}`);
  const frame = readMinimapFrame(args['minimap-frame'], fail);
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    fail('SUPABASE_URL and SUPABASE_KEY must be set.');
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY,
  );
  const { data: job, error } = await supabase
    .from('reconstruction_jobs')
    .select('job_id, space_id, title')
    .eq('job_id', jobId)
    .single();
  if (error || !job) fail(`No reconstruction job ${jobId}.`);

  console.log(
    `Minimap for job ${job.job_id} ("${job.title}", space ${job.space_id})`,
  );
  if (args['dry-run']) {
    console.log('Dry run: nothing uploaded or written.');
    return;
  }

  const storagePath = `imports/${job.space_id}/minimap.png`;
  let outputPath = storagePath;
  if (args.storage === 'supabase') {
    const { error: uploadError } = await supabase.storage
      .from('splats')
      .upload(storagePath, fs.readFileSync(args.minimap), {
        contentType: 'image/png',
        upsert: true,
      });
    if (uploadError) fail(`Upload failed: ${uploadError.message}`);
    outputPath = supabase.storage.from('splats').getPublicUrl(storagePath)
      .data.publicUrl;
  } else {
    await new Storage().bucket(bucketName).upload(args.minimap, {
      destination: storagePath,
      resumable: true,
      contentType: 'image/png',
    });
    console.log(`Uploaded gs://${bucketName}/${storagePath}`);
  }

  const { error: updateError } = await supabase
    .from('reconstruction_jobs')
    .update({ output_minimap_path: outputPath, output_minimap_frame: frame })
    .eq('job_id', job.job_id);
  if (updateError) fail(`Could not save the minimap: ${updateError.message}`);
  console.log(`Done. ${outputPath}`);
}

main().catch((error) => fail(error.message));
