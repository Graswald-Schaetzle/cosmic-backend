#!/usr/bin/env node
/**
 * Imports an existing Gaussian splat (e.g. an .spz exported from SpAItial / World Labs)
 * as a new Space, so it shows up under "My Spaces" and opens in the splat viewer.
 *
 * It uploads the file to the 3D pipeline bucket and creates
 *   - a row in `spaces`
 *   - a completed row in `reconstruction_jobs` pointing at the uploaded file
 * which is exactly what GET /spaces and GET /reconstruction-jobs/:id/output expect.
 *
 * Usage:
 *   node scripts/import-splat-space.js \
 *     --file ./splat.spz --name "Rustic modern home" --owner-email you@example.com \
 *     [--collision ./collision.glb] [--description "..."] [--activate] [--dry-run]
 *
 * With --collision the space frame is calibrated automatically from the collision mesh (floor
 * level and tilt, upside-down splat, origin on the floor; see app/autoFrame.js). The space then
 * needs no manual calibration. Without it, or when no floor is found, the space stays uncalibrated.
 *
 * Storage (--storage):
 *   gcs       (default) uploads to the 3D pipeline bucket; needs Google application default
 *             credentials with write access (gcloud auth application-default login).
 *   supabase  uploads to the public Supabase bucket "splats" and stores the public URL;
 *             no Google account needed.
 *
 * Environment (same as the backend): SUPABASE_URL, SUPABASE_KEY (service key) and, for
 * --storage gcs, GCS_3D_PIPELINE_BUCKET (default cosmic-3d-pipeline).
 */
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { Storage } = require('@google-cloud/storage');
const { readGlbMesh, estimatePlacement } = require('../app/autoFrame');
const { buildFrame } = require('../app/spaceFrame');

const SPLAT_EXTENSIONS = {
  '.spz': 'output_spz_path',
  '.splat': 'output_splat_path',
  '.ply': 'output_ply_path',
};

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

/** The calibrated space frame for a collision mesh, or null (with a warning) if it has no floor. */
function autoFrame(collisionFile) {
  try {
    const { placement, diagnostics } = estimatePlacement(
      readGlbMesh(fs.readFileSync(collisionFile)),
    );
    console.log(
      `Auto-calibrated: floor ${diagnostics.floorAreaM2} m2, tilt ${diagnostics.tiltDeg} deg, ` +
        `ceiling height ${diagnostics.ceilingHeightM ?? 'not found'} m`,
    );
    const height = diagnostics.ceilingHeightM;
    if (height === null || height < 2 || height > 5) {
      console.warn(
        'Warning: the ceiling height looks odd; check scale and orientation in the viewer.',
      );
    }
    return buildFrame(1, placement);
  } catch (error) {
    console.warn(`Not auto-calibrated: ${error.message}`);
    return null;
  }
}

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { file, name, description } = args;
  const ownerEmail = args['owner-email'];
  const bucketName = process.env.GCS_3D_PIPELINE_BUCKET || 'cosmic-3d-pipeline';

  if (!file || !name || !ownerEmail) {
    fail(
      '--file, --name and --owner-email are required (see header of this script).',
    );
  }
  if (!fs.existsSync(file)) fail(`File not found: ${file}`);
  if (args.collision && !fs.existsSync(args.collision)) {
    fail(`Collision mesh not found: ${args.collision}`);
  }
  const extension = path.extname(file).toLowerCase();
  const outputColumn = SPLAT_EXTENSIONS[extension];
  if (!outputColumn)
    fail(`Unsupported file type "${extension}" (use .spz, .splat or .ply).`);
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    fail('SUPABASE_URL and SUPABASE_KEY must be set.');
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY,
  );

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('user_id, email')
    .eq('email', ownerEmail)
    .single();
  if (userError || !user) fail(`No user with e-mail ${ownerEmail}.`);

  const spaceFrame = args.collision ? autoFrame(args.collision) : null;

  const sizeMb = (fs.statSync(file).size / 1024 / 1024).toFixed(1);
  console.log(
    `Importing ${file} (${sizeMb} MB) as "${name}" for user ${user.user_id}`,
  );
  if (args['dry-run']) {
    console.log('Dry run: nothing uploaded or written.');
    return;
  }

  const { data: space, error: spaceError } = await supabase
    .from('spaces')
    .insert({
      name,
      description: description || null,
      owner_user_id: user.user_id,
      space_frame: spaceFrame,
    })
    .select('*')
    .single();
  if (spaceError) fail(`Could not create space: ${spaceError.message}`);
  console.log(`Created space ${space.space_id}`);

  try {
    // Uploads a local file and returns what is stored in the DB: a bucket-relative path for GCS
    // (signed on download) or the public URL for Supabase Storage.
    const upload = async (localFile, storagePath, contentType) => {
      if (args.storage === 'supabase') {
        const { error: uploadError } = await supabase.storage
          .from('splats')
          .upload(storagePath, fs.readFileSync(localFile), {
            contentType,
            upsert: true,
          });
        if (uploadError)
          throw new Error(`Upload failed: ${uploadError.message}`);
        const { publicUrl } = supabase.storage
          .from('splats')
          .getPublicUrl(storagePath).data;
        console.log(`Uploaded ${publicUrl}`);
        return publicUrl;
      }
      await new Storage().bucket(bucketName).upload(localFile, {
        destination: storagePath,
        resumable: true,
        contentType,
      });
      console.log(`Uploaded gs://${bucketName}/${storagePath}`);
      return storagePath;
    };

    const storagePath = `imports/${space.space_id}/splat${extension}`;
    const outputPath = await upload(
      file,
      storagePath,
      'application/octet-stream',
    );
    const collisionPath = args.collision
      ? await upload(
          args.collision,
          `imports/${space.space_id}/collision.glb`,
          'model/gltf-binary',
        )
      : null;

    const { data: job, error: jobError } = await supabase
      .from('reconstruction_jobs')
      .insert({
        space_id: space.space_id,
        created_by_user_id: user.user_id,
        title: name,
        status: 'completed',
        input_type: 'images',
        // Required column; there is no capture input for an imported splat.
        input_storage_path: storagePath,
        [outputColumn]: outputPath,
        output_collision_path: collisionPath,
      })
      .select('job_id')
      .single();
    if (jobError) throw new Error(`Could not create job: ${jobError.message}`);
    console.log(`Created completed reconstruction job ${job.job_id}`);

    if (args.activate) {
      const { error: activeError } = await supabase
        .from('users')
        .update({ active_space_id: space.space_id })
        .eq('user_id', user.user_id);
      if (activeError)
        throw new Error(`Could not activate space: ${activeError.message}`);
      console.log('Space set as active space');
    }
  } catch (error) {
    // Do not leave a space without a model behind.
    await supabase.from('spaces').delete().eq('space_id', space.space_id);
    fail(`${error.message} (space ${space.space_id} was removed again)`);
  }

  console.log(`Done. Space ${space.space_id} is now listed under "My Spaces".`);
}

main().catch((error) => fail(error.message));
