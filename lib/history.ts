export type Crop = 'Tomate' | 'Pomme de terre' | 'Maïs'
export type Status = 'Sain' | 'À surveiller' | 'Maladie détectée'

export type Analysis = {
  id: string
  crop: Crop
  label: string
  confidence: number
  date: string
  status: Status
  scannedAt: number
}

const HISTORY_KEY = 'smart-agri-ia-history'

export const seedHistory: Analysis[] = [
  { id: 'seed-1', crop: 'Tomate', label: 'healthy', confidence: 98.4, date: 'Aujourd’hui, 09:42', status: 'Sain', scannedAt: Date.now() - 3_600_000 },
  { id: 'seed-2', crop: 'Pomme de terre', label: 'early_blight', confidence: 91.7, date: 'Hier, 16:18', status: 'Maladie détectée', scannedAt: Date.now() - 86_400_000 },
  { id: 'seed-3', crop: 'Maïs', label: 'rust', confidence: 87.2, date: '12 juin, 11:06', status: 'À surveiller', scannedAt: Date.now() - 172_800_000 },
]

export function formatLabel(label: string) {
  return label.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function formatAnalysisDate(date = new Date()) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function loadHistory(): Analysis[] {
  if (typeof window === 'undefined') return seedHistory
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return seedHistory
    const parsed = JSON.parse(raw) as Analysis[]
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : seedHistory
  } catch {
    return seedHistory
  }
}

export function saveHistory(items: Analysis[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items))
}

export function computeMetrics(history: Analysis[]) {
  const totalScans = history.length
  const highestConfidence = history.length ? Math.max(...history.map((h) => h.confidence)) : 0
  const avgConfidence = history.length
    ? Math.round((history.reduce((sum, h) => sum + h.confidence, 0) / history.length) * 10) / 10
    : 0
  const alertsCount = history.filter((h) => h.status === 'Maladie détectée').length
  const healthyCount = history.filter((h) => h.status === 'Sain').length
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const scansToday = history.filter((h) => h.scannedAt >= todayStart.getTime()).length

  return { totalScans, highestConfidence, avgConfidence, alertsCount, healthyCount, scansToday }
}
