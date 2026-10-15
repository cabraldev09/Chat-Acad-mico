import { resumeDelayedRuns } from "../services/FlowServices/Runner";
import { logger } from "../utils/logger";

// the "wait" blocks of the flows: every half minute the runs whose time came go on
export const startFlowRunner = (): void => {
  setInterval(() => {
    resumeDelayedRuns().catch(err => logger.error(`Flow runner: ${err}`));
  }, 30 * 1000);
};
