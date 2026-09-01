'use client'

import { useMemo, useState } from 'react'
import { Filter, History } from 'lucide-react'
import { ConfidenceRing } from '@/components/dashboard/confidence-ring'
import type { Analysis, Crop, Status } from '@/lib/history'
import { computeMetrics, formatLabel } from '@/lib/history'

const statusStyles: Record<Status, string> = {
  Sain: 'bg-success-soft text-success',
  'À surveiller': 'bg-warning-soft text-warning',
  'Maladie détectée': 'bg-danger-soft text-danger',
}

export function JournalView({ history }: { history: Analysis[] }) {
  const [cropFilter, setCropFilter] = useState<Crop | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all')

  const metrics = useMemo(() => computeMetrics(history), [history])

  const filtered = useMemo(() => {
    return history.filter((item) => {
      if (cropFilter !== 'all' && item.crop !== cropFilter) return false
      if (statusFilter !== 'all' && item.status !== statusFilter) return false
      return true
    })
  }, [history, cropFilter, statusFilter])

  return (
    <div className="folium-enter space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold tracking-tight md:text-4xl">Journal des analyses</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          Retrouvez ici toutes vos analyses passées. Filtrez par culture ou par état de santé de la plante.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Analyses réalisées', value: String(metrics.totalScans), hint: 'depuis le début' },
          { label: 'Meilleure fiabilité', value: `${metrics.highestConfidence.toFixed(0)}%`, hint: 'résultat le plus sûr' },
          { label: 'Fiabilité moyenne', value: `${metrics.avgConfidence.toFixed(0)}%`, hint: 'sur toutes les analyses' },
          { label: 'Alertes', value: String(metrics.alertsCount), hint: 'maladies repérées' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-card px-4 py-4">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className="mt-1 font-serif text-2xl font-bold">{stat.value}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{stat.hint}</p>
          </div>
        ))}
      </section>

      <section className="rounded-[1.25rem] border border-border bg-card">
        <div className="flex flex-col gap-4 border-b border-border p-5 md:flex-row md:items-center md:justify-between md:px-7">
          <div className="flex items-center gap-2">
            <History className="size-4 text-signal" />
            <h2 className="font-serif text-xl font-bold">Historique complet</h2>
            <span className="rounded-full bg-mist px-2.5 py-0.5 text-xs text-muted-foreground">{filtered.length} résultat{filtered.length > 1 ? 's' : ''}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="size-3.5 text-muted-foreground" />
            <select
              value={cropFilter}
              onChange={(e) => setCropFilter(e.target.value as Crop | 'all')}
              className="rounded-lg border border-border bg-mist px-3 py-1.5 text-sm"
            >
              <option value="all">Toutes les cultures</option>
              <option value="Tomate">Tomate</option>
              <option value="Pomme de terre">Pomme de terre</option>
              <option value="Maïs">Maïs</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as Status | 'all')}
              className="rounded-lg border border-border bg-mist px-3 py-1.5 text-sm"
            >
              <option value="all">Tous les états</option>
              <option value="Sain">Sain</option>
              <option value="À surveiller">À surveiller</option>
              <option value="Maladie détectée">Maladie détectée</option>
            </select>
          </div>
        </div>

        <div className="divide-y divide-border">
          {filtered.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">Aucune analyse ne correspond à votre recherche.</p>
          ) : (
            filtered.map((item) => (
              <div key={item.id} className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between md:px-7">
                <div className="flex items-center gap-4">
                  <ConfidenceRing value={item.confidence} status={item.status} size={48} />
                  <div>
                    <p className="font-serif text-lg font-semibold">{formatLabel(item.label)}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {item.crop} · {item.date}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 sm:justify-end">
                  <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${statusStyles[item.status]}`}>
                    {item.status}
                  </span>
                  <span className="w-16 text-right text-sm font-semibold">{item.confidence.toFixed(0)}%</span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
