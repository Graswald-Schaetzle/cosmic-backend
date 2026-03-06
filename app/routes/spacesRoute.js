const spaceRoutes = async (app, supabase) => {
  app.get('/spaces', async (req, res) => {
    const { data: spaces, error: spaceError } = await supabase
      .from('spaces')
      .select('*');

    if (spaceError) {
      return res.status(500).json({ error: spaceError.message });
    }

    const { data: allRooms, error: roomsError } = await supabase
      .from('space_rooms')
      .select('*, room:rooms(*)');

    const { data: allLocations, error: locationsError } = await supabase
      .from('space_locations')
      .select('*, location:locations(*)');

    const result = spaces.map((space) => ({
      ...space,
      rooms: allRooms.filter((r) => r.space_id === space.space_id),
      locations: allLocations.filter((t) => t.space_id === space.space_id),
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

    const { data: rooms, error: roomsError } = await supabase
      .from('space_rooms')
      .select('*, room:rooms(*)')
      .eq('space_id', id);

    const { data: locations, error: locationsError } = await supabase
      .from('space_locations')
      .select('*, location:location(*)');

    res.json({
      space,
      rooms,
      locations,
      errors: {
        rooms: roomsError?.message || null,
        tags: locationsError?.message || null,
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
