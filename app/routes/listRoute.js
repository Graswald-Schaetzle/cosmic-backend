const listRoutes = async (app, supabase) => {
  app.post('/lists', async (req, res) => {
    const { name, task_ids = [] } = req.body;

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
      .insert({ name })
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

    const taskIds = listTasks.map((lt) => lt.task_id);

    const { data: tasks } = await supabase
      .from('tasks')
      .select('*')
      .in('task_id', taskIds);

    const userIds = tasks.map((t) => t.user_id).filter(Boolean);
    const activityIds = tasks.map((t) => t.activity_id).filter(Boolean);

    const { data: users } = userIds.length
      ? await supabase
          .from('users')
          .select('user_id, username, first_name, last_name')
          .in('user_id', userIds)
      : { data: [] };

    const { data: activities } = activityIds.length
      ? await supabase
          .from('activity')
          .select('activity_id, name')
          .in('activity_id', activityIds)
      : { data: [] };

    const { data: documents } = await supabase
      .from('documents')
      .select('*')
      .in('task_id', taskIds);

    const tasksWithDetails = tasks.map((task) => ({
      ...task,
      assignee: users.find((u) => u.user_id === task.user_id) || null,
      activity:
        activities.find((a) => a.activity_id === task.activity_id) || null,
      documents: documents.filter((d) => d.task_id === task.task_id),
    }));

    res.json({
      list: {
        ...list,
        tasks: listTasks
          .map((lt) => tasksWithDetails.find((t) => t.task_id === lt.task_id))
          .filter(Boolean),
      },
    });
  });

  app.get('/lists', async (req, res) => {
    const { data: lists, error: listsError } = await supabase
      .from('lists')
      .select('*');

    if (listsError) return res.status(500).json({ error: listsError });

    const listIds = lists.map((l) => l.list_id);

    const { data: listTasks, error: listTasksError } = await supabase
      .from('list_tasks')
      .select('*')
      .in('list_id', listIds);

    const taskIds = listTasks.map((lt) => lt.task_id);
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('*')
      .in('task_id', taskIds);

    const userIds = tasks.map((t) => t.user_id).filter(Boolean);
    const activityIds = tasks.map((t) => t.activity_id).filter(Boolean);

    const { data: users } = userIds.length
      ? await supabase
          .from('users')
          .select('user_id, username, first_name, last_name')
          .in('user_id', userIds)
      : { data: [] };

    const { data: activities } = activityIds.length
      ? await supabase
          .from('activity')
          .select('activity_id, name')
          .in('activity_id', activityIds)
      : { data: [] };

    const { data: documents } = await supabase
      .from('documents')
      .select('*')
      .in('task_id', taskIds);

    const tasksWithDetails = tasks.map((task) => ({
      ...task,
      assignee: users.find((u) => u.user_id === task.user_id) || null,
      activity:
        activities.find((a) => a.activity_id === task.activity_id) || null,
      documents: documents.filter((d) => d.task_id === task.task_id),
    }));

    const listsWithTasks = lists.map((list) => ({
      ...list,
      tasks: listTasks
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

    const taskIds = listTasks.map((lt) => lt.task_id);

    const { data: tasks } = await supabase
      .from('tasks')
      .select('*')
      .in('task_id', taskIds);

    const userIds = tasks.map((t) => t.user_id).filter(Boolean);
    const activityIds = tasks.map((t) => t.activity_id).filter(Boolean);

    const { data: users } = userIds.length
      ? await supabase
          .from('users')
          .select('user_id, username, first_name, last_name')
          .in('user_id', userIds)
      : { data: [] };

    const { data: activities } = activityIds.length
      ? await supabase
          .from('activity')
          .select('activity_id, name')
          .in('activity_id', activityIds)
      : { data: [] };

    const { data: documents } = await supabase
      .from('documents')
      .select('*')
      .in('task_id', taskIds);

    const tasksWithDetails = tasks.map((task) => ({
      ...task,
      assignee: users.find((u) => u.user_id === task.user_id) || null,
      activity:
        activities.find((a) => a.activity_id === task.activity_id) || null,
      documents: documents.filter((d) => d.task_id === task.task_id),
    }));

    res.json({
      list: {
        ...list,
        tasks: listTasks
          .map((lt) => tasksWithDetails.find((t) => t.task_id === lt.task_id))
          .filter(Boolean),
      },
    });
  });

  app.put('/lists/:id', async (req, res) => {
    const { id } = req.params;
    const { name, task_ids = [] } = req.body;

    const { data: updatedList, error: updateError } = await supabase
      .from('lists')
      .update({ name })
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
