const listRoutes = async (app, supabase) => {
  async function enrichTasks(tasks) {
    if (!tasks.length) return [];

    const taskIds = tasks.map((t) => t.task_id);
    const userIds = tasks.map((t) => t.created_by_user_id).filter(Boolean);

    const [{ data: users }, { data: documents }] = await Promise.all([
      userIds.length
        ? supabase
            .from('users')
            .select('user_id, username, first_name, last_name')
            .in('user_id', userIds)
        : { data: [] },
      supabase.from('documents').select('*').in('task_id', taskIds),
    ]);

    return tasks.map((task) => ({
      ...task,
      assignee:
        (users || []).find((u) => u.user_id === task.created_by_user_id) ||
        null,
      documents: (documents || []).filter((d) => d.task_id === task.task_id),
    }));
  }

  app.post('/lists', async (req, res) => {
    const { name, space_id, description, task_ids = [] } = req.body;

    const { data: existingTasks, error: taskCheckError } = await supabase
      .from('tasks')
      .select('task_id')
      .in('task_id', task_ids);

    if (taskCheckError) {
      return res.status(500).json({ error: 'Failed to check tasks' });
    }

    const existingTaskIds = existingTasks.map((t) => t.task_id);
    const missingTasks = task_ids.filter((id) => !existingTaskIds.includes(id));

    if (missingTasks.length > 0) {
      return res.status(400).json({
        error: `Task(s) not found: ${missingTasks.join(', ')}`,
      });
    }

    const { data: list, error: listError } = await supabase
      .from('lists')
      .insert({ name, space_id, description })
      .select('*')
      .single();

    if (listError) return res.status(500).json({ error: listError });

    if (task_ids.length > 0) {
      const listTasksData = task_ids.map((task_id) => ({
        list_id: list.list_id,
        task_id,
      }));

      const { error: listTasksError } = await supabase
        .from('list_tasks')
        .insert(listTasksData);

      if (listTasksError)
        return res.status(500).json({ error: listTasksError });
    }

    const { data: listTasks } = await supabase
      .from('list_tasks')
      .select('*')
      .eq('list_id', list.list_id);

    const taskIdsInList = (listTasks || []).map((lt) => lt.task_id);

    const { data: tasks } = taskIdsInList.length
      ? await supabase.from('tasks').select('*').in('task_id', taskIdsInList)
      : { data: [] };

    const tasksWithDetails = await enrichTasks(tasks || []);

    res.json({
      list: {
        ...list,
        tasks: (listTasks || [])
          .map((lt) => tasksWithDetails.find((t) => t.task_id === lt.task_id))
          .filter(Boolean),
      },
    });
  });

  app.get('/lists', async (req, res) => {
    const { space_id } = req.query;

    let listQuery = supabase.from('lists').select('*');
    if (space_id) listQuery = listQuery.eq('space_id', space_id);

    const { data: lists, error: listsError } = await listQuery;

    if (listsError) return res.status(500).json({ error: listsError });

    const listIds = lists.map((l) => l.list_id);

    const { data: listTasks } = listIds.length
      ? await supabase.from('list_tasks').select('*').in('list_id', listIds)
      : { data: [] };

    const taskIds = (listTasks || []).map((lt) => lt.task_id);
    const { data: tasks } = taskIds.length
      ? await supabase.from('tasks').select('*').in('task_id', taskIds)
      : { data: [] };

    const tasksWithDetails = await enrichTasks(tasks || []);

    const listsWithTasks = lists.map((list) => ({
      ...list,
      tasks: (listTasks || [])
        .filter((lt) => lt.list_id === list.list_id)
        .map((lt) => tasksWithDetails.find((t) => t.task_id === lt.task_id))
        .filter(Boolean),
    }));

    res.json({ data: listsWithTasks });
  });

  app.get('/lists/:id', async (req, res) => {
    const { id } = req.params;

    const { data: list, error: listError } = await supabase
      .from('lists')
      .select('*')
      .eq('list_id', id)
      .single();

    if (listError) return res.status(404).json({ error: listError });

    const { data: listTasks } = await supabase
      .from('list_tasks')
      .select('*')
      .eq('list_id', id);

    const taskIds = (listTasks || []).map((lt) => lt.task_id);

    const { data: tasks } = taskIds.length
      ? await supabase.from('tasks').select('*').in('task_id', taskIds)
      : { data: [] };

    const tasksWithDetails = await enrichTasks(tasks || []);

    res.json({
      list: {
        ...list,
        tasks: (listTasks || [])
          .map((lt) => tasksWithDetails.find((t) => t.task_id === lt.task_id))
          .filter(Boolean),
      },
    });
  });

  app.put('/lists/:id', async (req, res) => {
    const { id } = req.params;
    const { name, space_id, description, task_ids = [] } = req.body;

    const { data: updatedList, error: updateError } = await supabase
      .from('lists')
      .update({ name, space_id, description })
      .eq('list_id', id)
      .select('*')
      .single();

    if (updateError) return res.status(500).json({ error: updateError });

    await supabase.from('list_tasks').delete().eq('list_id', id);

    if (task_ids.length > 0) {
      const listTasksData = task_ids.map((task_id) => ({
        list_id: id,
        task_id,
      }));

      const { error: insertError } = await supabase
        .from('list_tasks')
        .insert(listTasksData);

      if (insertError) return res.status(500).json({ error: insertError });
    }

    res.json({ list: updatedList });
  });

  app.delete('/lists/:id', async (req, res) => {
    const { id } = req.params;

    await supabase.from('list_tasks').delete().eq('list_id', id);
    const { data, error } = await supabase
      .from('lists')
      .delete()
      .eq('list_id', id);

    res.json({ data, error });
  });
};

module.exports = {
  listRoutes,
};
