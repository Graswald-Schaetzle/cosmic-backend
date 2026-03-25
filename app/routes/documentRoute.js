const multer = require('multer');
const fs = require('fs');
const { tokenValidator } = require('../utils');
const upload = multer({ dest: 'uploads/' });

const documentRoutes = async (app, supabase) => {
  app.post(
    '/document',
    tokenValidator('jwt'),
    upload.single('file'),
    async (req, res) => {
      const documentData = req.body;

      const file = req.file;
      const { user_id } = req;
      if (!file) return res.status(400).json({ error: 'No file uploaded' });

      const fileBuffer = fs.readFileSync(file.path);
      const uploadResult = await supabase.storage
        .from('documents')
        .upload(`documents/${file.originalname}`, fileBuffer, {
          contentType: file.mimetype,
          upsert: true,
        });

      fs.unlinkSync(file.path);

      if (uploadResult.error)
        return res.status(500).json({ error: uploadResult.error.message });

      const filePath = uploadResult.data.path;
      documentData.uploaded_by_user_id = user_id;
      documentData.storage_path = filePath;
      documentData.mime_type = file.mimetype;

      const insertResult = await supabase
        .from('documents')
        .insert(documentData)
        .select('*');

      res.json({
        data: insertResult.data,
        error: insertResult.error,
      });
    },
  );

  app.get('/document/:id', tokenValidator('jwt'), async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('document_id', id)
      .single();

    if (error || !data)
      return res.status(404).json({ error: 'Document not found' });

    const storagePath = data.storage_path || data.file_url;
    const { data: fileData, error: fileError } = await supabase.storage
      .from('documents')
      .createSignedUrl(storagePath, 60 * 60);

    if (fileError) return res.status(500).json({ error: fileError.message });

    res.json({
      data: {
        ...data,
        file_signed_url: fileData.signedUrl,
      },
      error: null,
    });
  });

  app.get('/document/task/:task_id', async (req, res) => {
    const { task_id } = req.params;
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('task_id', task_id);

    if (error || !data || data.length === 0)
      return res.status(404).json({ error: 'Documents not found' });

    const documentsWithUrls = await Promise.all(
      data.map(async (doc) => {
        const storagePath = doc.storage_path || doc.file_url;
        if (storagePath) {
          const { data: fileData, error: fileError } = await supabase.storage
            .from('documents')
            .createSignedUrl(storagePath, 60 * 60);
          if (fileError) {
            return {
              ...doc,
              file_signed_url: null,
              fileError: fileError.message,
            };
          }
          return { ...doc, file_signed_url: fileData.signedUrl };
        }
        return { ...doc, file_signed_url: null };
      }),
    );

    res.json({ data: documentsWithUrls, error: null });
  });

  app.get('/documents', tokenValidator('jwt'), async ({ user_id }, res) => {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('uploaded_by_user_id', user_id);

    res.json({ data, error });
  });

  app.get('/all_documents', async (req, res) => {
    const { floor_id, room_id, location_id, space_id } = req.query;

    let query = supabase.from('documents').select('*');

    if (space_id) query = query.eq('space_id', space_id);
    if (floor_id) query = query.eq('floor_id', floor_id);
    if (room_id) query = query.eq('room_id', room_id);
    if (location_id) query = query.eq('location_id', location_id);

    const { data: documents, error: documentsError } = await query;

    if (documentsError) {
      return res.status(500).json({ error: documentsError });
    }

    const roomIds = [
      ...new Set(documents.map((d) => d.room_id).filter(Boolean)),
    ];

    const { data: rooms, error: roomsError } = roomIds.length
      ? await supabase
          .from('rooms')
          .select('room_id, name, floor_id')
          .in('room_id', roomIds)
      : { data: [], error: null };

    if (roomsError) {
      return res.status(500).json({ error: roomsError });
    }

    const floorIds = [
      ...new Set((rooms || []).map((r) => r.floor_id).filter(Boolean)),
    ];

    const { data: floors, error: floorsError } = floorIds.length
      ? await supabase
          .from('floors')
          .select('floor_id, name')
          .in('floor_id', floorIds)
      : { data: [], error: null };

    if (floorsError) {
      return res.status(500).json({ error: floorsError });
    }

    const floorsWithRooms = (floors || []).map((floor) => {
      const roomsOnFloor = (rooms || [])
        .filter((r) => r.floor_id === floor.floor_id)
        .map((room) => {
          const docsForRoom = documents.filter(
            (d) => d.room_id === room.room_id,
          );
          return {
            room_id: room.room_id,
            room_name: room.name,
            documents: docsForRoom,
            documents_count: docsForRoom.length,
          };
        })
        .filter((room) => room.documents_count > 0);

      return {
        floor_id: floor.floor_id,
        floor_name: floor.name,
        documents_count: roomsOnFloor.reduce(
          (acc, r) => acc + r.documents_count,
          0,
        ),
        rooms: roomsOnFloor,
      };
    });

    res.json({
      total_documents: documents.length,
      floors: floorsWithRooms,
    });
  });

  app.put('/document/:id', upload.single('file'), async (req, res) => {
    const documentData = req.body;

    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const { data: oldDoc, error: fetchError } = await supabase
      .from('documents')
      .select('storage_path, file_url')
      .eq('document_id', req.params.id)
      .single();

    if (fetchError)
      return res.status(404).json({ error: 'Document not found' });

    const oldPath = oldDoc?.storage_path || oldDoc?.file_url;
    if (oldPath) {
      await supabase.storage.from('documents').remove([oldPath]);
    }

    const fileBuffer = fs.readFileSync(file.path);
    const uploadResult = await supabase.storage
      .from('documents')
      .upload(`documents/${file.originalname}`, fileBuffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    fs.unlinkSync(file.path);

    if (uploadResult.error)
      return res.status(500).json({ error: uploadResult.error.message });

    const filePath = uploadResult.data.path;
    documentData.storage_path = filePath;
    documentData.mime_type = file.mimetype;

    const updateResult = await supabase
      .from('documents')
      .update(documentData)
      .eq('document_id', req.params.id)
      .select('*');

    res.json({
      data: updateResult.data,
      error: updateResult.error,
    });
  });

  app.delete('/document/:id', tokenValidator('jwt'), async (req, res) => {
    const { data: docData, error: fetchError } = await supabase
      .from('documents')
      .select('storage_path, file_url')
      .eq('document_id', req.params.id)
      .single();

    if (fetchError || !docData) {
      return res
        .status(404)
        .json({ error: 'Document not found or error fetching document.' });
    }

    const filePath = docData.storage_path || docData.file_url;

    const { error: storageError } = await supabase.storage
      .from('documents')
      .remove([filePath]);

    if (storageError) {
      return res.status(500).json({
        error: 'Failed to delete file from storage.',
        details: storageError,
      });
    }

    const { data, error: deleteError } = await supabase
      .from('documents')
      .delete()
      .eq('document_id', req.params.id);

    res.json({ data, error: deleteError });
  });
};

module.exports = {
  documentRoutes,
};
