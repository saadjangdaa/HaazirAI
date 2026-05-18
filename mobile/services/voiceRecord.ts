import * as FileSystem from 'expo-file-system/legacy';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import AudioModule from 'expo-audio/build/AudioModule';
import { createRecordingOptions } from 'expo-audio/build/utils/options';
import type { AudioRecorder } from 'expo-audio/build/AudioModule.types';
import { formatApiError, transcribeVoiceAudio } from './api';

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
  const options = createRecordingOptions(RecordingPresets.HIGH_QUALITY);
  const recorder = new AudioModule.AudioRecorder(options);
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
