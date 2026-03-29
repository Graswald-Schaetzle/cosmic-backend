alter table spaces
  add column if not exists matterport_model_id text,
  add column if not exists matterport_showcase_url text;
