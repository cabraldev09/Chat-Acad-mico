import { resumeDelayedRuns, resumeStaleStageRuns } from "../services/FlowServices/Runner";
import { logger } from "../utils/logger";

// the "wait" blocks of the flows: every half minute the runs whose time came go on
// a slow round (many runs, a slow model) never overlaps the next one: the same run would be resumed twice
let busy = false;
export const startFlowRunner = (): void => {
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await resumeDelayedRuns().catch(err => logger.error(`Flow runner: ${err}`));
      await resumeStaleStageRuns().catch(err => logger.error(`Flow runner (AI stages): ${err}`));
    } finally {
      busy = false;
    }
  }, 30 * 1000);
};
