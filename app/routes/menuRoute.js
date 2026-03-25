const { tokenValidator } = require('../utils.js');

const menuRoutes = async (app, supabase) => {
  app.post('/user-menu', tokenValidator('jwt'), async (req, res) => {
    const userMenu = req.body;
    const { user_id } = req;

    const menuWithUserId = userMenu.map((item) => ({
      ...item,
      user_id: user_id,
    }));

    const { data, error } = await supabase
      .from('menu_items')
      .insert(menuWithUserId)
      .select('*');

    res.json({ data, error });
  });

  app.get('/user-menu', tokenValidator('jwt'), async (req, res) => {
    const { user_id } = req;
    if (!user_id) return res.status(400).json({ error: 'user ID is required' });

    const { data, error } = await supabase
      .from('menu_items')
      .select('*')
      .eq('user_id', user_id);

    res.json({ data, error });
  });

  app.put('/user-menu', tokenValidator('jwt'), async (req, res) => {
    const { user_id } = req;

    if (!user_id) return res.status(400).json({ error: 'user ID is required' });

    try {
      const { error: deleteError } = await supabase
        .from('menu_items')
        .delete()
        .eq('user_id', user_id);

      if (deleteError)
        return res.status(400).json({ error: deleteError.message });

      const menuItems = req.body.map((item) => ({
        ...item,
        user_id: user_id,
      }));

      const { data, error } = await supabase
        .from('menu_items')
        .insert(menuItems)
        .select('*');

      if (error) return res.status(400).json({ error: error.message });

      res.json({ data });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/user-menu/:id', async (req, res) => {
    const { data, error } = await supabase
      .from('menu_items')
      .delete()
      .eq('menu_items_id', req.params.id);
    res.json({ data, error });
  });
};

module.exports = {
  menuRoutes,
};
