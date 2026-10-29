const express = require('express');
const request = require('supertest');

jest.mock('../resolvers/matterPortResolver', () => ({
  createMattertag: jest.fn(),
  getModelInfo: jest.fn(),
  updateMattertag: jest.fn(),
  deleteMattertag: jest.fn(),
  synhronizeModels: jest.fn(),
}));

const { deleteMattertag } = require('../resolvers/matterPortResolver');
const { matterPortRoutes } = require('./matterPortRoute');

// Minimal chainable stand-in for the Supabase query builder used by DELETE /locations/:id.
const fakeSupabase = ({ location, selectError = null, deleteError = null, remaining = [] }) => {
  const deleted = jest.fn();
  const from = jest.fn(() => {
    const state = {};
    const builder = {
      select: jest.fn((cols) => {
        state.select = cols;
        return builder;
      }),
      delete: jest.fn(() => {
        state.delete = true;
        return builder;
      }),
      eq: jest.fn((col, val) => {
        if (state.delete) {
          deleted(col, val);
          return Promise.resolve({ error: deleteError });
        }
        return builder;
      }),
      single: jest.fn(() => Promise.resolve({ data: location, error: selectError })),
      then: (resolve) => resolve({ data: remaining, error: null }),
    };
    return builder;
  });
  return { supabase: { from }, deleted };
};

const buildApp = (supabase) => {
  const app = express();
  app.use(express.json());
  matterPortRoutes(app, supabase);
  return app;
};

describe('DELETE /locations/:id', () => {
  let errorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => errorSpy.mockRestore());

  it('deletes the Matterport tag by matterport_tag_id, then the row', async () => {
    const { supabase, deleted } = fakeSupabase({
      location: { matterport_tag_id: 'mp-tag-1' },
      remaining: [{ location_id: 2 }],
    });

    const res = await request(buildApp(supabase)).delete('/locations/7');

    expect(res.status).toBe(200);
    expect(deleteMattertag).toHaveBeenCalledWith('mp-tag-1');
    expect(deleted).toHaveBeenCalledWith('location_id', '7');
    expect(res.body.locations).toEqual([{ location_id: 2 }]);
  });

  it('skips Matterport when the location has no permanent tag', async () => {
    const { supabase, deleted } = fakeSupabase({ location: { matterport_tag_id: null } });

    const res = await request(buildApp(supabase)).delete('/locations/7');

    expect(res.status).toBe(200);
    expect(deleteMattertag).not.toHaveBeenCalled();
    expect(deleted).toHaveBeenCalled();
  });

  it('still deletes the row when the Matterport call fails', async () => {
    deleteMattertag.mockRejectedValue(new Error('matterport down'));
    const { supabase, deleted } = fakeSupabase({ location: { matterport_tag_id: 'mp-tag-1' } });

    const res = await request(buildApp(supabase)).delete('/locations/7');

    expect(res.status).toBe(200);
    expect(deleted).toHaveBeenCalledWith('location_id', '7');
    expect(errorSpy).toHaveBeenCalled();
  });

  it('returns 404 when the location does not exist', async () => {
    const { supabase, deleted } = fakeSupabase({ location: null });

    const res = await request(buildApp(supabase)).delete('/locations/7');

    expect(res.status).toBe(404);
    expect(deleteMattertag).not.toHaveBeenCalled();
    expect(deleted).not.toHaveBeenCalled();
  });

  it('returns 500 JSON when the Supabase delete fails', async () => {
    const { supabase } = fakeSupabase({
      location: { matterport_tag_id: null },
      deleteError: { message: 'fk violation' },
    });

    const res = await request(buildApp(supabase)).delete('/locations/7');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'fk violation' });
  });

  it('returns 500 JSON instead of hanging when the handler throws', async () => {
    const supabase = {
      from: jest.fn(() => {
        throw new Error('boom');
      }),
    };

    const res = await request(buildApp(supabase)).delete('/locations/7');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'boom' });
  });
});
