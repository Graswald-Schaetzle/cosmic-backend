const notificationRoutes = async (app, supabase) => {
  app.post('/notifications', async (req, res) => {
    const notificationData = req.body;

    const { data, error } = await supabase
      .from('notifications')
      .insert(notificationData)
      .select('*');

    res.json({ data, error });
  });

  app.get('/notifications', async (req, res) => {
    const { floor_id, room_id } = req.query;

    if (floor_id) {
      let query = supabase
        .from('notifications')
        .select('*')
        .eq('floor_id', floor_id)
        .order('created_at', { ascending: false });

      if (room_id) {
        query = query.eq('room_id', room_id);
      }

      const { data: notifications, error } = await query;
      if (error) return res.status(500).json({ error });

      const { data: rooms, error: roomsError } = await supabase
        .from('rooms')
        .select('*')
        .eq('floor_id', floor_id);

      if (roomsError) return res.status(500).json({ error: roomsError });

      const notificationsByRoom = rooms
        .map((room) => {
          const notifs = notifications.filter(
            (n) => n.room_id === room.room_id,
          );
          if (notifs.length === 0) return null;
          return {
            room_id: room.room_id,
            room_name: room.name,
            notifications: notifs,
            newCount: notifs.filter((n) => n.is_new).length,
          };
        })
        .filter(Boolean);

      const { data: floorData, error: floorError } = await supabase
        .from('floors')
        .select('*')
        .eq('floor_id', floor_id)
        .single();

      if (floorError) return res.status(500).json({ error: floorError });

      const floorNewCount = notifications.filter((n) => n.is_new).length;

      return res.json({
        floor_id: floorData.floor_id,
        floor_name: floorData.name,
        newCount: floorNewCount,
        rooms: notificationsByRoom,
      });
    } else {
      let query = supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false });

      const { data: notifications, error } = await query;
      if (error) return res.status(500).json({ error });

      const floorIds = [
        ...new Set(notifications.map((n) => n.floor_id).filter(Boolean)),
      ];
      const roomIds = [
        ...new Set(notifications.map((n) => n.room_id).filter(Boolean)),
      ];

      const [{ data: floors }, { data: rooms }] = await Promise.all([
        supabase.from('floors').select('*').in('floor_id', floorIds),
        supabase.from('rooms').select('*').in('room_id', roomIds),
      ]);

      const sortedFloors = floors.sort(
        (a, b) => Number(a.name) - Number(b.name),
      );

      const grouped = sortedFloors.map((floor) => {
        const floorRooms = rooms.filter(
          (room) => room.floor_id === floor.floor_id,
        );

        const roomsWithNotifications = floorRooms
          .map((room) => {
            const notifs = notifications.filter(
              (n) =>
                n.floor_id === floor.floor_id && n.room_id === room.room_id,
            );
            if (notifs.length === 0) return null;
            return {
              room_id: room.room_id,
              room_name: room.name,
              notifications: notifs,
              newCount: notifs.filter((n) => n.is_new).length,
            };
          })
          .filter(Boolean);

        const floorNotifs = notifications.filter(
          (n) => n.floor_id === floor.floor_id,
        );

        return {
          floor_id: floor.floor_id,
          floor_name: floor.name,
          newCount: floorNotifs.filter((n) => n.is_new).length,
          rooms: roomsWithNotifications,
        };
      });

      const totalNewCount = notifications.filter((n) => n.is_new).length;

      return res.json({
        totalNewCount,
        floors: grouped,
      });
    }
  });

  app.put('/notifications/mark-all-read', async (req, res) => {
    const { data: updatedData, error: updateError } = await supabase
      .from('notifications')
      .update({ is_new: false })
      .gt('notification_id', 0);

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    const { data: allNotifications, error: fetchError } = await supabase
      .from('notifications')
      .select('*');

    if (fetchError) {
      return res.status(500).json({ error: fetchError.message });
    }

    res.json({ data: allNotifications });
  });

  app.get('/last-activities', async (req, res) => {
    try {
      const { data: notifications, error } = await supabase
        .from('notifications')
        .select('*')
        .not('task_id', 'is', null)
        .order('is_new', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) return res.status(500).json({ error });

      return res.json({ notifications });
    } catch (err) {
      res
        .status(500)
        .json({ message: 'Error fetching last activities', error: err });
    }
  });

  app.put('/notifications/mark-read', async (req, res) => {
    const {
      room_id,
      location_id,
      document_id,
      task_id,
      floor_id,
      notification_id,
    } = req.body;

    const filterFields = {
      room_id,
      location_id,
      document_id,
      task_id,
      floor_id,
      notification_id,
    };

    let query = supabase
      .from('notifications')
      .update({ is_new: false })
      .select('*');

    const validFilter = Object.entries(filterFields).find(
      ([_, v]) => v !== undefined,
    );

    if (!validFilter) {
      return res.status(400).json({ error: 'No filter ID provided' });
    }

    const [field, value] = validFilter;

    query = query.eq(field, value);

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ data, error: null });
  });

  app.get('/notifications/:id', async (req, res) => {
    const { id } = req.params;

    const { data: notification, error: notifError } = await supabase
      .from('notifications')
      .select('*')
      .eq('notification_id', id)
      .single();

    if (notifError) return res.status(500).json({ error: notifError });
    if (!notification)
      return res.status(404).json({ message: 'Notification not found' });

    const [
      { data: task, error: taskError },
      { data: room, error: roomError },
      { data: floor, error: floorError },
      { data: location, error: locationError },
      { data: document, error: documentError },
    ] = await Promise.all([
      notification.task_id
        ? supabase
            .from('tasks')
            .select('*')
            .eq('task_id', notification.task_id)
            .single()
        : { data: null, error: null },
      notification.room_id
        ? supabase
            .from('rooms')
            .select('*')
            .eq('room_id', notification.room_id)
            .single()
        : { data: null, error: null },
      notification.floor_id
        ? supabase
            .from('floors')
            .select('*')
            .eq('floor_id', notification.floor_id)
            .single()
        : { data: null, error: null },
      notification.location_id
        ? supabase
            .from('locations')
            .select('*')
            .eq('location_id', notification.location_id)
            .single()
        : { data: null, error: null },
      notification.document_id
        ? supabase
            .from('documents')
            .select('*')
            .eq('document_id', notification.document_id)
            .single()
        : { data: null, error: null },
    ]);

    if (
      taskError ||
      roomError ||
      floorError ||
      locationError ||
      documentError
    ) {
      return res.status(500).json({
        errors: {
          taskError,
          roomError,
          floorError,
          locationError,
          documentError,
        },
      });
    }

    res.json({
      notification,
      task,
      room,
      floor,
      location,
      document,
    });
  });

  app.delete('/notifications/:id', async (req, res) => {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', id);

    res.json({ data, error });
  });
};

module.exports = {
  notificationRoutes,
};
