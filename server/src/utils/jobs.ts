import { randomUUID } from 'node:crypto';
import type { RenderSettings } from '@motionforge/shared';

export type JobStatus = 'running' | 'done' | 'error';

export interface JobResult {
  url: string;
  fileName: string;
  settings: RenderSettings;
}

export interface Job {
  id: string;
  status: JobStatus;
  progress: number;
  message: string;
  result?: JobResult;
  error?: string;
  createdAt: number;
}

export type JobUpdate = (patch: { progress?: number; message?: string }) => void;

const jobs = new Map<string, Job>();

/**
 * Runs an async task in the background and tracks it in memory so clients can
 * poll its progress (used by the MP4 export, which takes minutes).
 */
export function createJob(run: (update: JobUpdate) => Promise<JobResult>): Job {
  const job: Job = {
    id: randomUUID(),
    status: 'running',
    progress: 0,
    message: 'Starting',
    createdAt: Date.now(),
  };
  jobs.set(job.id, job);
  run((patch) => Object.assign(job, patch))
    .then((result) => {
      job.status = 'done';
      job.progress = 1;
      job.message = 'Done';
      job.result = result;
    })
    .catch((err: unknown) => {
      job.status = 'error';
      job.error = err instanceof Error ? err.message : String(err);
    });
  return job;
}

export function getJob(id: string): Job | null {
  return jobs.get(id) ?? null;
}
