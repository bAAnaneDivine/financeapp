/**
 * @file Budget.jsx
 * @description Gestion des enveloppes budgétaires et des objectifs d'épargne.
 *
 * Fonctionnalités :
 *  - Enveloppes mensuelles par catégorie avec barre de progression
 *  - Bouton "Suggérer" : pré-remplit les enveloppes avec les moyennes historiques
 *  - Résumé global budget vs dépenses réelles
 *  - Objectifs d'épargne : contribution fixe ou automatique depuis le solde net
 *  - Journal des décisions financières (4 types : décision, action, alerte, note)
 *  - Détection du mois en cours (données partielles)
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import { computeStats, CATEGORIES } from '../utils/parser.js'
import { C, S, fmt, fmtD, fmtMonth } from '../theme.js'
import { calcSavedForGoal } from '../helpers.js'

function Budget({ transactions, budgets, objectifs, notes, journal, onSaveBudgets, onSaveObjectifs, onSaveNote, onSaveJournal }) {
  const allMonths = useMemo(
    () => [...new Set(transactions.map(t => t.dateOpe.slice(0, 7)))].sort(),
    [transactions]
  )
  const months = [...allMonths].reverse()
  const [moisF, setMoisF] = useState(allMonths[allMonths.length - 1] || '')

  const txsF  = useMemo(() => transactions.filter(t => t.dateOpe.startsWith(moisF)), [transactions, moisF])
  const stats = useMemo(() => computeStats(txsF), [txsF])

  // Budgets locaux éditables
  const [localBudgets, setLocalBudgets] = useState({ ...budgets })
  const [dirty, setDirty] = useState(false)
  useEffect(() => { setLocalBudgets({ ...budgets }) }, [budgets])

  const setBudget = (cat, val) => { setLocalBudgets(b => ({ ...b, [cat]: val })); setDirty(true) }
  const removeBudget = (cat) => { setLocalBudgets(b => { const n = { ...b }; delete n[cat]; return n }); setDirty(true) }

  // Formulaire objectif (création)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState({ label: '', cible: '', dateTarget: '', emoji: '🎯', contrib: '' })
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Édition inline d'un objectif existant
  const [editObjId, setEditObjId]   = useState(null)
  const [editObjForm, setEditObjForm] = useState({})
  const setEF = (k, v) => setEditObjForm(f => ({ ...f, [k]: v }))
  const startEditObj = (obj) => {
    setEditObjId(obj.id)
    setEditObjForm({ label: obj.label, emoji: obj.emoji || '🎯', cible: String(obj.cible), dateTarget: obj.dateTarget || '', contrib: obj.contrib ? String(obj.contrib) : '' })
  }
  const saveEditObj = () => {
    if (!editObjForm.label.trim() || !editObjForm.cible) return
    onSaveObjectifs(objectifs.map(o => o.id === editObjId
      ? { ...o, label: editObjForm.label.trim(), emoji: editObjForm.emoji || '🎯',
          cible: parseFloat(editObjForm.cible), dateTarget: editObjForm.dateTarget || '',
          contrib: editObjForm.contrib ? parseFloat(editObjForm.contrib) : null }
      : o
    ))
    setEditObjId(null)
  }

  // Note du mois
  const [noteText, setNoteText] = useState(notes?.[moisF] || '')
  useEffect(() => { setNoteText(notes?.[moisF] || '') }, [moisF, notes])

  // Cache des stats mensuelles — computeStats appelé une seule fois par mois (partagé par avgNet, avgByCat, savedForGoal)
  const statsParMois = useMemo(() => {
    const cache = {}
    allMonths.forEach(m => { cache[m] = computeStats(transactions.filter(t => t.dateOpe.startsWith(m))) })
    return cache
  }, [transactions, allMonths])

  // Mois complétés uniquement pour les moyennes (exclut mois en cours partiel)
  const currentYM = new Date().toISOString().slice(0, 7)
  const refMonths = useMemo(() => {
    const completed = allMonths.filter(m => m < currentYM)
    return completed.length ? completed : allMonths  // fallback si toutes les données sont récentes
  }, [allMonths])

  // Épargne mensuelle moyenne réelle — basée sur mois complétés uniquement
  const avgNet = useMemo(() => {
    if (!refMonths.length) return 0
    const total = refMonths.reduce((s, m) => {
      const ms = statsParMois[m]
      return s + ((ms?.totalRev || 0) - (ms?.totalDep || 0))
    }, 0)
    return total / refMonths.length
  }, [statsParMois, refMonths])

  // Moyennes par catégorie — basées sur mois complétés uniquement (pour suggestion plus précise)
  // Les valeurs sont arrondies au 10€ supérieur (Math.ceil … / 10 * 10) :
  //   - évite des suggestions à virgule (ex: 87.3€ → 90€)
  //   - ajoute une petite marge de sécurité, cohérent avec un budget mensuel
  const avgByCat = useMemo(() => {
    if (!refMonths.length) return {}
    const sums = {}
    refMonths.forEach(m => {
      Object.entries(statsParMois[m]?.parCat || {}).forEach(([cat, v]) => {
        sums[cat] = (sums[cat] || 0) + v
      })
    })
    const avgs = {}
    Object.entries(sums).forEach(([cat, total]) => {
      avgs[cat] = Math.ceil(total / refMonths.length / 10) * 10
    })
    return avgs
  }, [statsParMois, refMonths])

  const suggestBudgets = () => {
    const suggested = {}
    Object.entries(avgByCat).forEach(([cat, avg]) => {
      if (avg > 0) suggested[cat] = avg
    })
    setLocalBudgets(suggested)
    setDirty(true)
  }

  // Épargne accumulée depuis la création d'un objectif (utilise le cache statsParMois)
  const savedForGoal = (goal) => {
    if (goal.contrib && parseFloat(goal.contrib) > 0) {
      const startM = goal.created.slice(0, 7)
      const nMois = allMonths.filter(m => m >= startM).length
      return Math.min(parseFloat(goal.contrib) * nMois, goal.cible)
    }
    const startM = goal.created.slice(0, 7)
    return allMonths.filter(m => m >= startM).reduce((s, m) => {
      const ms = statsParMois[m]
      return s + Math.max(0, ms.totalRev - ms.totalDep)
    }, 0)
  }

  const projDate = (remaining, contrib = null) => {
    const rate = contrib && parseFloat(contrib) > 0 ? parseFloat(contrib) : avgNet
    if (rate <= 0 || remaining <= 0) return null
    const nbMois = Math.ceil(remaining / rate)
    const d = new Date()
    d.setMonth(d.getMonth() + nbMois)
    return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  }

  // Journal des décisions
  const JTYPES = {
    decision: { icon: '💡', label: 'Décision',  color: '#8577e8' },
    action:   { icon: '✅', label: 'Action',    color: C.success },
    alert:    { icon: '⚠️', label: 'Point d\'attention', color: C.warn },
    note:     { icon: '📝', label: 'Observation', color: C.muted },
  }
  const [jForm, setJForm] = useState({ type: 'decision', text: '', date: new Date().toISOString().slice(0, 10) })
  const [jExpanded, setJExpanded] = useState(true)

  const addEntry = () => {
    if (!jForm.text.trim()) return
    const entry = { id: Date.now().toString(36), ...jForm, text: jForm.text.trim() }
    onSaveJournal([entry, ...(journal || [])])
    setJForm(f => ({ ...f, text: '' }))
  }

  const CATS_EXCL = new Set(['revenus', 'virement_interne'])
  const catsWithData = Object.keys(CATEGORIES).filter(k =>
    !CATS_EXCL.has(k) && (localBudgets[k] !== undefined || stats.parCat[k])
  )
  const catsWithout = Object.keys(CATEGORIES).filter(k =>
    !CATS_EXCL.has(k) && localBudgets[k] === undefined && !stats.parCat[k]
  )
  const totalBudget = Object.values(localBudgets).reduce((s, v) => s + (parseFloat(v) || 0), 0)

  if (!transactions.length) {
    return (
      <div style={{ padding: '4rem 2.5rem', textAlign: 'center', color: C.muted, fontSize: 14 }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>📤</div>
        Importe d'abord un relevé pour configurer tes budgets.
      </div>
    )
  }

  return (
    <div style={{ padding: '2rem 2.5rem', maxWidth: 960, margin: '0 auto' }}>

      {/* En-tête */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 26, color: C.text, marginBottom: 4, fontFamily: "'Georgia', serif" }}>🎯 Budget & Objectifs</h2>
          <p style={{ color: C.muted, fontSize: 13 }}>Enveloppes mensuelles · Objectifs d'épargne · Projections</p>
        </div>
        <select value={moisF} onChange={e => setMoisF(e.target.value)}
          style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, padding: '8px 14px', borderRadius: 10, fontSize: 13, fontFamily: 'inherit' }}>
          {months.map(m => <option key={m} value={m}>{fmtMonth(m)}</option>)}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* ── Colonne gauche : Enveloppes + Note ── */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 13, color: C.muted, fontWeight: 500 }}>💰 Enveloppes mensuelles</div>
            <div style={{ display: 'flex', gap: 7 }}>
              {!dirty && (
                <button onClick={suggestBudgets}
                  title="Pré-remplit les limites avec tes moyennes historiques par catégorie"
                  style={{ ...S.ghost, fontSize: 11, padding: '4px 10px', color: C.gold, borderColor: 'rgba(201,169,110,0.4)' }}>
                  ✨ Suggérer
                </button>
              )}
              {dirty && (
                <button onClick={() => { onSaveBudgets(localBudgets); setDirty(false) }}
                  style={{ ...S.btn, fontSize: 11, padding: '4px 10px' }}>Enregistrer ✓</button>
              )}
            </div>
          </div>

          <div style={{ ...S.card, overflow: 'hidden', marginBottom: 8 }}>
            {catsWithData.length === 0 && (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: C.muted, fontSize: 13 }}>
                Ajoute une catégorie ci-dessous pour commencer.
              </div>
            )}
            {catsWithData.map((cat, i) => {
              const actual  = stats.parCat[cat] || 0
              const budget  = parseFloat(localBudgets[cat]) || 0
              const avg     = avgByCat[cat] || 0
              const pct     = budget > 0 ? Math.min(actual / budget * 100, 100) : 0
              const pctAvg  = avg > 0 ? Math.min(actual / avg * 100, 100) : 0
              const over    = budget > 0 && actual > budget
              const near    = budget > 0 && actual >= budget * 0.85
              const overAvg = budget === 0 && avg > 0 && actual > avg
              const barCol  = over ? C.danger : near ? C.warn : C.success
              return (
                <div key={cat} style={{ padding: '0.7rem 1rem', borderBottom: i < catsWithData.length - 1 ? `1px solid #0d0d20` : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: (budget > 0 || avg > 0) ? 5 : 0 }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{CATEGORIES[cat].icon}</span>
                    <span style={{ flex: 1, fontSize: 12, color: C.text }}>{CATEGORIES[cat].label}</span>
                    <span style={{ fontSize: 12, color: over ? C.danger : overAvg ? C.warn : C.muted, fontWeight: 500, minWidth: 55, textAlign: 'right' }}>
                      {actual > 0 ? fmt(actual) : '—'}
                    </span>
                    <span style={{ fontSize: 11, color: '#2a2a3a' }}>/</span>
                    <input
                      type="number" min="0" value={localBudgets[cat] ?? ''} onChange={e => setBudget(cat, Math.max(0, parseFloat(e.target.value) || 0) || '')}
                      placeholder="Limite"
                      style={{ width: 68, background: '#080814', border: `1px solid ${C.border}`, color: C.text, padding: '3px 6px', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', textAlign: 'right' }}
                    />
                    <span style={{ fontSize: 11, color: C.muted }}>€</span>
                    <button onClick={() => removeBudget(cat)}
                      style={{ background: 'transparent', border: 'none', color: '#2a2a3a', fontSize: 14, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
                  </div>
                  {budget > 0 && (
                    <>
                      <div style={{ background: '#0a0a16', borderRadius: 99, height: 4 }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: barCol, borderRadius: 99, transition: 'width 0.3s' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                        <span style={{ fontSize: 10, color: C.muted }}>{Math.round(pct)}%</span>
                        <span style={{ fontSize: 10, color: over ? C.danger : C.muted }}>
                          {over ? `⚠ +${fmt(actual - budget)}` : `reste ${fmt(budget - actual)}`}
                        </span>
                      </div>
                    </>
                  )}
                  {budget === 0 && avg > 0 && (
                    <>
                      <div style={{ background: '#0a0a16', borderRadius: 99, height: 3 }}>
                        <div style={{ width: `${pctAvg}%`, height: '100%', background: overAvg ? C.warn : '#3a3a5a', borderRadius: 99, transition: 'width 0.3s' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                        <span style={{ fontSize: 10, color: '#3a3a5a' }}>moy. {fmt(avg)}/mois</span>
                        <span style={{ fontSize: 10, color: overAvg ? C.warn : '#3a3a5a' }}>
                          {overAvg ? `↑ +${fmt(actual - avg)} vs moy.` : actual > 0 ? `${Math.round(pctAvg)}% de la moy.` : ''}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )
            })}
            {/* Ajouter une catégorie */}
            <div style={{ padding: '0.55rem 1rem', borderTop: catsWithData.length ? `1px solid #0d0d20` : 'none', background: '#080814' }}>
              <select value="" onChange={e => e.target.value && setBudget(e.target.value, '')}
                style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', width: '100%' }}>
                <option value="">+ Ajouter une catégorie…</option>
                {catsWithout.map(k => <option key={k} value={k}>{CATEGORIES[k].icon} {CATEGORIES[k].label}</option>)}
              </select>
            </div>
          </div>

          {/* Résumé total budget */}
          {(() => {
            const totalAvg = Object.entries(avgByCat)
              .filter(([cat]) => cat !== 'revenus' && catsWithData.includes(cat))
              .reduce((s, [, v]) => s + v, 0)
            const vsAvg = totalAvg > 0 ? stats.totalDep - totalAvg : null
            return (
              <div style={{ ...S.card, padding: '0.7rem 1rem', marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: C.muted }}>Total dépensé ce mois</span>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: C.text, fontFamily: "'Georgia', serif" }}>
                      {fmt(stats.totalDep)}
                      {totalBudget > 0 && <span style={{ fontSize: 12, color: C.muted, fontWeight: 400 }}> / {fmt(totalBudget)}</span>}
                    </span>
                    {totalBudget > 0 && stats.totalDep > 0 && (
                      <div style={{ fontSize: 11, color: stats.totalDep > totalBudget ? C.danger : C.success, marginTop: 1 }}>
                        {stats.totalDep > totalBudget
                          ? `⚠ Dépassement de ${fmt(stats.totalDep - totalBudget)}`
                          : `✓ Marge : ${fmt(totalBudget - stats.totalDep)}`}
                      </div>
                    )}
                    {totalBudget === 0 && vsAvg !== null && (
                      <div style={{ fontSize: 11, color: vsAvg > 0 ? C.warn : C.success, marginTop: 1 }}>
                        {vsAvg > 0
                          ? `↑ +${fmt(vsAvg)} vs moy. (${fmt(totalAvg)})`
                          : `↓ ${fmt(-vsAvg)} sous la moy. (${fmt(totalAvg)})`}
                      </div>
                    )}
                  </div>
                </div>
                {totalAvg > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ background: '#0a0a16', borderRadius: 99, height: 4 }}>
                      <div style={{
                        width: `${Math.min(stats.totalDep / (totalBudget || totalAvg) * 100, 100)}%`,
                        height: '100%',
                        background: totalBudget > 0
                          ? (stats.totalDep > totalBudget ? C.danger : stats.totalDep >= totalBudget * 0.85 ? C.warn : C.success)
                          : (vsAvg > 0 ? C.warn : '#3a3a5a'),
                        borderRadius: 99, transition: 'width 0.3s'
                      }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                      <span style={{ fontSize: 10, color: '#3a3a5a' }}>
                        {totalBudget > 0 ? `Limite : ${fmt(totalBudget)}` : `Moyenne : ${fmt(totalAvg)}/mois`}
                      </span>
                      <span style={{ fontSize: 10, color: C.muted }}>
                        {Math.round(stats.totalDep / (totalBudget || totalAvg) * 100)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Note du mois */}
          <div style={{ fontSize: 13, color: C.muted, fontWeight: 500, marginBottom: 8 }}>📝 Note du mois</div>
          <textarea
            value={noteText} onChange={e => setNoteText(e.target.value)}
            placeholder={`Contexte pour ${fmtMonth(moisF)}… (achat exceptionnel, événement, congés…)`}
            style={{ ...S.input, height: 76, resize: 'vertical', fontSize: 12, lineHeight: 1.55, display: 'block', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 7 }}>
            <button onClick={() => onSaveNote(moisF, noteText)}
              style={{ ...S.btn, fontSize: 11, padding: '5px 14px' }}>Enregistrer</button>
          </div>
        </div>

        {/* ── Colonne droite : Objectifs ── */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 13, color: C.muted, fontWeight: 500 }}>🏆 Objectifs d'épargne</div>
            <button onClick={() => setShowForm(f => !f)}
              style={{ ...S.ghost, fontSize: 11, padding: '4px 10px', color: showForm ? C.danger : C.muted }}>
              {showForm ? '✕ Annuler' : '+ Nouvel objectif'}
            </button>
          </div>

          {/* Formulaire */}
          {showForm && (
            <div style={{ ...S.card, padding: '1rem', marginBottom: 12, borderColor: 'rgba(201,169,110,0.3)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2.5rem 1fr', gap: 8, marginBottom: 8 }}>
                <input value={form.emoji} onChange={e => setF('emoji', e.target.value)}
                  style={{ ...S.input, padding: '7px 4px', textAlign: 'center', fontSize: 18 }} />
                <input placeholder="Nom de l'objectif (ex: Voyage, Urgence…)" value={form.label}
                  onChange={e => setF('label', e.target.value)}
                  style={{ ...S.input, fontSize: 13, padding: '7px 10px' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Montant cible (€)</div>
                  <input type="number" placeholder="1 500" value={form.cible} onChange={e => setF('cible', e.target.value)}
                    style={{ ...S.input, fontSize: 13, padding: '7px 10px' }} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Échéance (optionnelle)</div>
                  <input type="month" value={form.dateTarget} onChange={e => setF('dateTarget', e.target.value)}
                    min={new Date().toISOString().slice(0, 7)}
                    style={{ ...S.input, fontSize: 13, padding: '7px 10px' }} />
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>
                  Contribution mensuelle fixe (€) <span style={{ color: '#3a3a5a' }}>— optionnel, sinon calculé sur ton épargne réelle</span>
                </div>
                <input type="number" placeholder={`ex: ${Math.round(Math.max(avgNet, 50))}`} value={form.contrib} onChange={e => setF('contrib', e.target.value)}
                  style={{ ...S.input, fontSize: 13, padding: '7px 10px' }} />
              </div>
              <button
                onClick={() => {
                  if (!form.label.trim() || !form.cible) return
                  onSaveObjectifs([...objectifs, {
                    id: Date.now().toString(36), label: form.label.trim(), emoji: form.emoji || '🎯',
                    cible: parseFloat(form.cible), dateTarget: form.dateTarget,
                    contrib: form.contrib ? parseFloat(form.contrib) : null,
                    created: new Date().toISOString().slice(0, 10)
                  }])
                  setForm({ label: '', cible: '', dateTarget: '', emoji: '🎯', contrib: '' }); setShowForm(false)
                }}
                disabled={!form.label.trim() || !form.cible}
                style={{ ...S.btn, width: '100%', fontSize: 12, padding: '8px', opacity: form.label.trim() && form.cible ? 1 : 0.4 }}>
                Créer l'objectif →
              </button>
            </div>
          )}

          {objectifs.length === 0 && !showForm && (
            <div style={{ ...S.card, padding: '3rem 2rem', textAlign: 'center', color: C.muted, fontSize: 13, marginBottom: 12 }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>🏆</div>
              Aucun objectif défini.<br />
              <span style={{ fontSize: 11 }}>Voyage, fonds d'urgence, achat important…</span>
            </div>
          )}

          {objectifs.map(obj => {
            // ── Mode édition inline ─────────────────────────────────────────
            if (editObjId === obj.id) return (
              <div key={obj.id} style={{ ...S.card, padding: '1rem', marginBottom: 10, borderColor: 'rgba(201,169,110,0.4)' }}>
                <div style={{ fontSize: 12, color: C.gold, fontWeight: 500, marginBottom: 10 }}>✏ Modifier l'objectif</div>
                <div style={{ display: 'grid', gridTemplateColumns: '2.5rem 1fr', gap: 8, marginBottom: 8 }}>
                  <input value={editObjForm.emoji} onChange={e => setEF('emoji', e.target.value)}
                    style={{ ...S.input, padding: '7px 4px', textAlign: 'center', fontSize: 18 }} />
                  <input placeholder="Nom de l'objectif" value={editObjForm.label} onChange={e => setEF('label', e.target.value)}
                    style={{ ...S.input, fontSize: 13, padding: '7px 10px' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 3 }}>Montant cible (€)</div>
                    <input type="number" value={editObjForm.cible} onChange={e => setEF('cible', e.target.value)}
                      style={{ ...S.input, fontSize: 13, padding: '7px 10px' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 3 }}>Échéance</div>
                    <input type="month" value={editObjForm.dateTarget} onChange={e => setEF('dateTarget', e.target.value)}
                      min={new Date().toISOString().slice(0, 7)}
                      style={{ ...S.input, fontSize: 13, padding: '7px 10px' }} />
                  </div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 3 }}>Contribution fixe (€/mois) — optionnel</div>
                  <input type="number" value={editObjForm.contrib} onChange={e => setEF('contrib', e.target.value)}
                    style={{ ...S.input, fontSize: 13, padding: '7px 10px' }} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={saveEditObj} disabled={!editObjForm.label.trim() || !editObjForm.cible}
                    style={{ ...S.btn, flex: 1, fontSize: 12, padding: '7px', opacity: editObjForm.label.trim() && editObjForm.cible ? 1 : 0.4 }}>
                    Enregistrer ✓
                  </button>
                  <button onClick={() => setEditObjId(null)} style={{ ...S.ghost, fontSize: 12, padding: '7px 14px' }}>Annuler</button>
                </div>
              </div>
            )

            // ── Affichage normal ────────────────────────────────────────────
            const saved   = savedForGoal(obj)
            const pct     = Math.min(Math.round(saved / obj.cible * 100), 100)
            const remain  = Math.max(0, obj.cible - saved)
            const proj    = projDate(remain, obj.contrib)
            const done    = saved >= obj.cible

            let deadlineInfo = null
            if (obj.dateTarget && !done) {
              const target   = new Date(obj.dateTarget + '-01')
              const today    = new Date()
              const moisLeft = Math.round((target - today) / (1000 * 60 * 60 * 24 * 30.5))
              const needPM   = moisLeft > 0 ? remain / moisLeft : Infinity
              if (moisLeft <= 0)              deadlineInfo = { text: 'Échéance dépassée ⚠', color: C.danger }
              else if (needPM > avgNet * 1.5) deadlineInfo = { text: `Nécessite ${fmt(needPM)}/mois`, color: C.warn }
              else                            deadlineInfo = { text: `${moisLeft} mois restants`, color: C.muted }
            }

            return (
              <div key={obj.id} style={{ ...S.card, padding: '1rem 1.1rem', marginBottom: 10, borderColor: done ? 'rgba(109,184,122,0.5)' : C.border }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: done ? C.success : C.text, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{obj.emoji || '🎯'}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{obj.label}</span>
                    </div>
                    {obj.dateTarget && (
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Échéance : {fmtMonth(obj.dateTarget)}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, color: done ? C.success : C.gold, fontWeight: 600 }}>{fmt(saved)}</div>
                      <div style={{ fontSize: 11, color: C.muted }}>/ {fmt(obj.cible)}</div>
                    </div>
                    <button onClick={() => startEditObj(obj)} title="Modifier"
                      style={{ background: 'transparent', border: 'none', color: '#3a3a5a', fontSize: 14, cursor: 'pointer', padding: '0 2px' }}>✏</button>
                    <button onClick={() => onSaveObjectifs(objectifs.filter(o => o.id !== obj.id))}
                      style={{ background: 'transparent', border: 'none', color: '#2a2a3a', fontSize: 16, cursor: 'pointer', padding: 0 }}>×</button>
                  </div>
                </div>

                <div style={{ background: '#0a0a16', borderRadius: 99, height: 6, marginBottom: 6 }}>
                  <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, transition: 'width 0.4s',
                    background: done ? C.success : pct >= 75 ? C.gold : pct >= 40 ? C.warn : '#4a4a6a'
                  }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ color: C.muted }}>{pct}% · reste {fmt(remain)}</span>
                    {obj.contrib && <div style={{ color: C.muted, marginTop: 2 }}>📌 {fmt(obj.contrib)}/mois dédié</div>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {done
                      ? <span style={{ color: C.success, fontWeight: 500 }}>Objectif atteint 🎉</span>
                      : proj
                        ? <span style={{ color: C.muted }}>🕐 À ce rythme : <span style={{ color: C.text, fontWeight: 500 }}>{proj}</span></span>
                        : avgNet <= 0 ? <span style={{ color: C.danger }}>Épargne négative</span> : null}
                    {deadlineInfo && <div style={{ color: deadlineInfo.color, marginTop: 2 }}>{deadlineInfo.text}</div>}
                  </div>
                </div>
              </div>
            )
          })}

          {/* Tendance épargne */}
          <div style={{ ...S.card, padding: '0.85rem 1.1rem', borderColor: avgNet > 0 ? 'rgba(109,184,122,0.25)' : 'rgba(224,85,85,0.25)' }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>📈 Tendance d'épargne</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: avgNet > 0 ? C.success : C.danger, fontFamily: "'Georgia', serif" }}>
              {avgNet > 0 ? '+' : ''}{fmt(avgNet)}<span style={{ fontSize: 12, fontWeight: 400, color: C.muted }}>/mois</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: 11, color: C.muted }}>Sur {refMonths.length} mois complets</span>
              <span style={{ fontSize: 11, color: C.muted }}>
                Projection 12 mois :&nbsp;
                <span style={{ color: avgNet > 0 ? C.success : C.danger, fontWeight: 500 }}>{fmt(avgNet * 12)}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Journal des décisions ── */}
      <div style={{ marginTop: 20 }}>
        <div
          onClick={() => setJExpanded(e => !e)}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: jExpanded ? 12 : 0, cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14 }}>📓</span>
            <span style={{ fontSize: 13, color: C.muted, fontWeight: 500 }}>Journal des décisions</span>
            {(journal || []).length > 0 && (
              <span style={{ background: '#1e1e3a', color: C.muted, fontSize: 10, padding: '1px 6px', borderRadius: 99 }}>{(journal || []).length}</span>
            )}
          </div>
          <span style={{ color: C.muted, fontSize: 12 }}>{jExpanded ? '▲' : '▼'}</span>
        </div>

        {jExpanded && (
          <>
            {/* Formulaire ajout */}
            <div style={{ ...S.card, padding: '0.85rem 1rem', marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                {/* Type */}
                <div style={{ display: 'flex', gap: 4 }}>
                  {Object.entries(JTYPES).map(([k, v]) => (
                    <button key={k} onClick={() => setJForm(f => ({ ...f, type: k }))}
                      title={v.label}
                      style={{ fontSize: 16, padding: '4px 6px', borderRadius: 7, border: `1px solid ${jForm.type === k ? v.color : C.border}`, background: jForm.type === k ? `${v.color}18` : 'transparent', cursor: 'pointer', lineHeight: 1 }}>
                      {v.icon}
                    </button>
                  ))}
                </div>
                {/* Date */}
                <input type="date" value={jForm.date} onChange={e => setJForm(f => ({ ...f, date: e.target.value }))}
                  style={{ ...S.input, width: 140, padding: '5px 8px', fontSize: 12, flex: 'none' }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  placeholder={`${JTYPES[jForm.type].icon} ${JTYPES[jForm.type].label}… (ex: Annulé Netflix, Augmenté virement PEA)`}
                  value={jForm.text}
                  onChange={e => setJForm(f => ({ ...f, text: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && addEntry()}
                  style={{ ...S.input, flex: 1, fontSize: 13, padding: '7px 10px' }}
                />
                <button onClick={addEntry} disabled={!jForm.text.trim()}
                  style={{ ...S.btn, padding: '7px 14px', fontSize: 13, opacity: jForm.text.trim() ? 1 : 0.4, flexShrink: 0 }}>
                  + Ajouter
                </button>
              </div>
            </div>

            {/* Timeline */}
            {(!journal || journal.length === 0) ? (
              <div style={{ ...S.card, padding: '2rem', textAlign: 'center', color: C.muted, fontSize: 12 }}>
                Aucune entrée — note ici tes décisions financières pour suivre ta progression.
              </div>
            ) : (
              <div style={{ ...S.card, overflow: 'hidden' }}>
                {(journal || []).map((entry, i) => {
                  const t = JTYPES[entry.type] || JTYPES.note
                  return (
                    <div key={entry.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '0.65rem 1rem', borderBottom: i < journal.length - 1 ? `1px solid #0d0d20` : 'none' }}>
                      {/* Ligne verticale + icône */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, flexShrink: 0, paddingTop: 1 }}>
                        <span style={{ fontSize: 14, lineHeight: 1 }}>{t.icon}</span>
                        {i < journal.length - 1 && <div style={{ width: 1, flex: 1, background: '#1e1e3a', marginTop: 4 }} />}
                      </div>
                      {/* Contenu */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 1 }}>
                          <span style={{ fontSize: 10, color: t.color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.label}</span>
                          <span style={{ fontSize: 10, color: '#2a2a4a' }}>·</span>
                          <span style={{ fontSize: 10, color: C.muted }}>{new Date(entry.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        </div>
                        <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{entry.text}</div>
                      </div>
                      {/* Supprimer */}
                      <button onClick={() => onSaveJournal((journal || []).filter(e => e.id !== entry.id))}
                        style={{ background: 'transparent', border: 'none', color: '#2a2a3a', fontSize: 14, cursor: 'pointer', padding: '0 2px', flexShrink: 0, lineHeight: 1 }}>×</button>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── FORENSIC ─────────────────────────────────────────────────────────────────

export default Budget
