import { resumeDelayedRuns, resumeStaleStageRuns } from "../services/FlowServices/Runner";
import { logger } from "../utils/logger";
import { guardedInterval } from "./guardedInterval";

// the "wait" blocks of the flows: every half minute the runs whose time came go on
export const startFlowRunner = (): void => {
  guardedInterval("FlowRunner", async () => {
    await Promise.all([
      resumeDelayedRuns().catch(err => logger.error(`Flow runner: ${err}`)),
      resumeStaleStageRuns().catch(err => logger.error(`Flow runner (AI stages): ${err}`))
    ]);
  }, 30 * 1000);
};
