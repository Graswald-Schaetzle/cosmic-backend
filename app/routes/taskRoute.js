const taskRoutes = async (app, supabase) => {
  app.post('/task', async (req, res) => {
    const taskData = req.body;
    const { lists_id, ...taskFields } = taskData;

    try {
      const { data: tasks, error: taskError } = await supabase
        .from('tasks')
        .insert(taskFields)
        .select('*');

      if (taskError) {
        return res.status(500).json({ error: taskError });
      }

      const createdTask = tasks[0];

      if (Array.isArray(lists_id) && lists_id.length > 0) {
        const listTaskInserts = lists_id.map((list_id) => ({
          list_id,
          task_id: createdTask.task_id,
        }));

        const { error: listTaskError } = await supabase
          .from('list_tasks')
          .insert(listTaskInserts);

        if (listTaskError) {
          return res.status(500).json({ error: listTaskError });
        }

        createdTask.lists_id = lists_id;
      }

      return res.json({ data: createdTask });
    } catch (err) {
      return res.status(500).json({ error: 'Unexpected error', details: err });
    }
  });

  app.get('/task', async (req, res) => {
    const { location_id } = req.query;

    let taskQuery = supabase.from('tasks').select('*');

    if (location_id) {
      taskQuery = taskQuery.eq('location_id', location_id);
    }

    const { data: tasks, error: tasksError } = await taskQuery;

    if (tasksError) {
      return res.status(500).json({ error: tasksError.message });
    }

    const taskIds = tasks.map((task) => task.task_id);
    const userIds = tasks.map((task) => task.user_id).filter(Boolean);
    const activityIds = tasks.map((task) => task.activity_id).filter(Boolean);
    const locationIds = tasks.map((task) => task.location_id).filter(Boolean);
    const reccuringIds = tasks.map((task) => task.reccuring_id).filter(Boolean);

    const { data: documents, error: documentsError } = await supabase
      .from('documents')
      .select('*')
      .in('task_id', taskIds);

    const { data: users, error: usersError } =
      userIds.length > 0
        ? await supabase
            .from('users')
            .select('user_id, username, first_name, last_name')
            .in('user_id', userIds)
        : { data: [], error: null };

    const { data: activities, error: activitiesError } =
      activityIds.length > 0
        ? await supabase
            .from('activity')
            .select('activity_id, name')
            .in('activity_id', activityIds)
        : { data: [], error: null };

    const { data: reccuring, error: reccuringError } =
      reccuringIds.length > 0
        ? await supabase
            .from('reccuring')
            .select('reccuring_id, name')
            .in('reccuring_id', reccuringIds)
        : { data: [], error: null };

    const { data: location, error: locationError } =
      locationIds.length > 0
        ? await supabase
            .from('locations')
            .select('*')
            .in('location_id', locationIds)
        : { data: [], error: null };

    const { data: listTasks } = await supabase
      .from('list_tasks')
      .select('task_id, list_id')
      .in('task_id', taskIds);

    const listIds = [...new Set(listTasks?.map((lt) => lt.list_id))];

    const { data: lists } = listIds.length
      ? await supabase
          .from('lists')
          .select('list_id, name')
          .in('list_id', listIds)
      : { data: [] };

    const tasksWithDetails = tasks.map((task) => {
      const { activity_id, reccuring_id, user_id, ...rest } = task;

      const taskListIds =
        listTasks
          ?.filter((lt) => lt.task_id === task.task_id)
          .map((lt) => lt.list_id) || [];

      const taskLists =
        lists?.filter((l) => taskListIds.includes(l.list_id)) || [];

      return {
        ...rest,
        documents:
          documents?.filter((doc) => doc.task_id === task.task_id) || [],
        assignee: users?.find((user) => user.user_id === task.user_id) || null,
        activity:
          activities?.find((act) => act.activity_id === task.activity_id) ||
          null,
        locations:
          location?.find((loc) => loc.location_id === task.location_id) || null,
        reccuring:
          reccuring?.find((rec) => rec.reccuring_id === task.reccuring_id) ||
          null,
        lists: taskLists,
      };
    });

    res.json({
      data: tasksWithDetails,
      errors: {
        documentsError,
        usersError,
        activitiesError,
      },
    });
  });

  app.get('/task/:id', async (req, res) => {
    const { id } = req.params;
    const { data: taskData, error: taskError } = await supabase
      .from('tasks')
      .select('*')
      .eq('task_id', id)
      .single();

    const { data: documents, error: documentsError } = await supabase
      .from('documents')
      .select('*')
      .eq('task_id', id);

    if (!taskData) {
      return res.status(404).json({ error: 'Task not found', taskError });
    }

    const task = { ...taskData };

    if (task.user_id) {
      const { data: user } = await supabase
        .from('users')
        .select('user_id, username, first_name, last_name')
        .eq('user_id', task.user_id)
        .single();

      task.assignee = user || null;
    }

    if (task.activity_id) {
      const { data: activity } = await supabase
        .from('activity')
        .select('activity_id, name')
        .eq('activity_id', task.activity_id)
        .single();

      task.activity = activity || null;
    }

    if (task.reccuring_id) {
      const { data: reccuring } = await supabase
        .from('reccuring')
        .select('reccuring_id, name')
        .eq('reccuring_id', task.reccuring_id)
        .single();

      task.reccuring = reccuring || null;
    }

    if (task.location_id) {
      const { data: location } = await supabase
        .from('locations')
        .select('*')
        .eq('location_id', task.location_id)
        .single();

      task.location = location || null;
    }

    console.log('id', id);

    const { data: listTasks, error: listTasksError } = await supabase
      .from('list_tasks')
      .select('list_id')
      .eq('task_id', id);

    const listIds = listTasks?.map((lt) => lt.list_id) || [];

    let lists = [];
    if (listIds.length) {
      const { data: listsData } = await supabase
        .from('lists')
        .select('list_id, name')
        .in('list_id', listIds);

      lists = listsData || [];
    }

    task.lists = lists;

    delete task.activity_id;
    delete task.reccuring_id;
    delete task.location_id;
    delete task.user_id;

    res.json({
      task,
      documents,
      errors: {
        taskError,
        documentsError,
      },
    });
  });

  app.put('/task/:id', async (req, res) => {
    const { lists_id, ...taskFields } = req.body;
    const taskId = req.params.id;

    try {
      const { data: updatedTasks, error: updateError } = await supabase
        .from('tasks')
        .update(taskFields)
        .eq('task_id', taskId)
        .select('*');

      if (updateError) {
        return res.status(500).json({ error: updateError });
      }

      if (Array.isArray(lists_id)) {
        await supabase.from('list_tasks').delete().eq('task_id', taskId);

        if (lists_id.length > 0) {
          const listTaskInserts = lists_id.map((list_id) => ({
            list_id,
            task_id: taskId,
          }));

          const { error: insertError } = await supabase
            .from('list_tasks')
            .insert(listTaskInserts);

          if (insertError) {
            return res.status(500).json({ error: insertError });
          }
        }

        updatedTasks[0].lists_id = lists_id;
      }

      res.json({ data: updatedTasks[0] });
    } catch (err) {
      res.status(500).json({ error: 'Unexpected error', details: err });
    }
  });

  app.delete('/task/:id', async (req, res) => {
    const { data, error } = await supabase
      .from('tasks')
      .delete()
      .eq('task_id', req.params.id);
    res.json({ data, error });
  });
};

module.exports = {
  taskRoutes,
};
