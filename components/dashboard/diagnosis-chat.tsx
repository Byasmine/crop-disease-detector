'use client'

import { useEffect, useRef, useState } from 'react'
import { ChatMarkdown } from '@/components/dashboard/chat-markdown'
import { Button } from '@/components/ui/button'
import { formatLabel, type Analysis } from '@/lib/history'
import {
  type AudioRecorderHandle,
  isAudioRecordingSupported,
  isSpeechSynthesisSupported,
  pauseSpeaking,
  resumeSpeaking,
  speakText,
  startAudioRecording,
  stopSpeaking,
  stripMarkdown,
  transcribeAudio,
} from '@/lib/speech'
import { Loader2, MessageCircle, Mic, MicOff, Pause, Play, RotateCcw, SendHorizontal, Square, Volume2 } from 'lucide-react'

type ChatRole = 'user' | 'assistant'

type ChatMessage = {
  id: string
  role: ChatRole
  content: string
}

const LIVE_TRANSCRIBE_MS = 1600
const MIN_LIVE_BYTES = 2500

const suggestions = [
  'Que faire concrètement maintenant ?',
  'Quels signes surveiller sur les autres plants ?',
  'Comment éviter que ça se propage ?',
]

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function DiagnosisChat({ result }: { result: Analysis }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const [isSpeechPaused, setIsSpeechPaused] = useState(false)
  const [sttSupported, setSttSupported] = useState(false)
  const [ttsSupported, setTtsSupported] = useState(false)

  const listRef = useRef<HTMLDivElement>(null)
  const recorderRef = useRef<AudioRecorderHandle | null>(null)
  const liveTimerRef = useRef<number | null>(null)
  const liveAbortRef = useRef<AbortController | null>(null)
  const liveRequestIdRef = useRef(0)

  useEffect(() => {
    setSttSupported(isAudioRecordingSupported())
    setTtsSupported(isSpeechSynthesisSupported())
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.getVoices()
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices()
      }
    }
  }, [])

  function clearLiveLoop() {
    if (liveTimerRef.current != null) {
      window.clearInterval(liveTimerRef.current)
      liveTimerRef.current = null
    }
    liveAbortRef.current?.abort()
    liveAbortRef.current = null
  }

  useEffect(() => {
    setMessages([])
    setInput('')
    setError(null)
    setIsLoading(false)
    setIsListening(false)
    setIsTranscribing(false)
    setSpeakingId(null)
    setIsSpeechPaused(false)
    stopSpeaking()
    clearLiveLoop()
    recorderRef.current?.cancel()
    recorderRef.current = null
  }, [result.id])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, isLoading])

  useEffect(() => {
    return () => {
      stopSpeaking()
      clearLiveLoop()
      recorderRef.current?.cancel()
    }
  }, [])

  function startAssistantSpeech(messageId: string, text: string) {
    setSpeakingId(messageId)
    setIsSpeechPaused(false)
    speakText(stripMarkdown(text), () => {
      setSpeakingId((current) => (current === messageId ? null : current))
      setIsSpeechPaused(false)
    })
  }

  function togglePauseResume() {
    if (!speakingId) return
    if (isSpeechPaused) {
      resumeSpeaking()
      setIsSpeechPaused(false)
      return
    }
    pauseSpeaking()
    setIsSpeechPaused(true)
  }

  function stopAssistantSpeech() {
    stopSpeaking()
    setSpeakingId(null)
    setIsSpeechPaused(false)
  }

  function playAssistant(messageId: string, text: string) {
    if (!ttsSupported) return
    if (speakingId === messageId) {
      togglePauseResume()
      return
    }
    startAssistantSpeech(messageId, text)
  }

  async function runLiveTranscribe() {
    const recorder = recorderRef.current
    if (!recorder) return

    const snapshot = recorder.getSnapshot()
    if (!snapshot || snapshot.size < MIN_LIVE_BYTES) return

    liveAbortRef.current?.abort()
    const controller = new AbortController()
    liveAbortRef.current = controller
    const requestId = ++liveRequestIdRef.current

    try {
      const text = await transcribeAudio(snapshot, controller.signal)
      if (requestId !== liveRequestIdRef.current) return
      if (text.trim()) setInput(text.trim())
    } catch (err) {
      if (controller.signal.aborted) return
      // Keep listening even if one partial fails; show soft error only once in a while
      if (err instanceof Error && !err.message.includes('aucune parole')) {
        // ignore transient partial failures during live dictation
      }
    }
  }

  function startLiveLoop() {
    clearLiveLoop()
    liveTimerRef.current = window.setInterval(() => {
      void runLiveTranscribe()
    }, LIVE_TRANSCRIBE_MS)
    // First pass a bit earlier so text appears sooner
    window.setTimeout(() => {
      void runLiveTranscribe()
    }, 900)
  }

  async function sendMessage(raw: string) {
    const content = raw.trim()
    if (!content || isLoading || isTranscribing) return

    if (isListening) {
      clearLiveLoop()
      recorderRef.current?.cancel()
      recorderRef.current = null
      setIsListening(false)
    }

    const userMessage: ChatMessage = { id: newId(), role: 'user', content }
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setInput('')
    setError(null)
    setIsLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content: text }) => ({ role, content: text })),
          diagnosis: {
            crop: result.crop,
            label: result.label,
            confidence: result.confidence,
            status: result.status,
          },
        }),
      })

      const data = (await response.json()) as { reply?: string; error?: string }
      if (!response.ok || !data.reply) {
        throw new Error(data.error || 'Échec de la réponse.')
      }

      const assistantMessage: ChatMessage = { id: newId(), role: 'assistant', content: data.reply }
      setMessages((prev) => [...prev, assistantMessage])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    } finally {
      setIsLoading(false)
    }
  }

  async function toggleListening() {
    if (!sttSupported) {
      setError('Le micro n’est pas disponible sur ce navigateur.')
      return
    }

    if (isListening) {
      const recorder = recorderRef.current
      recorderRef.current = null
      clearLiveLoop()
      setIsListening(false)
      if (!recorder) return

      setIsTranscribing(true)
      setError(null)
      try {
        const blob = await recorder.stop()
        if (blob.size < 800) {
          throw new Error('Enregistrement trop court. Réessayez.')
        }
        const text = await transcribeAudio(blob)
        setInput(text)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Transcription impossible.')
      } finally {
        setIsTranscribing(false)
      }
      return
    }

    stopSpeaking()
    setSpeakingId(null)
    setIsSpeechPaused(false)
    setError(null)
    setInput('')

    try {
      const recorder = await startAudioRecording()
      recorderRef.current = recorder
      setIsListening(true)
      startLiveLoop()
    } catch {
      setError('Micro refusé. Autorisez l’accès au microphone.')
      setIsListening(false)
    }
  }

  return (
    <div className="mt-5 border-t border-border pt-4">
      <div className="mb-3 flex items-center gap-2">
        <MessageCircle className="size-4 text-success" />
        <div>
          <p className="text-sm font-medium text-foreground">Assistant diagnostic</p>
          <p className="text-xs text-muted-foreground">
            Posez une question sur {formatLabel(result.label)} ({result.crop})
          </p>
        </div>
      </div>

      {messages.length === 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => sendMessage(suggestion)}
              disabled={isLoading || isTranscribing}
              className="rounded-md border border-border bg-card px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-success/40 hover:bg-success-soft/40 hover:text-foreground disabled:opacity-50"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      <div
        ref={listRef}
        className="mb-3 max-h-56 space-y-2 overflow-y-auto rounded-lg border border-border bg-card/70 p-3"
      >
        {messages.length === 0 && !isLoading && (
          <p className="text-xs text-muted-foreground">
            Exemple : « Est-ce grave pour le reste de la parcelle ? » — ou utilisez le micro.
          </p>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex max-w-[92%] items-end gap-1.5 ${
              message.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
            }`}
          >
            <div
              className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${
                message.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-mist text-foreground'
              }`}
            >
              {message.role === 'assistant' ? (
                <ChatMarkdown content={message.content} />
              ) : (
                message.content
              )}
            </div>
            {message.role === 'assistant' && ttsSupported && (
              <div className="mb-0.5 flex shrink-0 flex-col gap-0.5">
                {speakingId !== message.id ? (
                  <button
                    type="button"
                    onClick={() => playAssistant(message.id, message.content)}
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="Écouter la réponse"
                    title="Écouter"
                  >
                    <Volume2 className="size-3.5" />
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={togglePauseResume}
                      className="rounded-md p-1 text-success transition-colors hover:bg-muted"
                      aria-label={isSpeechPaused ? 'Reprendre la lecture' : 'Mettre en pause'}
                      title={isSpeechPaused ? 'Reprendre' : 'Pause'}
                    >
                      {isSpeechPaused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => startAssistantSpeech(message.id, message.content)}
                      className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label="Relancer depuis le début"
                      title="Relancer"
                    >
                      <RotateCcw className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={stopAssistantSpeech}
                      className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label="Arrêter la lecture"
                      title="Arrêter"
                    >
                      <Square className="size-3.5" />
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="mr-auto flex items-center gap-2 rounded-lg bg-mist px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Réflexion en cours…
          </div>
        )}
      </div>

      {error && <p className="mb-2 text-xs text-danger">{error}</p>}
      {isListening && (
        <div className="mb-2 rounded-lg border border-success/30 bg-success-soft/50 px-3 py-2">
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-success">
            <span className="size-1.5 animate-pulse rounded-full bg-success" />
            Texte en direct
          </p>
          <p className="min-h-5 text-sm leading-snug text-foreground">
            {input || <span className="text-muted-foreground">Parlez… le texte va s’écrire ici</span>}
            {input ? <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-success align-middle" /> : null}
          </p>
        </div>
      )}
      {isTranscribing && !isListening && (
        <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Finalisation de la transcription…
        </p>
      )}

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void sendMessage(input)
        }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={isListening ? 'Le texte s’écrit pendant que vous parlez…' : isTranscribing ? 'Transcription…' : 'Votre question…'}
          disabled={isLoading || isTranscribing}
          className={`h-9 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm outline-none ring-ring/40 placeholder:text-muted-foreground focus:ring-2 disabled:opacity-60 ${
            isListening ? 'border-success/50' : 'border-border'
          }`}
        />
        {sttSupported && (
          <Button
            type="button"
            size="icon"
            variant={isListening ? 'destructive' : 'outline'}
            onClick={() => void toggleListening()}
            disabled={isLoading || isTranscribing}
            aria-label={isListening ? 'Arrêter le micro' : 'Dicter au micro'}
            aria-pressed={isListening}
          >
            {isTranscribing ? <Loader2 className="animate-spin" /> : isListening ? <MicOff /> : <Mic />}
          </Button>
        )}
        <Button
          type="submit"
          size="icon"
          disabled={isLoading || isTranscribing || !input.trim()}
          aria-label="Envoyer"
        >
          {isLoading ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
        </Button>
      </form>
    </div>
  )
}
