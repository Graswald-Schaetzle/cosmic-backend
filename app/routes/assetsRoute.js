const assetRoutes = async (app, supabase) => {
  app.post('/assets', async (req, res) => {
    const { data, error } = await supabase
      .from('assets')
      .insert(req.body)
      .select('*');

    res.json({ data, error });
  });

  app.get('/assets', async (req, res) => {
    const { space_id, floor_id, room_id, location_id } = req.query;

    let query = supabase.from('assets').select('*');

    if (space_id) query = query.eq('space_id', space_id);
    if (floor_id) query = query.eq('floor_id', floor_id);
    if (room_id) query = query.eq('room_id', room_id);
    if (location_id) query = query.eq('location_id', location_id);

    const { data, error } = await query;
    res.json({ data, error });
  });

  app.get('/assets/:id', async (req, res) => {
    const { data, error } = await supabase
      .from('assets')
      .select('*')
      .eq('asset_id', req.params.id)
      .single();

    if (error || !data)
      return res.status(404).json({ error: 'Asset not found' });

    res.json({ data, error: null });
  });

  app.put('/assets/:id', async (req, res) => {
    const { data, error } = await supabase
      .from('assets')
      .update(req.body)
      .eq('asset_id', req.params.id)
      .select('*');

    res.json({ data, error });
  });

  app.delete('/assets/:id', async (req, res) => {
    const { data, error } = await supabase
      .from('assets')
      .delete()
      .eq('asset_id', req.params.id);

    res.json({ data, error });
  });
};

module.exports = {
  assetRoutes,
};
