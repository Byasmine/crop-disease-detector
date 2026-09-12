import { formatLabel, type Analysis } from '@/lib/history'
import { getLlmConfig } from '@/lib/llm'

export const runtime = 'nodejs'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

type ChatBody = {
  messages?: ChatMessage[]
  diagnosis?: Pick<Analysis, 'crop' | 'label' | 'confidence' | 'status'>
}

type LlmMessageContent =
  | string
  | null
  | Array<{ type?: string; text?: string }>

type LlmChatResponse = {
  choices?: {
    finish_reason?: string
    message?: {
      content?: LlmMessageContent
      reasoning?: string
    }
  }[]
  usage?: unknown
}

const MAX_MESSAGES = 20
const MAX_CONTENT_LENGTH = 2000

function buildSystemPrompt(diagnosis: ChatBody['diagnosis']) {
  const crop = diagnosis?.crop ?? 'plante'
  const label = diagnosis?.label ? formatLabel(diagnosis.label) : 'inconnu'
  const confidence = typeof diagnosis?.confidence === 'number' ? `${diagnosis.confidence.toFixed(0)}%` : 'n/a'
  const status = diagnosis?.status ?? 'inconnu'

  return `Tu es un ingénieur agronome / phytopathologiste de terrain pour SMART AGRI IA.
Tu réponds comme un professionnel : objectif, précis, sans blabla.

Diagnostic machine (à prendre comme hypothèse de travail) :
- Culture : ${crop}
- Suspicion : ${label}
- Statut : ${status}
- Confiance modèle : ${confidence}

Style de réponse (obligatoire) :
- Français soutenu, ton neutre et professionnel.
- Court : 40 à 90 mots maximum (sauf si l’utilisateur demande explicitement plus de détail).
- Aller droit au but : 1 constat + 2 à 4 actions concrètes maximum.
- Pas d’introduction type « Bien sûr », « Absolument », « Voici… ».
- Pas de dramatisation, pas de marketing, pas de phrases vagues.
- Objectif : ce qui est utile maintenant sur la parcelle.

Format markdown autorisé (strict) :
- Listes à puces courtes avec "-" uniquement.
- Gras (**texte**) seulement pour 1 ou 2 termes clés si utile.
- Interdit : titres (#), numérotation longue (1. 2. 3. avec sous-points), tableaux, emojis, blocs de code.
- Une ligne vide max entre les blocs.

Contenu métier :
- Base-toi sur le diagnostic ; si confiance < 70 %, dis clairement qu’il faut confirmer visuellement.
- Priorise : observation, confinement, hygiène, gestion de l’humidité / irrigation, suivi 24–72 h.
- Ne prescrit aucun produit phytosanitaire, dose, ni marque. Renvoie vers un conseiller agricole local si un traitement chimique est envisagé.
- Si la question sort du sujet cultures / maladies foliaires, recentre en une phrase.`
}

function extractReply(content: LlmMessageContent | undefined): string {
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('')
      .trim()
  }
  return ''
}

export async function POST(request: Request) {
  const { apiKey, baseUrl, chatModel, provider } = getLlmConfig()
  if (!apiKey) {
    return Response.json(
      { error: 'Clé API manquante. Ajoutez OPENAI_API_KEY dans .env (clé Groq gsk_… ou OpenAI sk-…).' },
      { status: 503 },
    )
  }

  let body: ChatBody
  try {
    body = (await request.json()) as ChatBody
  } catch {
    return Response.json({ error: 'Requête invalide.' }, { status: 400 })
  }

  const incoming = Array.isArray(body.messages) ? body.messages : []
  const messages = incoming
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_MESSAGES)
    .map((m) => ({
      role: m.role,
      content: m.content.trim().slice(0, MAX_CONTENT_LENGTH),
    }))
    .filter((m) => m.content.length > 0)

  if (messages.length === 0 || messages[messages.length - 1]?.role !== 'user') {
    return Response.json({ error: 'Message utilisateur requis.' }, { status: 400 })
  }

  const isReasoningModel = /gpt-oss|o1|o3|reason/i.test(chatModel)

  try {
    const payload: Record<string, unknown> = {
      model: chatModel,
      temperature: 0.2,
      // Reasoning models (gpt-oss) spend tokens on internal "reasoning" first.
      max_tokens: isReasoningModel ? 1200 : 450,
      messages: [{ role: 'system', content: buildSystemPrompt(body.diagnosis) }, ...messages],
    }

    // Groq gpt-oss: keep reasoning short so content is not truncated away.
    if (provider === 'groq' && /gpt-oss/i.test(chatModel)) {
      payload.reasoning_effort = 'low'
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const detail = await response.text()
      console.error(`${provider} chat error:`, response.status, detail)
      if (response.status === 401) {
        return Response.json(
          { error: `Clé ${provider} invalide. Vérifiez OPENAI_API_KEY dans .env.` },
          { status: 502 },
        )
      }
      return Response.json(
        { error: 'Le service de chat est temporairement indisponible.' },
        { status: 502 },
      )
    }

    const data = (await response.json()) as LlmChatResponse
    const choice = data.choices?.[0]
    const reply = extractReply(choice?.message?.content)

    if (!reply) {
      console.error(`${provider} empty chat reply:`, {
        finish_reason: choice?.finish_reason,
        usage: data.usage,
        has_reasoning: Boolean(choice?.message?.reasoning),
      })
      return Response.json(
        {
          error:
            choice?.finish_reason === 'length'
              ? 'Réponse tronquée par le modèle. Réessayez.'
              : 'Réponse vide du modèle. Réessayez.',
        },
        { status: 502 },
      )
    }

    return Response.json({ reply })
  } catch (error) {
    console.error('Chat route failed:', error)
    return Response.json({ error: 'Impossible de contacter le service de chat.' }, { status: 502 })
  }
}
