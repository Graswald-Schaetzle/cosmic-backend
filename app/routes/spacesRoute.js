const spaceRoutes = async (app, supabase) => {
  app.get('/spaces', async (req, res) => {
    const { data: spaces, error: spaceError } = await supabase
      .from('spaces')
      .select('*');

    if (spaceError) {
      return res.status(500).json({ error: spaceError.message });
    }

    const spaceIds = spaces.map((s) => s.space_id);

    const [
      { data: rooms, error: roomsError },
      { data: locations, error: locationsError },
    ] = await Promise.all([
      spaceIds.length
        ? supabase.from('rooms').select('*').in('space_id', spaceIds)
        : { data: [], error: null },
      spaceIds.length
        ? supabase.from('locations').select('*').in('space_id', spaceIds)
        : { data: [], error: null },
    ]);

    const result = spaces.map((space) => ({
      ...space,
      rooms: (rooms || []).filter((r) => r.space_id === space.space_id),
      locations: (locations || []).filter((l) => l.space_id === space.space_id),
    }));

    res.json({
      data: result,
      errors: {
        rooms: roomsError?.message || null,
        locations: locationsError?.message || null,
      },
    });
  });

  app.get('/spaces/:id', async (req, res) => {
    const { id } = req.params;
    const { data: space, error: spaceError } = await supabase
      .from('spaces')
      .select('*')
      .eq('space_id', id)
      .single();

    if (spaceError || !space) {
      return res.status(404).json({ error: 'Space not found' });
    }

    const [
      { data: rooms, error: roomsError },
      { data: locations, error: locationsError },
    ] = await Promise.all([
      supabase.from('rooms').select('*').eq('space_id', id),
      supabase.from('locations').select('*').eq('space_id', id),
    ]);

    res.json({
      space,
      rooms: rooms || [],
      locations: locations || [],
      errors: {
        rooms: roomsError?.message || null,
        locations: locationsError?.message || null,
      },
    });
  });

  app.put('/spaces/:id', async (req, res) => {
    const { data, error } = await supabase
      .from('spaces')
      .update(req.body)
      .eq('space_id', req.params.id)
      .select('*');
    res.json({ data, error });
  });

  app.delete('/spaces/:id', async (req, res) => {
    const { data, error } = await supabase
      .from('spaces')
      .delete()
      .eq('space_id', req.params.id);
    res.json({ data, error });
  });
};

module.exports = {
  spaceRoutes,
};
