const eventRoutes = async (app, supabase) => {
  app.post('/events', async (req, res) => {
    const { task_ids = [], ...eventFields } = req.body;

    const { data: event, error: eventError } = await supabase
      .from('events')
      .insert(eventFields)
      .select('*')
      .single();

    if (eventError) return res.status(500).json({ error: eventError });

    if (task_ids.length > 0) {
      const eventTaskInserts = task_ids.map((task_id) => ({
        event_id: event.event_id,
        task_id,
      }));

      const { error: linkError } = await supabase
        .from('event_tasks')
        .insert(eventTaskInserts);

      if (linkError) return res.status(500).json({ error: linkError });
    }

    res.json({ data: event, error: null });
  });

  app.get('/events', async (req, res) => {
    const { space_id, floor_id, room_id, asset_id } = req.query;

    let query = supabase
      .from('events')
      .select('*')
      .order('starts_at', { ascending: true });

    if (space_id) query = query.eq('space_id', space_id);
    if (floor_id) query = query.eq('floor_id', floor_id);
    if (room_id) query = query.eq('room_id', room_id);
    if (asset_id) query = query.eq('asset_id', asset_id);

    const { data, error } = await query;
    res.json({ data, error });
  });

  app.get('/events/:id', async (req, res) => {
    const { id } = req.params;

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('event_id', id)
      .single();

    if (eventError || !event)
      return res.status(404).json({ error: 'Event not found' });

    const { data: eventTasks } = await supabase
      .from('event_tasks')
      .select('task_id')
      .eq('event_id', id);

    const taskIds = (eventTasks || []).map((et) => et.task_id);

    const { data: tasks } = taskIds.length
      ? await supabase.from('tasks').select('*').in('task_id', taskIds)
      : { data: [] };

    res.json({ data: { ...event, tasks: tasks || [] }, error: null });
  });

  app.put('/events/:id', async (req, res) => {
    const { task_ids, ...eventFields } = req.body;

    const { data, error } = await supabase
      .from('events')
      .update(eventFields)
      .eq('event_id', req.params.id)
      .select('*');

    if (error) return res.status(500).json({ error });

    if (Array.isArray(task_ids)) {
      await supabase
        .from('event_tasks')
        .delete()
        .eq('event_id', req.params.id);

      if (task_ids.length > 0) {
        const eventTaskInserts = task_ids.map((task_id) => ({
          event_id: req.params.id,
          task_id,
        }));

        const { error: linkError } = await supabase
          .from('event_tasks')
          .insert(eventTaskInserts);

        if (linkError) return res.status(500).json({ error: linkError });
      }
    }

    res.json({ data, error: null });
  });

  app.delete('/events/:id', async (req, res) => {
    await supabase.from('event_tasks').delete().eq('event_id', req.params.id);

    const { data, error } = await supabase
      .from('events')
      .delete()
      .eq('event_id', req.params.id);

    res.json({ data, error });
  });
};

module.exports = {
  eventRoutes,
};
