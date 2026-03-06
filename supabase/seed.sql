-- Seed data for Cosmic WebApp Backend

-- Activity types
insert into activity (name) values
  ('Inspection'),
  ('Maintenance'),
  ('Repair'),
  ('Cleaning'),
  ('Installation'),
  ('Review'),
  ('Other')
on conflict do nothing;

-- Recurring schedule options
insert into reccuring (name) values
  ('Daily'),
  ('Weekly'),
  ('Bi-Weekly'),
  ('Monthly'),
  ('Quarterly'),
  ('Yearly'),
  ('One-Time')
on conflict do nothing;
