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
      tag_type = 'object',
      responsible_user_id = null,
      normal,
      anchor_type = 'free',
      anchor_object_id = null,
    } = req.body;

    if (!['free', 'surface', 'object'].includes(anchor_type)) {
      return res.status(400).json({ data: null, error: 'Invalid anchor_type' });
    }
    // The surface normal is optional, but all three components must come together.
    const hasNormal =
      Array.isArray(normal) &&
      normal.length === 3 &&
      normal.every((n) => typeof n === 'number' && Number.isFinite(n));
    if (normal !== undefined && normal !== null && !hasNormal) {
      return res.status(400).json({ data: null, error: 'normal must be three numbers' });
    }

    // Resolve space_id: use provided value or fall back to the first available space
    let resolvedSpaceId = spaceId ?? null;
    if (!resolvedSpaceId) {
      const { data: defaultSpace } = await supabase
        .from('spaces')
        .select('space_id')
        .order('space_id', { ascending: true })
        .limit(1)
        .single();
      resolvedSpaceId = defaultSpace?.space_id ?? null;
    }

    // Only spaces that are shown in Matterport get a permanent Matterport tag. Spaces shown as a
    // splat scene use their own coordinate system, so a tag there would land in the wrong model.
    let spaceHasMatterport = false;
    let frameVersion = null;
    if (resolvedSpaceId) {
      const { data: space } = await supabase
        .from('spaces')
        .select('matterport_model_id, space_frame')
        .eq('space_id', resolvedSpaceId)
        .single();
      spaceHasMatterport = Boolean(space?.matterport_model_id);
      // Tags are stored in the space frame; remember which calibration they were placed under.
      frameVersion = space?.space_frame?.version ?? null;
    }

    // Try to create a permanent Matterport tag (best-effort — does not block Supabase insert)
    let matterport_tag_id = null;
    if (spaceHasMatterport) {
      try {
        const mpResult = await createMattertag({ location_name, x, y, z, description, color, enabled, floorId });
        if (mpResult?.data?.addMattertag?.id) {
          matterport_tag_id = mpResult.data.addMattertag.id;
        }
      } catch {
        // Matterport API unavailable — proceed without permanent tag
      }
    }

    // Always save to Supabase (authoritative data store)
    const locationInfo = {
      location_name, description, color, x, y, z, matterport_tag_id,
      space_id: resolvedSpaceId, tag_type, responsible_user_id,
      anchor_type, anchor_object_id, frame_version: frameVersion,
      ...(hasNormal && { normal_x: normal[0], normal_y: normal[1], normal_z: normal[2] }),
    };
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
    const { space_id } = req.query;
    let query = supabase.from('locations').select('*');
    if (space_id) query = query.eq('space_id', space_id);
    const { data: locations, error: locationsError } = await query;

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

        let responsible_user = null;
        if (location.responsible_user_id) {
          const { data: userData } = await supabase
            .from('users')
            .select('first_name, last_name, email')
            .eq('user_id', location.responsible_user_id)
            .single();
          responsible_user = userData || null;
        }

        return {
          ...location,
          floor_name: floorData?.name || null,
          room_name: roomData?.name || null,
          tasks: tasks || [],
          taskError: taskError?.message || null,
          responsible_user,
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

    let responsible_user = null;
    if (location.responsible_user_id) {
      const { data: userData } = await supabase
        .from('users')
        .select('first_name, last_name, email')
        .eq('user_id', location.responsible_user_id)
        .single();
      responsible_user = userData || null;
    }

    const locationWithDetails = {
      ...location,
      floor_name: floorData?.name || null,
      room_name: roomData?.name || null,
      tasks: tasks || [],
      taskError: taskLocationsError?.message || null,
      responsible_user,
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
