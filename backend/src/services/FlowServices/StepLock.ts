import { StageData } from "./StageSpec";

// The lock of the checklist of a stage: the stage cannot END (done, proposal, qualified handover) while a required step is still pending.
// It never traps the person: the limit of turns, a request for a person, "no interest", the tutoring/secretary exits and the switch-off always pass.
// Pure code (no database, no model): the same rule runs in the live flow, in the simulator and in the tools of the AI.

export const stepsKey = (nodeId: string): string => `__steps_${nodeId}`;

// the numbers (1-based) of the steps already done in this stage, as kept in the variables of the run
export const doneSteps = (vars: Record<string, any>, nodeId: string): number[] => {
  const raw = vars ? vars[stepsKey(nodeId)] : null;
  return (Array.isArray(raw) ? raw : []).map(Number).filter(n => Number.isInteger(n) && n > 0);
};

export const stepsOf = (stage: Pick<StageData, "steps">): string[] => (Array.isArray(stage.steps) ? stage.steps.filter(Boolean) : []);

// what is still to do, as step numbers
export const pendingSteps = (stage: Pick<StageData, "steps">, done: number[]): number[] => {
  const total = stepsOf(stage).length;
  const have = new Set(done);
  const out: number[] = [];
  for (let i = 1; i <= total; i += 1) if (!have.has(i)) out.push(i);
  return out;
};

// the steps the model says are done: only real numbers, no repeats
export const markSteps = (stage: Pick<StageData, "steps">, done: number[], marked: any[]): number[] => {
  const total = stepsOf(stage).length;
  const set = new Set(done);
  (Array.isArray(marked) ? marked : [marked]).forEach(m => {
    const n = Math.round(Number(m));
    if (Number.isInteger(n) && n >= 1 && n <= total) set.add(n);
  });
  return [...set].sort((a, b) => a - b);
};

// the exits that END the stage on the happy path: only these wait for the checklist ("human" only when it is the handover of a qualified lead)
export const isHeldExit = (exit: string | null | undefined, why?: string | null): boolean => exit === "done" || exit === "proposta" || (exit === "human" && why === "qualified");

// the text that tells the model (and the owner) what is missing
export const pendingText = (stage: Pick<StageData, "steps">, pending: number[]): string => {
  const steps = stepsOf(stage);
  return pending.map(n => `${n}. ${steps[n - 1]}`).join(" | ");
};

export interface Lock {
  held: boolean;
  pending: number[];
}

// the decision of the lock for one exit
export const lockExit = (stage: Pick<StageData, "steps">, done: number[], exit: string | null | undefined, why?: string | null): Lock => {
  const pending = pendingSteps(stage, done);
  return { held: !!exit && pending.length > 0 && isHeldExit(exit, why), pending };
};

// what a turn of the AI needs to know about the checklist: the steps done and what the lock refused last turn (that note is read once)
export const takeSteps = (vars: Record<string, any>, nodeId: string): { stepsDone: number[]; stepsHeld?: string } => {
  const stepsHeld = vars.__stepsHeld ? String(vars.__stepsHeld) : undefined;
  delete vars.__stepsHeld;
  return { stepsDone: doneSteps(vars, nodeId), ...(stepsHeld ? { stepsHeld } : {}) };
};
