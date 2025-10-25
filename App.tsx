
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveSession, Modality, LiveServerMessage } from '@google/genai';
import { RecordingState, HistoryEntry } from './types';
import LanguageSelector from './components/LanguageSelector';
import RecordButton from './components/RecordButton';
import IconButton from './components/IconButton';
import { TARGET_LANGUAGES } from './constants';

// Audio helper functions
function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function createBlob(data: Float32Array): { data: string; mimeType: string } {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}


const App: React.FC = () => {
  const [recordingState, setRecordingState] = useState<RecordingState>(RecordingState.IDLE);
  const [transcribedText, setTranscribedText] = useState<string>('');
  const [translatedText, setTranslatedText] = useState<string>('');
  const [targetLanguage, setTargetLanguage] = useState<string>('es');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const currentTranscriptionRef = useRef<string>('');

  // FIX: Use a ref to hold the latest recording state to avoid stale state in callbacks.
  const recordingStateRef = useRef(recordingState);
  useEffect(() => {
    recordingStateRef.current = recordingState;
  }, [recordingState]);

  useEffect(() => {
    try {
      const storedHistory = localStorage.getItem('transcriptionHistory');
      if (storedHistory) {
        setHistory(JSON.parse(storedHistory));
      }
    } catch (e) {
      console.error("Failed to load history from localStorage", e);
    }
  }, []);

  const saveToHistory = (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => {
    setHistory(prevHistory => {
      const newEntry: HistoryEntry = {
        ...entry,
        id: new Date().toISOString(),
        timestamp: new Date().toLocaleString(),
      };
      const updatedHistory = [newEntry, ...prevHistory].slice(0, 20); // Keep last 20 entries
      try {
        localStorage.setItem('transcriptionHistory', JSON.stringify(updatedHistory));
      } catch (e) {
        console.error("Failed to save history to localStorage", e);
      }
      return updatedHistory;
    });
  };

  const translateText = useCallback(async (textToTranslate: string, language: string) => {
    if (!textToTranslate.trim()) return;

    setRecordingState(RecordingState.TRANSLATING);
    setTranslatedText('Translating...');
    setError(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
      const selectedLanguageName = TARGET_LANGUAGES.find(l => l.code === language)?.name || language;
      const prompt = `Translate the following text to ${selectedLanguageName}: "${textToTranslate}"`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      const translation = response.text;
      setTranslatedText(translation);
      saveToHistory({
        transcribedText: textToTranslate,
        translatedText: translation,
        targetLanguage: selectedLanguageName,
      });
    } catch (e) {
      console.error('Translation error:', e);
      const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred during translation.';
      setError(`Translation failed: ${errorMessage}`);
      setTranslatedText('');
    } finally {
      setRecordingState(RecordingState.IDLE);
    }
  }, []);

  const stopRecording = useCallback(async () => {
    // FIX: Use ref to get latest state in callback and prevent re-entry.
    if (recordingStateRef.current !== RecordingState.RECORDING) {
      return;
    }
    setRecordingState(RecordingState.STOPPING);
    
    if (sessionPromiseRef.current) {
      const session = await sessionPromiseRef.current;
      session.close();
      sessionPromiseRef.current = null;
    }
    
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
    }

    if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current = null;
    }
    
    if (mediaStreamSourceRef.current) {
        mediaStreamSourceRef.current.disconnect();
        mediaStreamSourceRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        await audioContextRef.current.close();
        audioContextRef.current = null;
    }

    // If there's pending transcribed text, translate it
    if(currentTranscriptionRef.current.trim()){
        const finalText = currentTranscriptionRef.current;
        currentTranscriptionRef.current = '';
        setTranscribedText(finalText);
        translateText(finalText, targetLanguage);
    } else {
        setRecordingState(RecordingState.IDLE);
    }
  }, [targetLanguage, translateText]);

  const handleMessage = (message: LiveServerMessage) => {
    if (message.serverContent?.inputTranscription) {
      const text = message.serverContent.inputTranscription.text;
      currentTranscriptionRef.current += text;
      setTranscribedText(currentTranscriptionRef.current);
    }
    // FIX: On turn complete, stop the recording session to clean up resources and translate.
    if (message.serverContent?.turnComplete) {
      stopRecording();
    }
  };

  const handleError = (e: ErrorEvent) => {
    console.error('Live session error:', e);
    setError(`An error occurred: ${e.message}. Please try again.`);
    stopRecording();
    setRecordingState(RecordingState.ERROR);
  };

  const handleClose = () => {
    console.log('Live session closed.');
  };

  const startRecording = async () => {
    if (recordingState === RecordingState.RECORDING) {
        stopRecording();
        return;
    }

    setRecordingState(RecordingState.REQUESTING_PERMISSION);
    setError(null);
    setTranscribedText('');
    setTranslatedText('');
    currentTranscriptionRef.current = '';
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            console.log('Live session opened.');
            setRecordingState(RecordingState.RECORDING);
            
            // FIX: Add type assertion for webkitAudioContext for cross-browser compatibility.
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            audioContextRef.current = new AudioContext({ sampleRate: 16000 });
            
            const source = audioContextRef.current.createMediaStreamSource(stream);
            mediaStreamSourceRef.current = source;
            
            const scriptProcessor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = scriptProcessor;
            
            scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              // FIX: Use sessionPromise directly to avoid stale closures, as per Gemini API guidelines.
              sessionPromise.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContextRef.current.destination);
          },
          onmessage: handleMessage,
          onerror: handleError,
          onclose: handleClose,
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
        },
      });

      sessionPromiseRef.current = sessionPromise;

    } catch (err) {
      console.error('Error starting recording:', err);
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      if (errorMessage.includes('Permission denied')) {
        setError('Microphone permission denied. Please allow microphone access in your browser settings.');
      } else {
        setError(`Failed to start recording: ${errorMessage}`);
      }
      setRecordingState(RecordingState.ERROR);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      // Maybe show a toast notification here in a real app
      console.log('Copied to clipboard');
    });
  };

  const deleteHistoryItem = (id: string) => {
    setHistory(prev => {
        const newHistory = prev.filter(item => item.id !== id);
        localStorage.setItem('transcriptionHistory', JSON.stringify(newHistory));
        return newHistory;
    });
  };

  return (
    <div className="min-h-screen text-gray-800 dark:text-gray-200 p-4 sm:p-6 lg:p-8 flex flex-col font-sans">
      <header className="text-center mb-8">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-purple-500">
          EchoTranslate AI
        </h1>
        <p className="mt-2 text-lg text-gray-600 dark:text-gray-400">
          Real-time Transcription and Translation with Gemini
        </p>
      </header>

      <main className="flex-grow w-full max-w-4xl mx-auto flex flex-col gap-6">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <RecordButton recordingState={recordingState} onClick={startRecording} />
            <LanguageSelector
              selectedLanguage={targetLanguage}
              onLanguageChange={setTargetLanguage}
              disabled={recordingState !== RecordingState.IDLE && recordingState !== RecordingState.ERROR}
            />
          </div>
          {error && <div className="mt-4 text-center text-red-500 bg-red-100 dark:bg-red-900/30 p-3 rounded-lg">{error}</div>}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-grow">
          {/* Transcription Card */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 flex flex-col">
            <h2 className="text-xl font-bold mb-3 text-gray-700 dark:text-gray-300">Transcription</h2>
            <div className="flex-grow min-h-[150px] p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg overflow-y-auto text-gray-800 dark:text-gray-200">
              {transcribedText || <span className="text-gray-400 dark:text-gray-500">Your transcribed text will appear here...</span>}
            </div>
          </div>
          {/* Translation Card */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 flex flex-col">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-xl font-bold text-gray-700 dark:text-gray-300">Translation</h2>
              {translatedText && recordingState !== RecordingState.TRANSLATING && (
                <IconButton onClick={() => copyToClipboard(translatedText)} label="Copy translation">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                </IconButton>
              )}
            </div>
            <div className="flex-grow min-h-[150px] p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg overflow-y-auto text-indigo-800 dark:text-indigo-300 font-medium">
              {translatedText || <span className="text-gray-400 dark:text-gray-500 font-normal">Translated text will appear here...</span>}
            </div>
          </div>
        </div>

        {/* History Section */}
        {history.length > 0 && (
          <div className="mt-6">
            <h2 className="text-2xl font-bold mb-4 text-center text-gray-700 dark:text-gray-300">History</h2>
            <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
              {history.map(item => (
                <div key={item.id} className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700 transition-all hover:shadow-md">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{item.timestamp} - to {item.targetLanguage}</p>
                      <p className="mt-2 text-gray-600 dark:text-gray-300"><strong>Original:</strong> {item.transcribedText}</p>
                      <p className="mt-1 text-indigo-600 dark:text-indigo-400"><strong>Translated:</strong> {item.translatedText}</p>
                    </div>
                    <IconButton onClick={() => deleteHistoryItem(item.id)} label="Delete history item">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </IconButton>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
