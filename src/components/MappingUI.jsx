/**
 * @file MappingUI.jsx
 * @description Interface de mapping manuel des colonnes CSV à faible confiance de détection.
 *
 * Affiché quand le parseur CSV ne reconnaît pas automatiquement les colonnes
 * (confidence = 'low'). Permet à l'utilisateur d'assigner manuellement le rôle
 * de chaque colonne (date, libellé, montant, débit, crédit) et de mémoriser
 * ce mapping pour les prochains imports du même format.
 */

import { useState } from 'react'
import { C, S } from '../theme.js'
import { COL_OPTIONS } from '../constants.js'


function MappingUI({ headers, sampleRows, onApply, onCancel }) {
  const [roles, setRoles] = useState(() =>
    headers.map(() => -1)
  )
  const [saveMapping, setSaveMapping] = useState(true)
  const setRole = (idx, val) => setRoles(r => r.map((v, i) => i === idx ? val : v))

  const buildMapping = () => ({
    dateCol:   roles.indexOf('date'),
    descCol:   roles.indexOf('desc'),
    amtCol:    roles.indexOf('amt'),
    debitCol:  roles.indexOf('debit'),
    creditCol: roles.indexOf('credit'),
  })

  const isValid = () => {
    const m = buildMapping()
    return m.dateCol >= 0 && m.descCol >= 0 && (m.amtCol >= 0 || m.debitCol >= 0 || m.creditCol >= 0)
  }

  return (
    <div style={{ ...S.card, marginBottom: 12, overflow: 'hidden' }}>
      <div style={{ padding: '0.9rem 1.25rem', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ color: C.warn, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
          ⚙️ Mapping manuel des colonnes
        </div>
        <div style={{ fontSize: 12, color: C.muted }}>
          Colonnes non reconnues automatiquement — assigne le rôle de chaque colonne.
        </div>
      </div>

      <div style={{ padding: '1rem 1.25rem', borderBottom: `1px solid ${C.border}` }}>
        {headers.map((h, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div style={{ flex: 1, fontSize: 13, color: C.text, fontFamily: 'monospace', background: '#080814', padding: '5px 10px', borderRadius: 6 }}>
              {h || `Colonne ${idx}`}
              {sampleRows[0]?.[idx] && <span style={{ color: C.muted, marginLeft: 8 }}>ex: {sampleRows[0][idx]}</span>}
            </div>
            <select value={roles[idx]} onChange={e => setRole(idx, e.target.value === '-1' ? -1 : e.target.value)}
              style={{ ...S.input, width: 'auto', fontSize: 12, padding: '6px 10px' }}>
              {COL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        ))}
      </div>

      {/* Aperçu avec le mapping actuel */}
      {sampleRows.length > 0 && (
        <div style={{ padding: '0.7rem 1.25rem', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Aperçu (3 premières lignes) :</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ fontSize: 11, borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>{headers.map((h, i) => (
                  <th key={i} style={{ color: roles[i] !== -1 ? C.gold : C.muted, padding: '3px 8px', textAlign: 'left', borderBottom: `1px solid ${C.border}` }}>
                    {roles[i] !== -1 ? COL_OPTIONS.find(o => o.value === roles[i])?.label : '—'} <span style={{ opacity: 0.5 }}>({h})</span>
                  </th>
                ))}</tr>
              </thead>
              <tbody>
                {sampleRows.slice(0, 3).map((row, ri) => (
                  <tr key={ri}>{headers.map((_, ci) => (
                    <td key={ci} style={{ color: roles[ci] !== -1 ? C.text : C.muted, padding: '3px 8px', opacity: roles[ci] !== -1 ? 1 : 0.4 }}>
                      {row[ci] || '—'}
                    </td>
                  ))}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ padding: '0.9rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.muted, cursor: 'pointer' }}>
          <input type="checkbox" checked={saveMapping} onChange={e => setSaveMapping(e.target.checked)} />
          Mémoriser ce mapping pour ce type de fichier
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={S.ghost}>Annuler</button>
          <button onClick={() => onApply(buildMapping(), saveMapping)} disabled={!isValid()}
            style={{ ...S.btn, opacity: isValid() ? 1 : 0.5 }}>
            Importer avec ce mapping →
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── PACK FRANCE ─────────────────────────────────────────────────────────────
// Règles franco-centrées non incluses dans les RULES universelles.
// Chargeable en 1 clic depuis l'UI des règles.
const PACK_FRANCE = [
  { id: 'fr_01', pattern: 'hergibo',                isRegex: false, actif: true, cat: 'logement',    sub: 'Loyer',                  },
  { id: 'fr_02', pattern: 'seloger|pap\\.fr|leboncoin.*immo', isRegex: true, actif: true, cat: 'logement', sub: 'Loyer' },
  { id: 'fr_03', pattern: 'la poste|colissimo',     isRegex: false, actif: true, cat: 'shopping',     sub: 'Cadeaux'                 },
  { id: 'fr_04', pattern: 'picard',                 isRegex: false, actif: true, cat: 'alimentation', sub: 'Courses supermarché'     },
  { id: 'fr_05', pattern: 'biocoop|naturalia|bio.* coop', isRegex: true, actif: true, cat: 'alimentation', sub: 'Marché & épicerie' },
  { id: 'fr_06', pattern: 'boulanger|darty|fnac',   isRegex: true,  actif: true, cat: 'shopping',     sub: 'Électronique & high-tech'},
  { id: 'fr_07', pattern: 'kiabi|decathlon|sport.*2000', isRegex: true, actif: true, cat: 'shopping',  sub: 'Vêtements & chaussures' },
  { id: 'fr_08', pattern: 'culture.?bar|super.?u',  isRegex: true,  actif: true, cat: 'alimentation', sub: 'Courses supermarché'     },
  { id: 'fr_09', pattern: 'assurance.*maladie|cpam|ameli', isRegex: true, actif: true, cat: 'sante',   sub: 'Mutuelle & assurance santé'},
  { id: 'fr_10', pattern: 'dgfip|tresor.public|impot', isRegex: true, actif: true, cat: 'assurances',  sub: 'Impôts & taxes'         },
  { id: 'fr_11', pattern: 'caf\\.fr|caf.*alloc',    isRegex: true,  actif: true, cat: 'revenus',      sub: 'Virement entrant'        },
  { id: 'fr_12', pattern: 'leroy.merlin|brico.depot|castorama', isRegex: true, actif: true, cat: 'logement', sub: 'Entretien & réparation'},
  { id: 'fr_13', pattern: 'seolis|total.energies|engie|edf', isRegex: true, actif: true, cat: 'logement', sub: 'Électricité & gaz'  },
  { id: 'fr_14', pattern: 'doctolib',               isRegex: false, actif: true, cat: 'sante',         sub: 'Médecin & spécialiste'  },
  { id: 'fr_15', pattern: 'alan.*sante|alan.*mutuelle', isRegex: true, actif: true, cat: 'sante',       sub: 'Mutuelle & assurance santé'},
]

// ─── IMPORT ───────────────────────────────────────────────────────────────────

export default MappingUI
