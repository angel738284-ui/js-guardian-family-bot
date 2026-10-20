import { config } from "../config.ts";
import { errorMessage, logger } from "../lib/logger.ts";
import { increment, recordJobDuration } from "./metrics.ts";

interface Job {
  name: string;
  work: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

const waiting: Job[] = [];
let running = 0;

export function enqueueJob<T>(name: string, work: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    waiting.push({ name, work, resolve: resolve as (value: unknown) => void, reject });
    increment("jobs_enqueued");
    startNextJobs();
  });
}

function startNextJobs(): void {
  while (running < config.jobConcurrency && waiting.length > 0) {
    const job = waiting.shift()!;
    running += 1;
    void runJob(job);
  }
}

async function runJob(job: Job): Promise<void> {
  const startedAt = Date.now();
  try {
    job.resolve(await job.work());
    increment("jobs_ok");
  } catch (error) {
    increment("jobs_failed");
    logger.warn(`Job ${job.name} failed: ${errorMessage(error)}`);
    job.reject(error);
  } finally {
    recordJobDuration(Date.now() - startedAt);
    running -= 1;
    startNextJobs();
  }
}

export function queueStats() {
  return { waiting: waiting.length, running, concurrency: config.jobConcurrency };
}
