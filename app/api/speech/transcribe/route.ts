import { getLlmConfig } from '@/lib/llm'

export const runtime = 'nodejs'

const MAX_AUDIO_BYTES = 25 * 1024 * 1024

export async function POST(request: Request) {
  const { apiKey, baseUrl, transcribeModel, provider } = getLlmConfig()
  if (!apiKey) {
    return Response.json(
      { error: 'Clé API manquante. Ajoutez OPENAI_API_KEY dans .env (clé Groq gsk_… ou OpenAI sk-…).' },
      { status: 503 },
    )
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return Response.json({ error: 'Audio invalide.' }, { status: 400 })
  }

  const audio = formData.get('audio')
  if (!(audio instanceof File) || audio.size === 0) {
    return Response.json({ error: 'Aucun enregistrement audio reçu.' }, { status: 400 })
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: 'Enregistrement trop long (max 25 Mo).' }, { status: 413 })
  }

  const upstream = new FormData()
  const filename = audio.name || 'recording.webm'
  upstream.append('file', audio, filename)
  upstream.append('model', transcribeModel)
  upstream.append('language', 'fr')
  upstream.append('response_format', 'json')

  try {
    const response = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstream,
    })

    if (!response.ok) {
      const detail = await response.text()
      console.error(`${provider} whisper error:`, response.status, detail)
      if (response.status === 401) {
        return Response.json(
          { error: `Clé ${provider} invalide. Vérifiez OPENAI_API_KEY dans .env.` },
          { status: 502 },
        )
      }
      return Response.json(
        { error: 'La transcription vocale a échoué. Réessayez dans un instant.' },
        { status: 502 },
      )
    }

    const data = (await response.json()) as { text?: string }
    const text = data.text?.trim()
    if (!text) {
      return Response.json({ error: 'Aucune parole détectée. Réessayez.' }, { status: 422 })
    }

    return Response.json({ text })
  } catch (error) {
    console.error('Transcribe route failed:', error)
    return Response.json({ error: 'Impossible de contacter le service de transcription.' }, { status: 502 })
  }
}
