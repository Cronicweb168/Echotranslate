
export enum RecordingState {
  IDLE = 'IDLE',
  REQUESTING_PERMISSION = 'REQUESTING_PERMISSION',
  RECORDING = 'RECORDING',
  STOPPING = 'STOPPING',
  TRANSLATING = 'TRANSLATING',
  ERROR = 'ERROR',
}

export interface HistoryEntry {
  id: string;
  timestamp: string;
  transcribedText: string;
  translatedText: string;
  targetLanguage: string;
}

export interface Language {
  code: string;
  name: string;
}
