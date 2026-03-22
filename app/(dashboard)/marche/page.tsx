'use client'
import { useState } from 'react'
import { TrendingUp } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'

const lineData = [
  { name: 'Juil', Wave: 42, MTN: 65, Orange: 30 },
  { name: 'Août', Wave: 48, MTN: 62, Orange: 33 },
  { name: 'Sep',  Wave: 51, MTN: 60, Orange: 35 },
  { name: 'Oct',  Wave: 58, MTN: 58, Orange: 38 },
  { name: 'Nov',  Wave: 65, MTN: 55, Orange: 36 },
  { name: 'Déc',  Wave: 72, MTN: 52, Orange: 39 },
  { name: 'Jan',  Wave: 80, MTN: 50, Orange: 42 },
]

const pieData = [
  { name: 'Wave', value: 38, color: '#0F4C81' },
  { name: 'MTN MoMo', value: 29, color: '#BA7517' },
  { name: 'Orange Money', value: 20, color: '#639922' },
  { name: 'Autres', value: 13, color: '#A0AEC0' },
]

const signals = [
  { type: 'up', label: 'Tendance haussière', text: 'Adoption mobile money +34% — segment 18–35 ans, milieu urbain' },
  { type: 'alert', label: 'Menace émergente', text: '2 nouveaux entrants identifiés Q4 avec backing régional' },
  { type: 'opp', label: 'Opportunité', text: 'Segment PME sous-adressé — aucun acteur majeur positionné' },
]

export default function MarchePage() {
  const [sector, setSector] = useState('Fintech')
  const [country, setCountry] = useState('Côte d\'Ivoire')
  const [period, setPeriod] = useState('6 mois')

  return (
    <div className="max-w-5xl mx-auto pb-20 lg:pb-0">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-5">
        {[
          { label: 'Secteur', value: sector, set: setSector, opts: ['Fintech','E-commerce','Télécom','Logistique','Santé'] },
          { label: 'Pays', value: country, set: setCountry, opts: ['Côte d\'Ivoire','Sénégal','Ghana','Nigeria','Kenya'] },
          { label: 'Période', value: period, set: setPeriod, opts: ['1 mois','3 mois','6 mois','1 an','2 ans'] },
        ].map(({ label, value, set, opts }) => (
          <select key={label} value={value} onChange={e => set(e.target.value)}
            className="text-sm px-3 py-2 border border-neutral-200 rounded-lg bg-white text-neutral-900 outline-none focus:border-blue-700">
            {opts.map(o => <option key={o}>{o}</option>)}
          </select>
        ))}
        <button className="btn-primary text-sm px-4 py-2">Analyser</button>
      </div>

      {/* Main chart */}
      <div className="card-lg mb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-neutral-900">Activité concurrentielle</h2>
            <p className="text-xs text-neutral-500">{sector} · {country} · {period}</p>
          </div>
          <div className="flex gap-3">
            {[{c:'#0F4C81',n:'Wave'},{c:'#BA7517',n:'MTN'},{c:'#639922',n:'Orange'}].map(({c,n}) => (
              <div key={n} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{background:c}} />
                <span className="text-xs text-neutral-500">{n}</span>
              </div>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={lineData} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F0F4F8" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#718096' }} />
            <YAxis tick={{ fontSize: 11, fill: '#718096' }} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '0.5px solid #E2E8F0' }} />
            <Line type="monotone" dataKey="Wave" stroke="#0F4C81" strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="MTN" stroke="#BA7517" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Orange" stroke="#639922" strokeWidth={2} dot={false} strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Signaux clés */}
        <div className="card-lg">
          <h2 className="text-sm font-bold text-neutral-900 mb-4">Signaux clés</h2>
          <div className="space-y-3">
            {signals.map(({ type, label, text }) => (
              <div key={label} className={`flex gap-3 p-3 rounded-lg ${
                type === 'up' ? 'bg-green-50 border border-green-100' :
                type === 'alert' ? 'bg-red-50 border border-red-100' :
                'bg-blue-50 border border-blue-100'
              }`}>
                <div className="flex-shrink-0 text-base">
                  {type === 'up' ? '📈' : type === 'alert' ? '⚠️' : '💡'}
                </div>
                <div>
                  <div className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${
                    type === 'up' ? 'text-green-700' : type === 'alert' ? 'text-red-700' : 'text-blue-700'
                  }`}>{label}</div>
                  <div className="text-xs text-neutral-700 leading-relaxed">{text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Parts de voix */}
        <div className="card-lg">
          <h2 className="text-sm font-bold text-neutral-900 mb-4">Parts de voix digitale</h2>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value">
                {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{fontSize:11,color:'#4A5568'}}>{v}</span>} />
              <Tooltip formatter={(v: any) => [`${v}%`, '']} contentStyle={{fontSize:12,borderRadius:8}} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-3 p-3 bg-neutral-50 rounded-lg">
            <div className="text-xs font-bold text-neutral-700 mb-1">Analyse</div>
            <div className="text-xs text-neutral-600 leading-relaxed">
              Wave consolide sa position avec +14pts en 6 mois. MTN recule de 15pts. Opportunité sur les segments non-couverts.
            </div>
          </div>
        </div>
      </div>

      {/* Insight IA */}
      <div className="mt-4 p-4 bg-blue-700 rounded-xl text-white">
        <div className="flex items-start gap-3">
          <TrendingUp size={18} className="flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-bold mb-1">Analyse IA — Résumé stratégique</div>
            <div className="text-xs text-blue-200 leading-relaxed">
              Le marché fintech CI connaît une consolidation autour de Wave et Orange Money. La fenêtre d'opportunité pour les acteurs B2B PME reste ouverte sur les 6 prochains mois, aucun acteur majeur n'étant positionné sur ce segment.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
