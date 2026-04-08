import type { LaboratoryStage } from '../lab6.laboratory.types';

export interface Lab6StageSnapshot {
  readonly stage: LaboratoryStage;
  readonly status: string;
  readonly primaryLabel: string;
}