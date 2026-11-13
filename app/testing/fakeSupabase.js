/**
 * In-memory stand-in for the parts of the Supabase client the routes use, for tests.
 *   const supabase = fakeSupabase({ rooms: [{ room_id: 1, ... }] }, { rooms: 'room_id' });
 * `keys` names the identity column of each table; inserted rows get the next free number.
 */
function fakeSupabase(tables = {}, keys = {}) {
  const rowsOf = (table) => (tables[table] = tables[table] || []);

  const from = (table) => {
    const filters = [];
    let operation = 'select';
    let payload = null;
    let sort = null;
    let max = null;

    const matching = () =>
      rowsOf(table).filter((row) => filters.every((f) => f(row)));

    const run = () => {
      let rows;
      if (operation === 'insert') {
        const key = keys[table];
        rows = payload.map((values) => {
          const row = { ...values };
          if (key && row[key] == null) {
            row[key] =
              rowsOf(table).reduce((m, r) => Math.max(m, r[key]), 0) + 1;
          }
          rowsOf(table).push(row);
          return row;
        });
      } else if (operation === 'update') {
        rows = matching();
        rows.forEach((row) => Object.assign(row, payload));
      } else if (operation === 'delete') {
        rows = matching();
        tables[table] = rowsOf(table).filter((row) => !rows.includes(row));
      } else {
        rows = matching();
      }
      if (sort) {
        const { column, ascending } = sort;
        rows = [...rows].sort(
          (a, b) =>
            (a[column] < b[column] ? -1 : a[column] > b[column] ? 1 : 0) *
            (ascending ? 1 : -1),
        );
      }
      if (max != null) rows = rows.slice(0, max);
      return rows.map((row) => ({ ...row }));
    };

    const builder = {
      select: () => builder,
      insert: (values) => {
        operation = 'insert';
        payload = Array.isArray(values) ? values : [values];
        return builder;
      },
      update: (values) => {
        operation = 'update';
        payload = values;
        return builder;
      },
      delete: () => {
        operation = 'delete';
        return builder;
      },
      eq: (column, value) => {
        filters.push((row) => String(row[column]) === String(value));
        return builder;
      },
      in: (column, values) => {
        filters.push((row) => values.map(String).includes(String(row[column])));
        return builder;
      },
      not: (column, operator, value) => {
        if (operator !== 'is' || value !== null)
          throw new Error('unsupported filter');
        filters.push((row) => row[column] != null);
        return builder;
      },
      lt: (column, value) => {
        filters.push((row) => row[column] < value);
        return builder;
      },
      order: (column, { ascending = true } = {}) => {
        sort = { column, ascending };
        return builder;
      },
      limit: (count) => {
        max = count;
        return builder;
      },
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      single: async () => {
        const [row] = run();
        return row
          ? { data: row, error: null }
          : { data: null, error: { message: 'no rows' } };
      },
      then: (resolve, reject) =>
        Promise.resolve({ data: run(), error: null }).then(resolve, reject),
    };
    return builder;
  };

  return { from, tables };
}

/** Collects the handlers a routes function registers, so tests can call them directly. */
function fakeApp() {
  const routes = {};
  const register =
    (method) =>
    (path, ...handlers) => {
      routes[`${method} ${path}`] = handlers[handlers.length - 1];
    };
  const app = {
    get: register('GET'),
    post: register('POST'),
    put: register('PUT'),
    patch: register('PATCH'),
    delete: register('DELETE'),
  };

  /** Calls a route and returns { status, body }. */
  const call = async (
    route,
    { params = {}, query = {}, body = {}, userId = 1 } = {},
  ) => {
    const result = { status: 200, body: undefined };
    const res = {
      status(code) {
        result.status = code;
        return res;
      },
      json(value) {
        result.body = value;
        return res;
      },
    };
    await routes[route]({ params, query, body, user_id: userId }, res);
    return result;
  };

  return { app, call };
}

module.exports = { fakeSupabase, fakeApp };
