const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8000'

export type HealthResponse = {
  status: string
  models: Record<string, { file: boolean; loaded: boolean; error: string | null }>
}

export type AnalyzeResponse = {
  crop: string
  prediction: string
  class_name: string
  confidence: number
  is_healthy: boolean
  detections: unknown[]
}

export function getApiBaseUrl() {
  return API_BASE.replace(/\/$/, '')
}

async function parseApiError(response: Response): Promise<string> {
  try {
    const body = await response.json()
    if (typeof body?.detail === 'string') return body.detail
    if (Array.isArray(body?.detail)) return body.detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join(', ')
  } catch {
    // ignore JSON parse errors
  }
  return `Erreur API (${response.status})`
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${getApiBaseUrl()}/health`, { cache: 'no-store' })
  if (!response.ok) throw new Error(await parseApiError(response))
  return response.json()
}

export async function analyzeLeaf(crop: string, image: File): Promise<AnalyzeResponse> {
  const formData = new FormData()
  formData.append('image', image)
  formData.append('crop', crop)

  const response = await fetch(`${getApiBaseUrl()}/analyze`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) throw new Error(await parseApiError(response))
  return response.json()
}
