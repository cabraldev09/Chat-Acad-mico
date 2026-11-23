import { AsyncLocalStorage } from "async_hooks";

export interface AnalyticsInstitutionScope { id: number; isDefault: boolean; isLegacy?: boolean }

const instScope = new AsyncLocalStorage<AnalyticsInstitutionScope>();

export const withAnalyticsInstitution = <T>(inst: AnalyticsInstitutionScope | null, fn: () => Promise<T>): Promise<T> =>
  inst ? instScope.run(inst, fn) : fn();

export const analyticsInstitutionId = (): number | null => instScope.getStore()?.id || null;
export const analyticsInstitutionScope = (): AnalyticsInstitutionScope | null => instScope.getStore() || null;
export const currentAnalyticsInstitution = (): AnalyticsInstitutionScope | null => instScope.getStore() || null;
