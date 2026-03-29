const menuCatalog = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    iconKey: 'dashboard',
    defaultSection: 'main',
    defaultOrder: 0,
  },
  {
    id: 'objects',
    label: 'Objects',
    iconKey: 'objects',
    defaultSection: 'main',
    defaultOrder: 1,
  },
  {
    id: 'tasks',
    label: 'Tasks',
    iconKey: 'tasks',
    defaultSection: 'main',
    defaultOrder: 2,
  },
  {
    id: 'notifications',
    label: 'Notifications',
    iconKey: 'notifications',
    defaultSection: 'main',
    defaultOrder: 3,
  },
  {
    id: 'calendar',
    label: 'Calendar',
    iconKey: 'calendar',
    defaultSection: 'main',
    defaultOrder: 4,
  },
  {
    id: 'documents',
    label: 'Documents',
    iconKey: 'documents',
    defaultSection: 'main',
    defaultOrder: 5,
  },
  {
    id: 'profile',
    label: 'Profile',
    iconKey: 'profile',
    defaultSection: 'main',
    defaultOrder: 6,
  },
  {
    id: 'interior-designer',
    label: 'Interior Designer',
    iconKey: 'interior-designer',
    defaultSection: 'other',
    defaultOrder: 0,
  },
  {
    id: 'food-delivery',
    label: 'Food Delivery',
    iconKey: 'food-delivery',
    defaultSection: 'other',
    defaultOrder: 1,
  },
  {
    id: 'insurance',
    label: 'Insurance',
    iconKey: 'insurance',
    defaultSection: 'other',
    defaultOrder: 2,
  },
  {
    id: 'games',
    label: 'Games',
    iconKey: 'games',
    defaultSection: 'other',
    defaultOrder: 3,
  },
  {
    id: 'reconstruction',
    label: '3D Reconstruction',
    iconKey: 'reconstruction',
    defaultSection: 'other',
    defaultOrder: 4,
  },
  {
    id: 'spaces',
    label: 'My Spaces',
    iconKey: 'spaces',
    defaultSection: 'other',
    defaultOrder: 5,
  },
];

const legacyAliases = {
  Dashboard: 'dashboard',
  Objects: 'objects',
  Tasks: 'tasks',
  Notifications: 'notifications',
  Calendar: 'calendar',
  Documents: 'documents',
  Profile: 'profile',
  'Interior Designer': 'interior-designer',
  'Food Delivery': 'food-delivery',
  Insurance: 'insurance',
  Games: 'games',
  '3D Reconstruction': 'reconstruction',
  'My Spaces': 'spaces',
  'AI Agent': 'dashboard',
};

const catalogById = new Map(menuCatalog.map((item) => [item.id, item]));

function resolveMenuItemId(value) {
  if (!value || typeof value !== 'string') return null;

  if (catalogById.has(value)) {
    return value;
  }

  return legacyAliases[value] ?? null;
}

function normalizeMenuItem(item) {
  const id = resolveMenuItemId(item?.id ?? item?.name);
  if (!id) return null;

  return {
    name: id,
    order: Number.isFinite(item?.order) ? item.order : 0,
    enabled: Boolean(item?.enabled),
  };
}

function normalizeMenuItems(items = []) {
  return items
    .map(normalizeMenuItem)
    .filter(Boolean)
    .sort((a, b) => a.order - b.order);
}

module.exports = {
  menuCatalog,
  normalizeMenuItems,
};
