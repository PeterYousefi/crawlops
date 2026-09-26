/**
 * JobRunner abstraction.
 *
 * WHAT: An interface for executing a run "job", with an in-process implementation.
 * WHY:  This is the single seam where a real queue (Azure Service Bus / Redis)
 *       replaces synchronous execution later. Keeping it behind an interface
 *       means the API doesn't change when we move to a worker + queue.
 * HOW:  MVP uses InProcessJobRunner, which just awaits the work. A future
 *       QueueJobRunner would enqueue and let a separate worker consume.
 */

export interface JobRunner {
  /** Execute (or enqueue) work for a run. MVP runs it in-process and awaits. */
  run(runId: string, work: () => Promise<void>): Promise<void>;
}

export class InProcessJobRunner implements JobRunner {
  async run(_runId: string, work: () => Promise<void>): Promise<void> {
    await work();
  }
}
