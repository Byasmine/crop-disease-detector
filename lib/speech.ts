const SPEECH_LANG = 'fr-FR'
const LIVE_SLICE_MS = 400

export function isSpeechSynthesisSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function isAudioRecordingSupported() {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'
  )
}

function pickMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
}

export type AudioRecorderHandle = {
  getSnapshot: () => Blob | null
  stop: () => Promise<Blob>
  cancel: () => void
}

export async function startAudioRecording(): Promise<AudioRecorderHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const mimeType = pickMimeType()
  const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
  const chunks: BlobPart[] = []
  const resolvedType = mimeType || 'audio/webm'

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }

  recorder.start(LIVE_SLICE_MS)

  const stopTracks = () => {
    stream.getTracks().forEach((track) => track.stop())
  }

  const buildBlob = () => {
    if (chunks.length === 0) return null
    return new Blob(chunks, { type: recorder.mimeType || resolvedType })
  }

  return {
    getSnapshot: () => buildBlob(),
    stop: () =>
      new Promise<Blob>((resolve, reject) => {
        recorder.onerror = () => {
          stopTracks()
          reject(new Error('Échec de l’enregistrement audio.'))
        }
        recorder.onstop = () => {
          stopTracks()
          resolve(new Blob(chunks, { type: recorder.mimeType || resolvedType }))
        }
        if (recorder.state !== 'inactive') {
          try {
            recorder.requestData()
          } catch {
            // ignore
          }
          recorder.stop()
        } else {
          stopTracks()
          resolve(new Blob([], { type: resolvedType }))
        }
      }),
    cancel: () => {
      try {
        if (recorder.state !== 'inactive') recorder.stop()
      } catch {
        // ignore
      }
      stopTracks()
    },
  }
}

export async function transcribeAudio(blob: Blob, signal?: AbortSignal) {
  const extension = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm'
  const formData = new FormData()
  formData.append('audio', blob, `recording.${extension}`)

  const response = await fetch('/api/speech/transcribe', {
    method: 'POST',
    body: formData,
    signal,
  })
  const data = (await response.json()) as { text?: string; error?: string }
  if (!response.ok || !data.text) {
    throw new Error(data.error || 'Échec de la transcription.')
  }
  return data.text
}

export function speakText(text: string, onEnd?: () => void) {
  if (!isSpeechSynthesisSupported()) {
    onEnd?.()
    return
  }

  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = SPEECH_LANG
  utterance.rate = 1
  utterance.pitch = 1

  const voices = window.speechSynthesis.getVoices()
  const frenchVoice =
    voices.find((v) => v.lang.toLowerCase().startsWith('fr') && /google|microsoft|thomas|julie|hortense|denise/i.test(v.name)) ||
    voices.find((v) => v.lang.toLowerCase().startsWith('fr'))
  if (frenchVoice) utterance.voice = frenchVoice

  utterance.onend = () => onEnd?.()
  utterance.onerror = () => onEnd?.()
  window.speechSynthesis.speak(utterance)
}

export function pauseSpeaking() {
  if (!isSpeechSynthesisSupported()) return
  if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
    window.speechSynthesis.pause()
  }
}

export function resumeSpeaking() {
  if (!isSpeechSynthesisSupported()) return
  if (window.speechSynthesis.paused) {
    window.speechSynthesis.resume()
  }
}

export function stopSpeaking() {
  if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel()
}

export function getSpeechPlaybackState(): 'idle' | 'playing' | 'paused' {
  if (!isSpeechSynthesisSupported()) return 'idle'
  if (window.speechSynthesis.paused) return 'paused'
  if (window.speechSynthesis.speaking) return 'playing'
  return 'idle'
}

export function stripMarkdown(text: string) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/^[-*•]\s+/gm, '')
    .replace(/^\d+[.)]\s+/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
