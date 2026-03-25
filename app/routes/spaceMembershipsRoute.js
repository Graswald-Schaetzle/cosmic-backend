const spaceMembershipRoutes = async (app, supabase) => {
  app.get('/spaces/:space_id/members', async (req, res) => {
    const { space_id } = req.params;

    const { data: memberships, error: membershipError } = await supabase
      .from('space_memberships')
      .select('*')
      .eq('space_id', space_id);

    if (membershipError)
      return res.status(500).json({ error: membershipError });

    const userIds = memberships.map((m) => m.user_id);

    const { data: users, error: usersError } = userIds.length
      ? await supabase
          .from('users')
          .select('user_id, username, first_name, last_name, email')
          .in('user_id', userIds)
      : { data: [], error: null };

    if (usersError) return res.status(500).json({ error: usersError });

    const members = memberships.map((m) => ({
      ...m,
      user: (users || []).find((u) => u.user_id === m.user_id) || null,
    }));

    res.json({ data: members, error: null });
  });

  app.post('/spaces/:space_id/members', async (req, res) => {
    const { space_id } = req.params;
    const { user_id, role = 'member' } = req.body;

    const { data, error } = await supabase
      .from('space_memberships')
      .insert({ space_id, user_id, role })
      .select('*')
      .single();

    if (error) return res.status(500).json({ error });

    res.json({ data, error: null });
  });

  app.put('/spaces/:space_id/members/:user_id', async (req, res) => {
    const { space_id, user_id } = req.params;
    const { role } = req.body;

    const { data, error } = await supabase
      .from('space_memberships')
      .update({ role })
      .eq('space_id', space_id)
      .eq('user_id', user_id)
      .select('*')
      .single();

    if (error) return res.status(500).json({ error });

    res.json({ data, error: null });
  });

  app.delete('/spaces/:space_id/members/:user_id', async (req, res) => {
    const { space_id, user_id } = req.params;

    const { data, error } = await supabase
      .from('space_memberships')
      .delete()
      .eq('space_id', space_id)
      .eq('user_id', user_id);

    res.json({ data, error });
  });
};

module.exports = {
  spaceMembershipRoutes,
};
