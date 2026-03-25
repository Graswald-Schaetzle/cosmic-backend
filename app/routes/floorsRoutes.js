const floorsRoutes = async (app, supabase) => {
  app.post('/floors', async (req, res) => {
    const { name, matterport_floor_id, sequence } = req.body;

    const { data, error } = await supabase
      .from('floors')
      .insert([{ name, matterport_floor_id, sequence }])
      .select('*');

    res.json({ data, error });
  });

  app.get('/floors', async (req, res) => {
    const { data, error } = await supabase
      .from('floors')
      .select('*')
      .order('sequence', { ascending: true });

    res.json({ data, error });
  });

  app.get('/rooms', async (req, res) => {
    const { data, error } = await supabase.from('rooms').select('*');

    res.json({ data, error });
  });

  app.get('/floors/:id', async (req, res) => {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('floors')
      .select('*')
      .eq('floor_id', id)
      .single();

    res.json({ data, error });
  });

  app.put('/floors/:id', async (req, res) => {
    const { id } = req.params;
    const { name, matterport_floor_id, sequence } = req.body;

    const { data, error } = await supabase
      .from('floors')
      .update({ name, matterport_floor_id, sequence })
      .eq('floor_id', id)
      .select('*');

    res.json({ data, error });
  });

  app.delete('/floors/:id', async (req, res) => {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('floors')
      .delete()
      .eq('floor_id', id);

    res.json({ data, error });
  });
};

module.exports = {
  floorsRoutes,
};
