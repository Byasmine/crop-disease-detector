'use client'

import { useEffect, useMemo, useRef, useState, useTransition, type ComponentProps } from 'react'
import { analyzeLeaf, fetchHealth } from '@/lib/api'
import { ConfidenceRing } from '@/components/dashboard/confidence-ring'
import { JournalView } from '@/components/dashboard/journal-view'
import { ModelsView } from '@/components/dashboard/models-view'
import {
  type Analysis,
  type Crop,
  computeMetrics,
  formatLabel,
  loadHistory,
  saveHistory,
} from '@/lib/history'
import {
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Crosshair,
  FileImage,
  Loader2,
  Menu,
  Microscope,
  ScanLine,
  ShieldCheck,
  UploadCloud,
  X,
} from 'lucide-react'

type View = 'studio' | 'journal' | 'models'

const crops: { name: Crop; tone: 'tomato' | 'potato' | 'maize'; detail: string }[] = [
  { name: 'Tomate', tone: 'tomato', detail: 'Tomate, cerise, ancienne…' },
  { name: 'Pomme de terre', tone: 'potato', detail: 'Feuilles de pomme de terre' },
  { name: 'Maïs', tone: 'maize', detail: 'Feuilles de maïs' },
]

const navItems: { id: View; label: string; icon: typeof Crosshair }[] = [
  { id: 'studio', label: 'Nouvelle analyse', icon: Crosshair },
  { id: 'journal', label: 'Journal', icon: Clock3 },
  { id: 'models', label: 'Modèles', icon: Microscope },
]

const viewTitles: Record<View, string> = {
  studio: 'Nouvelle analyse',
  journal: 'Journal',
  models: 'Modèles de diagnostic',
}

const advice: Record<string, string[]> = {
  healthy: ['Maintenir le suivi hebdomadaire', 'Conserver une bonne aération'],
  early_blight: ['Isoler les plants touchés', 'Éviter l’arrosage du feuillage'],
  late_blight: ['Retirer le feuillage infecté', 'Contrôler l’humidité de la parcelle'],
  rust: ['Inspecter la parcelle sous 48 h', 'Améliorer la circulation d’air'],
}

function SproutIcon(props: ComponentProps<'svg'>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 22V10" strokeLinecap="round" />
      <path d="M12 10C12 6 9 3 5 3c0 4 3 7 7 7Z" />
      <path d="M12 13c0-3 2.5-5.5 6-6 .5 4-2.5 6.5-6 6Z" />
    </svg>
  )
}

