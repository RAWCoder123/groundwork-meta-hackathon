import type { D1Database, R2Bucket, ExecutionContext as WorkerExecutionContext } from '@cloudflare/workers-types';
import type { ConnectorBinding } from './lib/connector-contract.mjs';
declare global {
 namespace Cloudflare {
  interface Env {
   DB?: D1Database;
   BUCKET?: R2Bucket;
   MODEL_API_KEY?: string;
   CONNECTORS?: ConnectorBinding;
  }
 }
 type ExecutionContext<Props = unknown> = WorkerExecutionContext<Props>;
}
