import {sqliteTable,text,integer,index} from 'drizzle-orm/sqlite-core';
export const projects = sqliteTable('auto_projects', {
 id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),version:integer('version').notNull(),stateJson:text('state_json').notNull(),updatedAt:text('updated_at').notNull(),
}, t=>[index('auto_projects_owner').on(t.ownerId)]);
export const jobs = sqliteTable('auto_jobs', {
 id:text('id').primaryKey(),projectId:text('project_id').notNull(),status:text('status').notNull(),nextRunAt:text('next_run_at').notNull(),leaseToken:text('lease_token'),leaseUntil:integer('lease_until'),stateJson:text('state_json').notNull(),
},t=>[index('auto_jobs_due').on(t.status,t.nextRunAt),index('auto_jobs_project').on(t.projectId)]);
export const preferences = sqliteTable('auto_preferences', {
 id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),stateJson:text('state_json').notNull(),
},t=>[index('auto_preferences_owner').on(t.ownerId)]);
export const receipts = sqliteTable('auto_receipts', {
 key:text('key').primaryKey(),jobId:text('job_id').notNull(),callId:text('call_id').notNull(),stateJson:text('state_json').notNull(),
},t=>[index('auto_receipts_job').on(t.jobId)]);
export const runtime = sqliteTable('auto_runtime', {
 key:text('key').primaryKey(),valueJson:text('value_json').notNull(),updatedAt:text('updated_at').notNull(),
});
