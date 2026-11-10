import { resumeDelayedRuns, resumeStaleStageRuns } from "../services/FlowServices/Runner";
import { logger } from "../utils/logger";

// the "wait" blocks of the flows: every half minute the runs whose time came go on
export const startFlowRunner = (): void => {
  setInterval(() => {
    resumeDelayedRuns().catch(err => logger.error(`Flow runner: ${err}`));
    resumeStaleStageRuns().catch(err => logger.error(`Flow runner (AI stages): ${err}`));
  }, 30 * 1000);
};
