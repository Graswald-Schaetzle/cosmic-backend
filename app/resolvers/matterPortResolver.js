const axios = require('axios');

const { MATTERPORT_MODEL_ID, MATTERPORT_API_KEY, MATTERPORT_API_SECRET } =
  process.env;
const API_URL = 'https://api.matterport.com/api/models/graph';

const query = `
  query {
    model(id: "${MATTERPORT_MODEL_ID}") {
      id
      name
      description
      created
      modified
      visibility
      state
      dimensions {
        width
        height
        depth
      }
      floors {
          id
      }
      mattertags {
        id
        label
        description
        color
        position {
          x
          y
          z
        }
      }
    }
  }
`;

async function getModelInfo() {
  try {
    const response = await axios.post(
      API_URL,
      { query },
      {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        auth: {
          username: MATTERPORT_API_KEY,
          password: MATTERPORT_API_SECRET,
        },
      },
    );

    if (response.data.data) {
      const floors = response.data.data.model.floors;
      return { locations: response.data.data.model.mattertags, floors };
    }
  } catch (error) {
    console.error(
      'Error fetching model information:',
      error.response ? error.response.data : error.message,
    );
    return error.response.data;
  }
}

async function createMattertag({
  location_name = 'Location #1',
  x,
  y,
  z,
  description = 'Tag Description',
  color = '#ffffff',
  enabled = true,
  floorId,
}) {
  try {
    const mutation = `
    mutation {
      addMattertag(
        modelId: "${MATTERPORT_MODEL_ID}",
        mattertag: {
          label: "${location_name}",
          description: "${description}",
          anchorPosition: { x: ${x}, y: ${y}, z: ${z} },
          color: "${color}",
          enabled: ${enabled},
          floorId: "${floorId}",
        }
        ) {
          id
          label
          description
        }
      }
    `;
    const response = await axios.post(
      API_URL,
      { query: mutation },
      {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        auth: {
          username: MATTERPORT_API_KEY,
          password: MATTERPORT_API_SECRET,
        },
      },
    );
    return response.data;
  } catch (error) {
    console.error(
      'Ошибка при создании точки:',
      error.response ? error.response.data : error.message,
    );
    return error.response;
  }
}

async function deleteMattertag(mattertagId) {
  try {
    const mutation = `
      mutation {
        deleteMattertag(
          modelId: "${MATTERPORT_MODEL_ID}",
          mattertagId: "${mattertagId}"
        )
      }
    `;

    const response = await axios.post(
      API_URL,
      { query: mutation },
      {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        auth: {
          username: MATTERPORT_API_KEY,
          password: MATTERPORT_API_SECRET,
        },
      },
    );

    return response.data;
  } catch (error) {
    console.error(
      'Ошибка при удалении точки:',
      error.response ? error.response.data : error.message,
    );
    return error.response;
  }
}

const synhronizeModels = async (supabase) => {
  try {
    // await supabase.from('locations').delete().neq('location_id', 0);
    // await supabase.from('rooms').delete().neq('room_id', 0);
    // await supabase.from('floors').delete().neq('floor_id', 0);
    // return;
    const model = await getModelInfo();
    const locations = model.locations;

    let createdCount = 0;
    let updatedCount = 0;

    let { data: unknownFloor } = await supabase
      .from('floors')
      .select('*')
      .eq('name', 'Unknown Floor')
      .single();

    if (!unknownFloor) {
      const { data: newFloor } = await supabase
        .from('floors')
        .insert({ name: 'Unknown Floor' })
        .select()
        .single();
      unknownFloor = newFloor;
    }

    let { data: unknownRoom } = await supabase
      .from('rooms')
      .select('*')
      .eq('name', 'Unknown Room')
      .single();

    if (!unknownRoom) {
      const { data: newRoom } = await supabase
        .from('rooms')
        .insert({ name: 'Unknown Room', floor_id: unknownFloor.floor_id })
        .select()
        .single();
      unknownRoom = newRoom;
    }

    for (const loc of locations) {
      const {
        id: matterport_tag_id,
        label: location_name,
        description,
        position,
        color,
      } = loc;

      let roomData = unknownRoom;
      let floorData = unknownFloor;

      if (description) {
        const roomMatch = description.match(/Room:\s*([^\n,]+)/);
        const floorMatch = description.match(/Floor:\s*([^\n,]+)/);

        if (floorMatch) {
          let { data: floor } = await supabase
            .from('floors')
            .select('*')
            .eq('name', floorMatch[1].trim())
            .single();

          if (!floor) {
            const { data: newFloor } = await supabase
              .from('floors')
              .insert({ name: floorMatch[1].trim() })
              .select()
              .single();
            floor = newFloor;
          }

          floorData = floor;
        }

        if (roomMatch) {
          let { data: room } = await supabase
            .from('rooms')
            .select('*')
            .eq('name', roomMatch[1].trim())
            .single();

          if (!room) {
            const { data: newRoom } = await supabase
              .from('rooms')
              .insert({
                name: roomMatch[1].trim(),
                floor_id: floorData.floor_id,
              })
              .select()
              .single();
            room = newRoom;
          }

          roomData = room;
        }
      }

      const { data: locationExists } = await supabase
        .from('locations')
        .select('*')
        .eq('location_id', matterport_tag_id)
        .single();

      const payload = {
        location_name,
        x: position.x,
        y: position.y,
        z: position.z,
        color,
        room_id: roomData.room_id,
        floor_id: floorData.floor_id,
        matterport_tag_id,
      };

      if (locationExists) {
        await supabase
          .from('locations')
          .update(payload)
          .eq('location_id', matterport_tag_id);
        updatedCount++;
      } else {
        await supabase.from('locations').insert(payload);
        createdCount++;
      }
    }

    return `Locations created: ${createdCount}, updated: ${updatedCount}`;
  } catch (err) {
    return `Error: ${err.message}`;
  }
};

module.exports = {
  getModelInfo,
  createMattertag,
  deleteMattertag,
  synhronizeModels,
};
