const NO_PREFIGHT_SETUP_STORAGE_KEY = 'slayai:debug:no-prefight-setup';
const SHOW_ROLLBACK_BUTTON_STORAGE_KEY = 'slayai:debug:show-rollback-button';
const THREAT_BUDGET_STORAGE_KEY = 'slayai:debug:threat-budget';

let noPreFightSetupSetting = loadNoPreFightSetupSetting();
let showRollbackButtonSetting = loadShowRollbackButtonSetting();
let threatBudgetSetting = loadThreatBudgetSetting();

function parseBoolFlag(value: string | null): boolean {
  return value === '1' || value === 'true' || value === 'on';
}

function loadNoPreFightSetupSetting(): boolean {
  try {
    const fromQuery = new URLSearchParams(window.location.search).get('noPreFightSetup');
    if (fromQuery !== null) {
      return parseBoolFlag(fromQuery.toLowerCase());
    }
    const raw = window.localStorage.getItem(NO_PREFIGHT_SETUP_STORAGE_KEY);
    if (raw === null) return false;
    return parseBoolFlag(raw.toLowerCase());
  } catch {
    return false;
  }
}

export function getNoPreFightSetupSetting(): boolean {
  return noPreFightSetupSetting;
}

export function setNoPreFightSetupSetting(show: boolean): void {
  noPreFightSetupSetting = show;
  try {
    window.localStorage.setItem(NO_PREFIGHT_SETUP_STORAGE_KEY, show ? 'true' : 'false');
  } catch {
    // localStorage unavailable or full – silently ignore
  }
}

function loadShowRollbackButtonSetting(): boolean {
  try {
    const fromQuery = new URLSearchParams(window.location.search).get('showRollbackButton');
    if (fromQuery !== null) {
      return parseBoolFlag(fromQuery.toLowerCase());
    }
    const raw = window.localStorage.getItem(SHOW_ROLLBACK_BUTTON_STORAGE_KEY);
    if (raw === null) return true;
    return parseBoolFlag(raw.toLowerCase());
  } catch {
    return true;
  }
}

export function getShowRollbackButtonSetting(): boolean {
  return showRollbackButtonSetting;
}

export function setShowRollbackButtonSetting(show: boolean): void {
  showRollbackButtonSetting = show;
  try {
    window.localStorage.setItem(SHOW_ROLLBACK_BUTTON_STORAGE_KEY, show ? 'true' : 'false');
  } catch {
    // localStorage unavailable or full – silently ignore
  }
}

function loadThreatBudgetSetting(): number {
  try {
    const fromQuery = new URLSearchParams(window.location.search).get('threatBudget');
    if (fromQuery !== null) {
      const parsed = parseFloat(fromQuery);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    const raw = window.localStorage.getItem(THREAT_BUDGET_STORAGE_KEY);
    if (raw === null) return 500;
    const parsed = parseFloat(raw);
    if (isNaN(parsed) || parsed <= 0) return 500;
    return parsed;
  } catch {
    return 500;
  }
}

export function getThreatBudgetSetting(): number {
  return threatBudgetSetting;
}

export function setThreatBudgetSetting(value: number): void {
  threatBudgetSetting = value;
  try {
    window.localStorage.setItem(THREAT_BUDGET_STORAGE_KEY, value.toString());
  } catch {
    // localStorage unavailable or full – silently ignore
  }
}
