const {
  tokenValidator,
  updateAccessToken,
  generateApiToken,
  updateJwtToken,
} = require('../utils.js');

const { API_LOGIN, API_PASS } = process.env;

const userRoutes = async (app, supabase) => {
  app.get('/csrf-token', (req, res) => {
    res.json({ csrfToken: req.csrfToken() });
  });

  app.get('/get-api-token', async (req, res) => {
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is missing' });
    }

    const [authType, encodedCredentials] = authHeader.split(' ');
    if (authType !== 'Basic' || !encodedCredentials) {
      return res.status(401).json({ error: 'Invalid authorization format' });
    }

    const credentials = Buffer.from(encodedCredentials, 'base64').toString(
      'utf-8',
    );
    const [username, password] = credentials.split(':');

    if (username !== API_LOGIN || password !== API_PASS) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const apiToken = await generateApiToken();
    return res.json({ apiToken });
  });

  app.get('/auth/users', async (req, res) => {
    const { data: users, error } = await supabase
      .from('users')
      .select('user_id, username, first_name, last_name, email');

    if (error) return res.status(400).json({ error: error.message });

    return res.json({ users });
  });

  app.get('/activity', async (req, res) => {
    const { data: activity, error } = await supabase
      .from('activity')
      .select('activity_id, name');

    if (error) return res.status(400).json({ error: error.message });

    return res.json({ activity });
  });

  app.get('/auth/user', tokenValidator('jwt'), async ({ user_id }, res) => {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (error || !user)
      return res.status(404).json({ error: 'User not found' });

    return res.json({ user });
  });

  app.post('/auth/login', async (req, res) => {
    const { supabase_id, first_name, last_name } = req.body;

    const { data: existing } = await supabase
      .from('users')
      .select('*')
      .eq('supabase_id', supabase_id)
      .single();
    if (existing && existing.user_id) {
      const { accessToken: access_token, refreshToken: refresh_token } =
        updateJwtToken(existing.user_id);

      const { data: user, error: updateTokenError } = await supabase
        .from('users')
        .update({ access_token, refresh_token })
        .eq('user_id', existing.user_id)
        .select()
        .single();

      return res.json({ user });
    }

    const newUserData = { supabase_id };
    if (first_name) newUserData.first_name = first_name;
    if (last_name) newUserData.last_name = last_name;

    const { data, error } = await supabase
      .from('users')
      .insert(newUserData)
      .select()
      .single();

    const { accessToken: access_token, refreshToken: refresh_token } =
      updateJwtToken(data.user_id);

    const { data: user, error: updateTokenError } = await supabase
      .from('users')
      .update({ access_token, refresh_token })
      .eq('user_id', data.user_id)
      .select()
      .single();

    const userMenu = [
      {
        name: 'Dashboard',
        order: 0,
        enabled: true,
        user_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      },
      {
        name: 'Notifications',
        order: 1,
        enabled: true,
        user_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      },
      {
        name: 'Calendar',
        order: 2,
        enabled: true,
        user_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      },
      {
        name: 'AI Agent',
        order: 3,
        enabled: true,
        user_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      },
      {
        name: 'Profile',
        order: 4,
        enabled: true,
        user_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      },
      {
        name: 'Documents',
        order: 0,
        enabled: false,
        user_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      },
    ];

    const menuWithUserId = userMenu.map((item) => ({
      ...item,
      user_id: data.user_id,
    }));

    const { data: menu, error: errorMenu } = await supabase
      .from('menu_items')
      .insert(menuWithUserId)
      .select('*');

    if (error) return res.status(400).json({ error: error.message });

    return res.json({ user });
  });

  app.post('/auth/refresh', async (req, res) => {
    const refreshToken = req.body.refresh_token || req.body.refreshToken;

    if (!refreshToken) {
      return res
        .status(400)
        .json({ error: 'refresh_token is required' });
    }

    try {
      const { accessToken: access_token, userId } =
        await updateAccessToken(refreshToken);

      const { data: user, error } = await supabase
        .from('users')
        .update({ access_token })
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        return res.status(400).json({ error: error.message });
      }

      return res.json({
        access_token,
        refresh_token: refreshToken,
        user,
      });
    } catch (error) {
      return res.status(401).json({
        error: typeof error === 'string' ? error : 'Invalid or expired refresh token',
      });
    }
  });
};

module.exports = {
  userRoutes,
};
