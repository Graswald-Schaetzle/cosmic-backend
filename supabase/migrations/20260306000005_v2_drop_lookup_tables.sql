begin;

-- activity and reccuring are no longer referenced by any table.
-- tasks.activity_id and tasks.reccuring_id were removed in 003_v2_cleanup.
-- task_type and recurrence_rule (text fields on tasks) replace them.

drop table if exists activity;
drop table if exists reccuring;

commit;
