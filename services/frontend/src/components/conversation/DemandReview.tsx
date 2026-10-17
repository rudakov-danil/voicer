import { Link } from 'react-router-dom'
import { ArrowRight, MessageSquareQuote } from 'lucide-react'
import type { ConversationDemand } from '@/api/demand'
import { L } from '@/i18n'
import '@/styles/demand.css'

/** «Не было в наличии» в карточке разговора: что покупатель просил, что ответили и чем закончилось.
 *  Эти просьбы собираются в раздел «Спрос» — оттуда руководитель отправляет позицию в закупку. */

const OUTCOME: Record<ConversationDemand['outcome'], [string, string]> = {
  substituted: ['купил аналог', 'bought an analog'],
  ordered: ['заказали', 'ordered'],
  lost: ['ушёл без покупки', 'left without it'],
  unknown: ['исход неясен', 'outcome unclear'],
}
const quoted = (s: string) => L(`«${s.replace(/^[«"“\s]+|[»"”\s]+$/g, '')}»`, `“${s.replace(/^[«"“\s]+|[»"”\s]+$/g, '')}”`)

export function DemandReview({ items, onSeek }: { items: ConversationDemand[]; onSeek: (quote: string) => void }) {
  if (!items.length) return null
  return (
    <section className="panel cv-demand" aria-labelledby="cv-demand-title">
      <div className="panel-head">
        <div>
          <h2 id="cv-demand-title" className="panel-title">{L('Не было в наличии', 'Out of stock')}</h2>
          <div className="panel-sub">{L('Что покупатель просил, а этого не оказалось. Просьба уже в разделе «Спрос» — оттуда её отправляют в закупку.',
            'What the customer asked for and did not get. The request is already in Demand, where it can be sent to purchasing.')}</div>
        </div>
        <Link className="link" to="/demand">{L('Спрос', 'Demand')}<ArrowRight size={14} aria-hidden="true" /></Link>
      </div>
      <ul className="cv-demand-list">
        {items.map((d, i) => (
          <li key={i}>
            <div className="cv-demand-top">
              <b translate="no">{d.item}</b>
              <span className="dm-cat">{d.reason === 'not_carried' ? L('не держим', 'not carried') : L('закончился', 'sold out')}</span>
              <span className={`dm-outcome is-${d.outcome}`}>{L(...OUTCOME[d.outcome])}</span>
            </div>
            {d.analog && <div className="cv-demand-analog">{L('Предложили взамен: ', 'Offered instead: ')}<span translate="no">{d.analog}</span></div>}
            {d.quote && (
              <button type="button" className="cv-demand-quote" onClick={() => onSeek(d.quote)} title={L('Перейти к моменту', 'Jump to the moment')}>
                <span translate="no">{quoted(d.quote)}</span>
              </button>
            )}
            {d.seller_quote && (
              <p className="dm-answer" translate="no"><MessageSquareQuote size={13} aria-hidden="true" />{quoted(d.seller_quote)}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