export function AgriDashboard() {
  const [activeView, setActiveView] = useState<View>('studio')
  const [selectedCrop, setSelectedCrop] = useState<Crop>('Tomate')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [result, setResult] = useState<Analysis | null>(null)
  const [history, setHistory] = useState<Analysis[]>([])
  const [error, setError] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [apiOnline, setApiOnline] = useState<boolean | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)

  const metrics = useMemo(() => computeMetrics(history), [history])

  useEffect(() => {
    setHistory(loadHistory())
  }, [])

  useEffect(() => {
    if (history.length > 0) saveHistory(history)
  }, [history])

  useEffect(() => {
    let cancelled = false
    async function ping() {
      try {
        const health = await fetchHealth()
        const allLoaded = Object.values(health.models).every((m) => m.loaded)
        if (!cancelled) setApiOnline(health.status === 'ok' && allLoaded)
      } catch {
        if (!cancelled) setApiOnline(false)
      }
    }
    ping()
    const id = window.setInterval(ping, 12000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  function navigate(view: View) {
    setActiveView(view)
    setMobileOpen(false)
  }

  function chooseFile(nextFile?: File) {
    if (!nextFile) return
    setError(null)
    setResult(null)
    setFile(nextFile)
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(nextFile)
    })
  }

  async function analyze() {
    if (!file) {
      setError('Ajoutez une photo nette de la feuille avant de lancer le diagnostic.')
      return
    }
    setIsAnalyzing(true)
    setError(null)
    try {
      const data = await analyzeLeaf(selectedCrop, file)
      const label = String(data.prediction ?? data.class_name ?? 'Résultat à confirmer')
      const confidence = Math.round((data.confidence ?? 0) * 1000) / 10
      const next: Analysis = {
        id: crypto.randomUUID(),
        crop: selectedCrop,
        label,
        confidence,
        date: 'À l’instant',
        status: data.is_healthy ? 'Sain' : confidence < 55 ? 'À surveiller' : 'Maladie détectée',
        scannedAt: Date.now(),
      }
      startTransition(() => {
        setResult(next)
        setHistory((prev) => [next, ...prev].slice(0, 50))
      })
      window.setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80)
    } catch (err) {
      setError(
        err instanceof Error
          ? 'Le diagnostic n’a pas pu être effectué. Vérifiez que l’application est bien lancée, puis réessayez.'
          : 'Une erreur est survenue. Veuillez réessayer.',
      )
    } finally {
      setIsAnalyzing(false)
    }
  }

  function clearImage() {
    setFile(null)
    setResult(null)
    setError(null)
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }

  return (
    <div className="relative min-h-screen text-foreground">
      <div className="pointer-events-none fixed inset-0 folium-noise opacity-60" />

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[17.5rem] flex-col border-r border-border/80 bg-card/90 px-4 py-5 backdrop-blur-md transition-transform duration-300 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-3 px-2">
          <div className="folium-live flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <SproutIcon className="size-5" />
          </div>
          <div>
            <p className="font-serif text-base font-bold leading-tight tracking-tight">SMART AGRI IA</p>
            <p className="text-[11px] text-muted-foreground">Votre assistant agricole</p>
          </div>
        </div>

        <div className="mt-10 space-y-6 px-1">
          <div>
            <p className="mb-3 px-2 text-xs font-medium text-muted-foreground">Menu</p>
            <div className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon
                const active = activeView === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => navigate(item.id)}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                      active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {item.label}
                    {active && <Icon className="size-3.5 opacity-80" />}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-mist/70 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">État du service</span>
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                  apiOnline ? 'text-success' : apiOnline === false ? 'text-danger' : 'text-muted-foreground'
                }`}
              >
                <span className={`size-1.5 rounded-full ${apiOnline ? 'bg-success' : apiOnline === false ? 'bg-danger' : 'bg-muted-foreground'}`} />
                {apiOnline ? 'Prêt' : apiOnline === false ? 'Indisponible' : 'Vérification…'}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {apiOnline ? 'Vous pouvez analyser vos feuilles.' : 'Le diagnostic sera disponible dès que le service sera prêt.'}
            </p>
          </div>
        </div>
      </aside>

      {mobileOpen && (
        <button aria-label="Fermer le menu" className="fixed inset-0 z-30 bg-ink/25 backdrop-blur-[2px] lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <div className="relative lg:pl-[17.5rem]">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border/70 bg-background/75 px-4 backdrop-blur-md md:px-8">
          <div className="flex items-center gap-3">
            <button aria-label="Ouvrir le menu" className="rounded-lg p-2 hover:bg-muted lg:hidden" onClick={() => setMobileOpen(true)}>
              <Menu className="size-5" />
            </button>
            <div className="hidden items-center gap-2 sm:flex">
              <span className="text-sm font-medium">{viewTitles[activeView]}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
              <ShieldCheck className="size-3.5" />
              Données privées
            </span>
          </div>
        </header>

        <main className="mx-auto max-w-[1280px] px-4 py-8 md:px-8 md:py-10">
          {activeView === 'studio' && (
            <>
              <section className="folium-enter relative overflow-hidden rounded-[1.35rem] border border-border bg-card">
                <div className="absolute inset-0 folium-grid opacity-70" />
                <div className="relative grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
                  <div className="border-b border-border p-6 md:p-9 lg:border-b-0 lg:border-r">
                    <p className="folium-enter mb-4 inline-flex items-center gap-2 text-sm font-medium text-signal">
                      <span className="size-1.5 rounded-full bg-signal" />
                      Diagnostic rapide
                    </p>
                    <h1 className="folium-enter folium-enter-delay-1 max-w-lg font-serif text-3xl font-bold leading-[1.05] tracking-tight text-balance md:text-4xl">
                      SMART AGRI IA
                      <span className="mt-2 block text-xl font-semibold text-muted-foreground md:text-2xl">
                        analyse vos feuilles en quelques secondes.
                      </span>
                    </h1>
                    <p className="folium-enter folium-enter-delay-2 mt-4 max-w-md text-sm leading-6 text-muted-foreground">
                      Photographiez une feuille de tomate, pomme de terre ou maïs et obtenez un diagnostic immédiat, directement sur votre ordinateur.
                    </p>

                    <div className="folium-enter folium-enter-delay-3 mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[
                        { k: 'Analyses', v: String(metrics.totalScans), hint: 'au total' },
                        { k: 'Aujourd’hui', v: String(metrics.scansToday), hint: 'réalisées' },
                        { k: 'Meilleure fiabilité', v: `${metrics.highestConfidence.toFixed(0)}%`, hint: 'résultat le plus sûr' },
                        { k: 'Alertes', v: String(metrics.alertsCount), hint: 'maladies repérées' },
                      ].map((stat) => (
                        <div key={stat.k} className="rounded-xl border border-border/80 bg-mist/60 px-3 py-3">
                          <p className="text-xs text-muted-foreground">{stat.k}</p>
                          <p className="mt-1 font-serif text-2xl font-bold tracking-tight">{stat.v}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{stat.hint}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="relative min-h-[280px] overflow-hidden bg-gradient-to-br from-[#0f3d32] via-[#145644] to-[#1a6b52] p-6 text-primary-foreground md:p-8">
                    <div className="absolute -right-10 -top-10 size-48 rounded-full bg-white/10 blur-2xl" />
                    <div className="absolute bottom-0 left-0 h-32 w-full bg-gradient-to-t from-black/20 to-transparent" />
                    <div className="relative flex h-full flex-col justify-between">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm text-white/70">Comment ça marche</p>
                          <p className="mt-1 font-serif text-2xl font-semibold">Analyse par photo</p>
                        </div>
                        <Microscope className="size-5 text-white/70" />
                      </div>
                      <div className="my-8 flex items-center justify-center">
                        <div className="relative flex size-40 items-center justify-center rounded-full border border-white/20">
                          <div className="absolute inset-3 rounded-full border border-dashed border-white/25" />
                          <div className="absolute inset-8 rounded-full border border-white/15" />
                          <div className="folium-live relative z-10 flex size-16 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm">
                            <ScanLine className="size-7" />
                          </div>
                        </div>
                      </div>
                      <div className="flex items-end justify-between gap-3">
                        <p className="max-w-[14rem] text-xs leading-5 text-white/70">
                          En moyenne, vos résultats sont fiables à {metrics.avgConfidence.toFixed(0)}%. {metrics.healthyCount} plant{metrics.healthyCount > 1 ? 's' : ''} sain{metrics.healthyCount > 1 ? 's' : ''} détecté{metrics.healthyCount > 1 ? 's' : ''}.
                        </p>
                        <button
                          onClick={() => document.getElementById('studio')?.scrollIntoView({ behavior: 'smooth' })}
                          className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-primary transition-transform hover:-translate-y-0.5"
                        >
                          Commencer
                          <ArrowRight className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section id="studio" className="folium-enter folium-enter-delay-2 mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.75fr)]">
                <div className="overflow-hidden rounded-[1.25rem] border border-border bg-card">
                  <div className="border-b border-border px-5 py-5 md:px-7">
                    <h2 className="font-serif text-2xl font-bold tracking-tight">Analyser une feuille</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Choisissez votre culture, puis ajoutez une photo.</p>
                  </div>

                  <div className="p-5 md:p-7">
                    <div className="mb-5 grid grid-cols-3 gap-2">
                      {crops.map((crop) => {
                        const active = selectedCrop === crop.name
                        return (
                          <button
                            key={crop.name}
                            onClick={() => {
                              setSelectedCrop(crop.name)
                              setResult(null)
                            }}
                            className={`group rounded-xl border px-3 py-3 text-left transition-all ${
                              active
                                ? 'border-primary bg-accent shadow-[inset_0_0_0_1px_var(--primary)]'
                                : 'border-border hover:border-primary/40 hover:bg-mist'
                            }`}
                          >
                            <div className="flex items-center justify-end">
                              {active ? <CheckCircle2 className="size-4 text-primary" /> : <CircleDashed className="size-4 text-muted-foreground/50" />}
                            </div>
                            <p className="mt-2 text-sm font-semibold">{crop.name}</p>
                            <p className="mt-0.5 hidden text-[10px] leading-4 text-muted-foreground sm:block">{crop.detail}</p>
                          </button>
                        )
                      })}
                    </div>

                    <div
                      onClick={() => fileRef.current?.click()}
                      onDragOver={(e) => {
                        e.preventDefault()
                        setDragOver(true)
                      }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault()
                        setDragOver(false)
                        chooseFile(e.dataTransfer.files?.[0])
                      }}
                      className={`group relative flex min-h-[17rem] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed transition-all ${
                        dragOver
                          ? 'border-signal bg-accent scale-[1.01]'
                          : preview
                            ? 'border-primary/35 bg-mist'
                            : 'border-border bg-mist/40 hover:border-primary/50 hover:bg-accent/40'
                      }`}
                    >
                      {preview ? (
                        <>
                          <img src={preview} alt="Aperçu feuille" className="absolute inset-0 size-full object-cover" />
                          <div className="absolute inset-0 bg-gradient-to-t from-ink/55 via-ink/15 to-transparent" />
                          {isAnalyzing && (
                            <div className="absolute inset-0 overflow-hidden">
                              <div className="folium-scan-line absolute inset-x-0 h-16 bg-gradient-to-b from-transparent via-signal/50 to-transparent" />
                            </div>
                          )}
                          <div className="relative z-10 mt-auto mb-5 flex w-[min(100%-2rem,22rem)] items-center gap-3 rounded-xl border border-white/20 bg-ink/55 px-4 py-3 text-white backdrop-blur-md">
                            <FileImage className="size-5 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{file?.name}</p>
                              <p className="text-[11px] text-white/65">Cliquez pour remplacer</p>
                            </div>
                            <button
                              type="button"
                              aria-label="Retirer l’image"
                              onClick={(e) => {
                                e.stopPropagation()
                                clearImage()
                              }}
                              className="rounded-md bg-white/10 p-1.5 hover:bg-white/20"
                            >
                              <X className="size-3.5" />
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="mb-4 flex size-14 items-center justify-center rounded-xl border border-border bg-card text-primary transition-transform duration-300 group-hover:-translate-y-1">
                            <UploadCloud className="size-6" />
                          </div>
                          <p className="text-sm font-semibold">Déposez la feuille ici</p>
                          <p className="mt-1 text-xs text-muted-foreground">Photo au format JPG ou PNG</p>
                        </>
                      )}
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        onChange={(e) => chooseFile(e.target.files?.[0])}
                      />
                    </div>

                    {error && (
                      <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-danger/25 bg-danger-soft px-3 py-2.5 text-xs leading-5 text-danger">
                        <X className="mt-0.5 size-4 shrink-0" />
                        {error}
                      </div>
                    )}

                    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="flex items-center gap-2 text-xs text-muted-foreground">
                        <ShieldCheck className="size-4 text-signal" />
                        Aucune photo n’est envoyée sur internet.
                      </p>
                      <button
                        onClick={analyze}
                        disabled={isAnalyzing}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-all hover:bg-ink disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto"
                      >
                        {isAnalyzing ? (
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            Analyse en cours…
                          </>
                        ) : (
                          <>
                            <ScanLine className="size-4" />
                            Lancer le diagnostic
                          </>
                        )}
                      </button>
                    </div>

                    {result && (
                      <div ref={resultRef} className="folium-enter mt-6 rounded-xl border border-border bg-mist/80 p-4 md:p-5">
                        <ResultPanel result={result} />
                      </div>
                    )}
                  </div>
                </div>

                <aside className="space-y-6">
                  <div className="rounded-[1.25rem] border border-border bg-card p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="mt-1 font-serif text-xl font-bold">Analyses récentes</h3>
                      </div>
                      <button onClick={() => navigate('journal')} className="text-xs font-medium text-primary hover:underline">
                        Voir tout
                      </button>
                    </div>
                    <div className="mt-4 space-y-2">
                      {history.slice(0, 5).map((item) => (
                        <button
                          key={item.id}
                          className="flex w-full items-center gap-3 rounded-xl border border-transparent px-2 py-2 text-left transition-colors hover:border-border hover:bg-mist"
                          onClick={() => {
                            setSelectedCrop(item.crop)
                            navigate('studio')
                          }}
                        >
                          <ConfidenceRing value={item.confidence} status={item.status} size={42} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{formatLabel(item.label)}</p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {item.crop} · {item.date}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[1.25rem] border border-border bg-primary p-5 text-primary-foreground">
                    <p className="text-sm font-medium text-white/90">Conseils pour une bonne photo</p>
                    <ul className="mt-3 space-y-3 text-sm leading-5 text-white/80">
                      <li className="flex gap-2">
                        <span className="mt-1 size-1.5 shrink-0 rounded-full bg-signal" />
                        Lumière diffuse, évitez les reflets.
                      </li>
                      <li className="flex gap-2">
                        <span className="mt-1 size-1.5 shrink-0 rounded-full bg-signal" />
                        Remplissez le cadre avec la zone malade.
                      </li>
                      <li className="flex gap-2">
                        <span className="mt-1 size-1.5 shrink-0 rounded-full bg-signal" />
                        Une feuille = un diagnostic plus fiable.
                      </li>
                    </ul>
                  </div>
                </aside>
              </section>
            </>
          )}

          {activeView === 'journal' && <JournalView history={history} />}
          {activeView === 'models' && <ModelsView />}
        </main>
      </div>
    </div>
  )
}

function ResultPanel({ result }: { result: Analysis }) {
  const tips = advice[result.label] ?? advice[result.label.toLowerCase()] ?? [
    'Comparer avec d’autres feuilles de la même parcelle',
    'Refaire une photo si le résultat vous semble incertain',
  ]
  const statusClass =
    result.status === 'Sain'
      ? 'bg-success-soft text-success'
      : result.status === 'À surveiller'
        ? 'bg-warning-soft text-warning'
        : 'bg-danger-soft text-danger'

  return (
    <div className="grid gap-5 md:grid-cols-[auto_1fr]">
      <ConfidenceRing value={result.confidence} status={result.status} size={88} />
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${statusClass}`}>
            {result.status}
          </span>
          <span className="text-sm text-muted-foreground">{result.crop}</span>
        </div>
        <h3 className="mt-2 font-serif text-2xl font-bold tracking-tight">{formatLabel(result.label)}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Fiabilité du résultat : <span className="font-semibold text-foreground">{result.confidence.toFixed(0)}%</span> · {result.date}
        </p>
        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-2 text-sm font-medium text-muted-foreground">Que faire ensuite ?</p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {tips.map((tip) => (
              <li key={tip} className="flex items-start gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
                {tip}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
