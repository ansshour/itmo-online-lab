import { LaboratoryStage } from '../lab6.laboratory.types';
import type { ValidationResult } from '../lab6.laboratory.types';
import { LAB6_STAGE_LABELS, LAB6_STATUS_LABELS } from './lab6.stageMachine.consts';
import type { Lab6StageSnapshot } from './lab6.stageMachine.types';

export class Lab6StageMachine {
  private stage: LaboratoryStage;

  private status: string;

  public constructor() {
    this.stage = LaboratoryStage.Assembly;
    this.status = LAB6_STATUS_LABELS.assembly;
  }

  public snapshot(): Lab6StageSnapshot {
    return {
      stage: this.stage,
      status: this.status,
      primaryLabel: LAB6_STAGE_LABELS[this.stage],
    };
  }

  public stageValue(): LaboratoryStage {
    return this.stage;
  }

  public isAssembly(): boolean {
    return this.stage === LaboratoryStage.Assembly;
  }

  public isInstruments(): boolean {
    return this.stage === LaboratoryStage.Instruments;
  }

  public isRunning(): boolean {
    return this.stage === LaboratoryStage.Running;
  }

  public canAdvance(validation?: ValidationResult): ValidationResult {
    if (this.isRunning()) {
      return {
        valid: true,
        message: LAB6_STATUS_LABELS.runningStopped,
      };
    }

    return validation ?? {
      valid: false,
      message: this.status,
    };
  }

  public restoreAssembly(): void {
    if (!this.isAssembly()) {
      return;
    }

    this.status = LAB6_STATUS_LABELS.assembly;
  }

  public restoreInstruments(): void {
    if (!this.isInstruments()) {
      return;
    }

    this.status = LAB6_STATUS_LABELS.instruments;
  }

  public advance(validation?: ValidationResult): ValidationResult {
    if (this.isRunning()) {
      return this.stop();
    }

    if (!validation) {
      return {
        valid: false,
        message: this.status,
      };
    }

    this.status = validation.message;

    if (!validation.valid) {
      return validation;
    }

    this.stage = this.isAssembly() ? LaboratoryStage.Instruments : LaboratoryStage.Running;

    return validation;
  }

  public stop(): ValidationResult {
    this.stage = LaboratoryStage.Assembly;
    this.status = LAB6_STATUS_LABELS.runningStopped;

    return {
      valid: true,
      message: this.status,
    };
  }
}