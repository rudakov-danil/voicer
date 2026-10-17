import { Check, MessageSquareQuote, Minus, X } from 'lucide-react'
import { L, locale } from '@/i18n'
import { rub } from '@/components/upsells/metrics'
import '@/styles/upsells.css'

/** Разбор допродажи в разговоре (dashboard-service, conversation.offers_analysis; analytics 0010):
 *  что гость заказал, что ему предложили, каким приёмом и что он ответил, что упущено. */
export interface OffersAnalysis {
  order_taken: boolean
  offers_count: number | null
  offers_accepted: number | null
  check_total: number | null
  order_items: string[]
  missed: string | null
  better_phrase: string | null
  offers: Array<{
    item: string
    category: string
    kind: string
    technique: string
    response: 'accepted' | 'declined' | 'no_answer'
    is_focus: boolean
    quote: string
    customer_quote: string
  }>
}

const TECHNIQUE: Record<string, [string, string]> = {
  generic: ['общий вопрос «Что-нибудь ещё?»', 'generic “Anything else?”'],
  specific: ['конкретный товар', 'specific item'],
  choice: ['выбор из вариантов', 'choice of options'],
  benefit: ['с аргументом', 'with a reason'],
  promo: ['акция или комбо', 'promo or combo'],
}
const RESPONSE: Record<string, [string, string]> = {
  accepted: ['Взяли', 'Accepted'],
  declined: ['Отказались', 'Declined'],
  no_answer: ['Без ответа', 'No answer'],
}
const quoted = (s: string) => {
  const q = s.replace(/^[«"“\s]+|[»"”\s]+$/g, '')
  return L(`«${q}»`, `“${q}”`)
}

export function OffersReview({ data, onSeek }: { data: OffersAnalysis; onSeek?: (quote: string) => void }) {
  if (!data.order_taken) return null
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">{L('Разбор допродажи', 'Add-on review')}</h2>
          <div className="panel-sub">
            {data.offers_count
              ? L(`Предложений: ${data.offers_count}, взяли ${data.offers_accepted ?? 0}`, `${data.offers_count} offers, ${data.offers_accepted ?? 0} accepted`)
              : L('Ничего не предложили', 'Nothing was offered')}
            {data.check_total != null && L(` · чек ${rub(data.check_total)}`, ` · check ${rub(data.check_total)}`)}
          </div>
        </div>
      </div>
      <div className="panel-body cv-offers">
        {data.order_items.length > 0 && (
          <p className="cv-offers-order">{L('Заказ: ', 'Order: ')}<span translate="no">{data.order_items.join(', ')}</span></p>
        )}
        {data.offers.map((o, i) => (
          <div key={i} className={`cv-offer2 is-${o.response}`}>
            <span className="cv-offer2-ico" aria-hidden="true">
              {o.response === 'accepted' ? <Check size={14} strokeWidth={2.75} /> : o.response === 'declined' ? <X size={14} strokeWidth={2.75} /> : <Minus size={14} strokeWidth={2.75} />}
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="cv-offer2-head">
                <b translate="no">{o.item}</b>
                <span className="cv-offer2-state">{L(...(RESPONSE[o.response] ?? ['', '']))}</span>
                {o.is_focus && <span className="up-chip is-accepted">{L('товар дня', 'item of the day')}</span>}
              </div>
              <div className="cv-offer2-meta">{TECHNIQUE[o.technique] ? L(...TECHNIQUE[o.technique]) : o.technique}</div>
              {o.quote && (
                <button type="button" className="cv-offer2-quote" onClick={() => onSeek?.(o.quote)} disabled={!onSeek}
                  title={L('Перейти к моменту', 'Jump to the moment')}>
                  <span translate="no">{quoted(o.quote)}</span>
                </button>
              )}
              {o.customer_quote && <div className="cv-offer2-reply">{L('Ответ: ', 'Reply: ')}<span translate="no">{quoted(o.customer_quote)}</span></div>}
            </div>
          </div>
        ))}
        {data.missed && <p className="up-missed"><b>{L('Упущено: ', 'Missed: ')}</b><span translate="no">{data.missed}</span></p>}
        {data.better_phrase && (
          <p className="up-better"><MessageSquareQuote size={13} aria-hidden="true" />{L('Можно было сказать: ', 'Could have said: ')}<span translate="no">{quoted(data.better_phrase)}</span></p>
        )}
      </div>
    </section>
  )
}
