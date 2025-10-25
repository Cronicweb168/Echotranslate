
import React from 'react';
import { RecordingState } from '../types';

interface RecordButtonProps {
  recordingState: RecordingState;
  onClick: () => void;
}

const RecordButton: React.FC<RecordButtonProps> = ({ recordingState, onClick }) => {
  const getButtonContent = () => {
    switch (recordingState) {
      case RecordingState.RECORDING:
        return (
          <>
            <span className="relative flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500"></span>
            </span>
            <span>Stop Recording</span>
          </>
        );
      case RecordingState.STOPPING:
      case RecordingState.REQUESTING_PERMISSION:
      case RecordingState.TRANSLATING:
        return (
          <>
            <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>{recordingState === RecordingState.TRANSLATING ? 'Processing...' : 'Initializing...'}</span>
          </>
        );
      case RecordingState.IDLE:
      case RecordingState.ERROR:
      default:
        return (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            <span>Start Recording</span>
          </>
        );
    }
  };

  const isDisabled = recordingState === RecordingState.STOPPING || recordingState === RecordingState.REQUESTING_PERMISSION || recordingState === RecordingState.TRANSLATING;
  const baseClasses = "flex items-center justify-center gap-3 w-full py-4 px-6 text-lg font-semibold rounded-full shadow-lg transition-all duration-300 ease-in-out focus:outline-none focus:ring-4";
  const colorClasses = recordingState === RecordingState.RECORDING
    ? "bg-red-600 hover:bg-red-700 text-white focus:ring-red-300"
    : "bg-indigo-600 hover:bg-indigo-700 text-white focus:ring-indigo-300";
  const disabledClasses = isDisabled ? "opacity-60 cursor-not-allowed" : "";

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className={`${baseClasses} ${colorClasses} ${disabledClasses}`}
    >
      {getButtonContent()}
    </button>
  );
};

export default RecordButton;
