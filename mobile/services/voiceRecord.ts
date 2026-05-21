import * as FileSystem from 'expo-file-system/legacy';
import {
  AudioModule,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { formatApiError, transcribeVoiceAudio } from './api';

// AudioRecorder is type-only in expo-audio's re-exports; the live constructor lives on AudioModule
type AudioRecorder = InstanceType<typeof AudioModule.AudioRecorder>;

let _recording: AudioRecorder | null = null;

export async function requestMicPermission(): Promise<boolean> {
  const { granted } = await requestRecordingPermissionsAsync();
  return granted;
}

export async function startRecording(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
  });
  const recorder = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);
  await recorder.prepareToRecordAsync();
  recorder.record();
  _recording = recorder;
}

export async function stopAndTranscribe(): Promise<{ text: string; language: string }> {
  if (!_recording) throw new Error('No active recording');

  await _recording.stop();
  const uri = _recording.uri;
  _recording = null;

  if (!uri) throw new Error('Recording URI missing');

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  try {
    const data = await transcribeVoiceAudio(base64, 'audio/m4a');
    if (!data.text?.trim()) {
      throw new Error('Empty transcription');
    }
    return { text: data.text, language: data.detected_language };
  } catch (err) {
    throw new Error(formatApiError(err));
  }
}
