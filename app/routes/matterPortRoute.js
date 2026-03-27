const {
  createMattertag,
  getModelInfo,
  updateMattertag,
  deleteMattertag,
  synhronizeModels,
} = require('../resolvers/matterPortResolver');

const matterPortRoutes = async (app, supabase) => {
  app.post('/locations', async (req, res) => {
    const {
      location_name,
      description,
      color,
      x,
      y,
      z,
      enabled = true,
      floorId,
      spaceId,
    } = req.body;

    // Try to create a permanent Matterport tag (best-effort — does not block Supabase insert)
    let matterport_tag_id = null;
    try {
      const mpResult = await createMattertag({ location_name, x, y, z, description, color, enabled, floorId });
      if (mpResult?.data?.addMattertag?.id) {
        matterport_tag_id = mpResult.data.addMattertag.id;
      }
    } catch {
      // Matterport API unavailable — proceed without permanent tag
    }

    // Always save to Supabase (authoritative data store)
    const locationInfo = { location_name, description, color, x, y, z, matterport_tag_id, space_id: spaceId ?? null };
    const { data, error } = await supabase.from('locations').insert(locationInfo).select('*');

    if (error) {
      return res.status(500).json({ data: null, error: error.message });
    }
    res.json({ data, error: null });
  });

  app.put('/locations', async (req, res) => {
    const {
      mattertag_id,
      location_name,
      x,
      y,
      z,
      description,
      color,
      enabled,
      floorId,
    } = req.body;

    if (!mattertag_id)
      res
        .status(500)
        .json({ success: false, error: `Matter tag ID can't be empty` });

    try {
      const updatedTag = await updateMattertag({
        mattertagId: mattertag_id,
        location_name,
        x,
        y,
        z,
        description,
        color,
        enabled,
        floorId,
      });

      res.json({ success: true, data: updatedTag });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/matter-model', async (req, res) => {
    const model = await getModelInfo();
    res.json({ model });
  });

  app.get('/synhronize-model', async (req, res) => {
    const result = await synhronizeModels(supabase);
    res.json({ result });
  });

  app.get('/locations', async (req, res) => {
    const { data: locations, error: locationsError } = await supabase
      .from('locations')
      .select('*');

    if (locationsError || !locations) {
      return res.status(404).json({ error: 'Locations not found' });
    }

    const locationsWithDetails = await Promise.all(
      locations.map(async (location) => {
        const { data: tasks, error: taskError } = await supabase
          .from('tasks')
          .select('*')
          .eq('location_id', location.location_id);

        const { data: floorData } = await supabase
          .from('floors')
          .select('name')
          .eq('floor_id', location.floor_id)
          .single();

        const { data: roomData } = await supabase
          .from('rooms')
          .select('name')
          .eq('room_id', location.room_id)
          .single();

        return {
          ...location,
          floor_name: floorData?.name || null,
          room_name: roomData?.name || null,
          tasks: tasks || [],
          taskError: taskError?.message || null,
        };
      }),
    );

    res.json(locationsWithDetails);
  });

  app.get('/locations/:id', async (req, res) => {
    const { id } = req.params;

    const { data: location, error: locationsError } = await supabase
      .from('locations')
      .select('*')
      .eq('location_id', id)
      .single();

    if (locationsError || !location) {
      return res.status(404).json({ error: 'Location not found' });
    }

    const { data: tasks, error: taskLocationsError } = await supabase
      .from('tasks')
      .select('*')
      .eq('location_id', id);

    const { data: floorData } = await supabase
      .from('floors')
      .select('name')
      .eq('floor_id', location.floor_id)
      .single();

    const { data: roomData } = await supabase
      .from('rooms')
      .select('name')
      .eq('room_id', location.room_id)
      .single();

    const locationWithDetails = {
      ...location,
      floor_name: floorData?.name || null,
      room_name: roomData?.name || null,
      tasks: tasks || [],
      taskError: taskLocationsError?.message || null,
    };

    res.json(locationWithDetails);
  });

  app.delete('/locations/:id', async (req, res) => {
    const { id } = req.params;

    const { data: location, error: selectError } = await supabase
      .from('locations')
      .select('matterport_tag_id')
      .eq('location_id', id)
      .single();

    if (selectError || !location) {
      return res.status(404).json({ error: 'Location not found' });
    }

    if (location.matterport_tag_id) {
      await deleteMattertag(location.matterport_id);
    }

    const { error: deleteError } = await supabase
      .from('locations')
      .delete()
      .eq('location_id', id);

    if (deleteError) {
      return res.status(500).json({ error: deleteError.message });
    }

    const { data: locations, error } = await supabase
      .from('locations')
      .select('*');

    res.json({ locations, error });
  });
};

module.exports = { matterPortRoutes };
