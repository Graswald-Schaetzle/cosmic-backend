const multer = require('multer');
const fs = require('fs');
const { tokenValidator } = require('../utils');
const {
  generateSignedUploadUrl,
  generateSignedDownloadUrl,
  submitBatchJob,
  GCS_BUCKET,
} = require('../resolvers/reconstructionResolver');

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB max
  fileFilter: (req, file, cb) => {
    const allowed = [
      'video/mp4',
      'video/quicktime',
      'video/x-msvideo',
      'application/zip',
      'application/x-zip-compressed',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

const reconstructionRoutes = async (app, supabase) => {
  // Create a new reconstruction job
  app.post(
    '/reconstruction-jobs',
    tokenValidator('jwt'),
    async (req, res) => {
      try {
        const { user_id } = req;
        const { space_id, floor_id, title, input_type } = req.body;

        if (!space_id || !title) {
          return res
            .status(400)
            .json({ error: 'space_id and title are required' });
        }

        // Create job record in pending state
        const { data: job, error: insertError } = await supabase
          .from('reconstruction_jobs')
          .insert({
            space_id,
            floor_id: floor_id || null,
            created_by_user_id: user_id,
            title,
            status: 'pending',
            input_type: input_type || 'video',
            input_storage_path: '', // will be set after upload
          })
          .select('*')
          .single();

        if (insertError) {
          return res.status(500).json({ error: insertError.message });
        }

        // Generate signed upload URL
        const ext = input_type === 'images' ? 'zip' : 'mp4';
        const filename = `input.${ext}`;
        const { url: uploadUrl, gcsPath } = await generateSignedUploadUrl(
          job.job_id,
          filename,
        );

        // Update the job with the storage path
        await supabase
          .from('reconstruction_jobs')
          .update({
            input_storage_path: gcsPath,
            status: 'uploading',
            updated_at: new Date().toISOString(),
          })
          .eq('job_id', job.job_id);

        res.json({
          data: {
            ...job,
            input_storage_path: gcsPath,
            status: 'uploading',
            upload_url: uploadUrl,
          },
          error: null,
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // Confirm upload complete and start processing
  app.post(
    '/reconstruction-jobs/:id/start',
    tokenValidator('jwt'),
    async (req, res) => {
      try {
        const { id } = req.params;

        const { data: job, error: fetchError } = await supabase
          .from('reconstruction_jobs')
          .select('*')
          .eq('job_id', id)
          .single();

        if (fetchError || !job) {
          return res.status(404).json({ error: 'Job not found' });
        }

        if (job.status !== 'uploading' && job.status !== 'pending') {
          return res
            .status(400)
            .json({ error: `Cannot start job in status: ${job.status}` });
        }

        // Submit RunPod job
        const { runpodJobId } = await submitBatchJob(
          job.job_id,
          job.input_storage_path,
          process.env.SUPABASE_URL,
          process.env.SUPABASE_KEY,
        );

        // Update job status
        // NOTE: DB column may need a migration to rename gcp_batch_job_id → runpod_job_id
        const { data: updated, error: updateError } = await supabase
          .from('reconstruction_jobs')
          .update({
            status: 'queued',
            runpod_job_id: runpodJobId,
            updated_at: new Date().toISOString(),
          })
          .eq('job_id', id)
          .select('*')
          .single();

        if (updateError) {
          return res.status(500).json({ error: updateError.message });
        }

        res.json({ data: updated, error: null });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // Get job status
  app.get(
    '/reconstruction-jobs/:id',
    tokenValidator('jwt'),
    async (req, res) => {
      const { id } = req.params;
      const { data, error } = await supabase
        .from('reconstruction_jobs')
        .select('*')
        .eq('job_id', id)
        .single();

      if (error || !data) {
        return res.status(404).json({ error: 'Job not found' });
      }

      res.json({ data, error: null });
    },
  );

  // List jobs for a space
  app.get(
    '/reconstruction-jobs',
    tokenValidator('jwt'),
    async (req, res) => {
      const { space_id } = req.query;

      let query = supabase
        .from('reconstruction_jobs')
        .select('*')
        .order('created_at', { ascending: false });

      if (space_id) {
        query = query.eq('space_id', space_id);
      }

      const { data, error } = await query;
      res.json({ data, error });
    },
  );

  // Get output download URLs
  app.get(
    '/reconstruction-jobs/:id/output',
    tokenValidator('jwt'),
    async (req, res) => {
      try {
        const { id } = req.params;
        const { data: job, error } = await supabase
          .from('reconstruction_jobs')
          .select('*')
          .eq('job_id', id)
          .single();

        if (error || !job) {
          return res.status(404).json({ error: 'Job not found' });
        }

        if (job.status !== 'completed') {
          return res
            .status(400)
            .json({ error: 'Job is not yet completed' });
        }

        const urls = {};

        if (job.output_ply_path) {
          urls.ply_url = await generateSignedDownloadUrl(job.output_ply_path);
        }
        if (job.output_splat_path) {
          urls.splat_url = await generateSignedDownloadUrl(
            job.output_splat_path,
          );
        }
        if (job.output_spz_path) {
          urls.spz_url = await generateSignedDownloadUrl(job.output_spz_path);
        }

        res.json({ data: { job_id: job.job_id, ...urls }, error: null });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // Worker callback endpoint (called by the GPU worker when done)
  app.post('/reconstruction-jobs/:id/callback', async (req, res) => {
    try {
      const { id } = req.params;
      const {
        status,
        error_message,
        output_ply_path,
        output_splat_path,
        output_spz_path,
        colmap_sparse_path,
        input_frame_count,
        colmap_point_count,
        point_count,
      } = req.body;

      // Validate callback secret (simple shared secret for now)
      const callbackSecret = req.headers['x-callback-secret'];
      if (
        process.env.CALLBACK_SECRET &&
        callbackSecret !== process.env.CALLBACK_SECRET
      ) {
        return res.status(401).json({ error: 'Invalid callback secret' });
      }

      const updateData = {
        updated_at: new Date().toISOString(),
      };

      if (status) updateData.status = status;
      if (error_message) updateData.error_message = error_message;
      if (output_ply_path) updateData.output_ply_path = output_ply_path;
      if (output_splat_path) updateData.output_splat_path = output_splat_path;
      if (output_spz_path) updateData.output_spz_path = output_spz_path;
      if (colmap_sparse_path)
        updateData.colmap_sparse_path = colmap_sparse_path;
      if (input_frame_count) updateData.input_frame_count = input_frame_count;
      if (colmap_point_count)
        updateData.colmap_point_count = colmap_point_count;
      if (point_count) updateData.point_count = point_count;

      if (status === 'completed') {
        updateData.worker_finished_at = new Date().toISOString();
      }
      if (status === 'failed') {
        updateData.worker_finished_at = new Date().toISOString();
      }
      if (
        status === 'extracting_frames' ||
        status === 'running_colmap' ||
        status === 'training_splat'
      ) {
        // Set worker_started_at on first processing status
        const { data: job } = await supabase
          .from('reconstruction_jobs')
          .select('worker_started_at')
          .eq('job_id', id)
          .single();

        if (job && !job.worker_started_at) {
          updateData.worker_started_at = new Date().toISOString();
        }
      }

      const { data, error } = await supabase
        .from('reconstruction_jobs')
        .update(updateData)
        .eq('job_id', id)
        .select('*')
        .single();

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      // If completed, optionally link to floor
      if (status === 'completed' && data.floor_id) {
        await supabase
          .from('floors')
          .update({ active_reconstruction_job_id: data.job_id })
          .eq('floor_id', data.floor_id);
      }

      res.json({ data, error: null });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Cancel a job
  app.delete(
    '/reconstruction-jobs/:id',
    tokenValidator('jwt'),
    async (req, res) => {
      try {
        const { id } = req.params;

        const { data: job, error: fetchError } = await supabase
          .from('reconstruction_jobs')
          .select('*')
          .eq('job_id', id)
          .single();

        if (fetchError || !job) {
          return res.status(404).json({ error: 'Job not found' });
        }

        const terminalStates = ['completed', 'failed', 'cancelled'];
        if (terminalStates.includes(job.status)) {
          return res
            .status(400)
            .json({ error: `Job is already in terminal state: ${job.status}` });
        }

        // TODO: Cancel RunPod job if running
        // await axios.post(`https://api.runpod.io/v2/${RUNPOD_ENDPOINT_ID}/cancel/${job.runpod_job_id}`, ...);

        const { data, error } = await supabase
          .from('reconstruction_jobs')
          .update({
            status: 'cancelled',
            updated_at: new Date().toISOString(),
          })
          .eq('job_id', id)
          .select('*')
          .single();

        res.json({ data, error });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },
  );
};

module.exports = {
  reconstructionRoutes,
};
