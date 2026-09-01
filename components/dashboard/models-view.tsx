'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Leaf, Loader2, RefreshCw, XCircle } from 'lucide-react'
import { fetchHealth, type HealthResponse } from '@/lib/api'

const modelCatalog = [
  {
    crop: 'Tomate',
    tone: 'tomato' as const,
    summary: 'Détecte 11 types de problèmes sur les feuilles de tomate.',
    diseases: 'Taches bactériennes, mildiou, feuille saine, moisissure, virus de la mosaic, acariens…',
  },
  {
    crop: 'Pomme de terre',
    tone: 'potato' as const,
    summary: 'Analyse les feuilles de pomme de terre sur 4 états possibles.',
    diseases: 'Mildiou précoce, infection fongique, plant sain, mildiou tardif',
  },
  {
    crop: 'Maïs',
    tone: 'maize' as const,
    summary: 'Identifie 8 maladies courantes sur les feuilles de maïs.',
    diseases: 'Taches foliaires, rouille, plant sain, virus de la striure, viroses…',
  },
]

const toneClass = {
  tomato: 'bg-tomato-soft text-tomato',
  potato: 'bg-potato-soft text-potato',
  maize: 'bg-maize-soft text-maize',
}

export function ModelsView() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchHealth()
      setHealth(data)
    } catch {
      setHealth(null)
      setError('Le service de diagnostic est momentanément indisponible. Veuillez réessayer dans quelques instants.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const readyCount = health ? Object.values(health.models).filter((m) => m.loaded).length : 0
  const allReady = readyCount === 3

  return (
    <div className="folium-enter space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight md:text-4xl">Modèles de diagnostic</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Chaque culture dispose de son propre assistant d’analyse. Vérifiez ici que tout est prêt avant de photographier vos plants.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:bg-mist disabled:opacity-60"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Actualiser
        </button>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Cultures couvertes', value: '3' },
          { label: 'Assistants prêts', value: `${readyCount} sur 3` },
          { label: 'État général', value: allReady ? 'Tout est prêt' : health ? 'Partiel' : 'Indisponible' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-card px-4 py-4">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className="mt-1 font-serif text-xl font-bold">{stat.value}</p>
          </div>
        ))}
      </section>

      {error && (
        <div className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>
      )}

      <section className="grid gap-4 lg:grid-cols-3">
        {modelCatalog.map((model) => {
          const status = health?.models[model.crop]
          const ready = status?.file && status?.loaded
          return (
            <article key={model.crop} className="overflow-hidden rounded-[1.25rem] border border-border bg-card">
              <div className="border-b border-border p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className={`flex size-10 items-center justify-center rounded-xl ${toneClass[model.tone]}`}>
                    <Leaf className="size-5" />
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      ready ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'
                    }`}
                  >
                    {ready ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
                    {ready ? 'Prêt' : 'Indisponible'}
                  </span>
                </div>
                <h2 className="mt-4 font-serif text-xl font-bold">{model.crop}</h2>
                <p className="mt-2 text-sm leading-5 text-muted-foreground">{model.summary}</p>
              </div>
              <div className="space-y-3 p-5 text-sm">
                <div className="border-t border-border pt-3">
                  <p className="text-xs font-medium text-muted-foreground">Maladies et états détectables</p>
                  <p className="mt-2 text-sm leading-6 text-foreground">{model.diseases}</p>
                </div>
              </div>
            </article>
          )
        })}
      </section>

      <section className="rounded-[1.25rem] border border-border bg-primary p-6 text-primary-foreground">
        <h3 className="font-serif text-lg font-semibold">Besoin d’aide ?</h3>
        <p className="mt-2 text-sm leading-6 text-white/80">
          Les modèles de diagnostic sont installés sur cet ordinateur. Si une culture apparaît comme indisponible,
          fermez puis rouvrez l’application, ou contactez la personne qui vous a fourni ce logiciel.
        </p>
      </section>
    </div>
  )
}
