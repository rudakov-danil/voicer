import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Coins, Plus, Trash2, Smartphone, Check, X, ExternalLink } from 'lucide-react'
import api from '@/api/client'
import { adminApi } from '@/api/admin'
import { useOrganization } from '@/lib/terms'
import { useAuthStore } from '@/store/authStore'
import '@/styles/motivation.css'

type Rule = { label: string; category: string; item_pattern: string; coins: number }
type Event = { id: string; item: string; coins: number; status: string; seller_name: string;
  store_name: string; session_date: string; rule_label: string; quote: string; customer_quote: string;
  conversation_id: string | null; reason: string; void_reason: string }
const categories: Record<string,string> = {size:'Больший размер',addon:'Добавка',food:'Еда и выпечка',drink:'Напиток',loyalty:'Лояльность',promo:'Акция или комбо',other:'Другое'}
const pharmacyTexts: Record<string, string> = {
  "Ссылка готова. Передайте её сотруднику лично.": "Ссылка готова. Передайте её фармацевту лично.",
  "Доступ сотрудника к приложению отозван.": "Доступ фармацевта к приложению отозван.",
  "Выберите точку": "Выберите аптеку",
  "Задайте стоимость категории или конкретного товара. Собственные правила точки полностью заменяют правила сети для этой точки. Внутри категории действует самое точное совпадение по названию товара.": "Задайте стоимость категории или конкретного товара. Собственные правила аптеки полностью заменяют правила сети для этой аптеки. Внутри категории действует самое точное совпадение по названию товара.",
  "Согласие гостя создаёт заявку. Руководитель проверяет продажу и подтверждает монеты. Монеты не равны рублям; автоматической проверки оплаты по кассе пока нет.": "Согласие покупателя создаёт заявку. Руководитель проверяет продажу и подтверждает монеты. Монеты не равны деньгам; автоматической проверки оплаты по кассе пока нет.",
  "Эта точка использует правила сети. Сохранение создаст собственную версию для точки; исходные значения уже подставлены ниже.": "Эта аптека использует правила сети. Сохранение создаст собственную версию для аптеки; исходные значения уже подставлены ниже.",
  "Например, выпечка к кофе": "Например, пробиотик к антибиотику",
  "Приложение сотрудника": "Приложение фармацевта",
  "Сотрудник видит свою смену, советы и монеты. Ссылка одноразовая, действует 24 часа. Новая ссылка отключает прежнее подключение этого сотрудника.": "Фармацевт видит свою смену, советы и монеты. Ссылка одноразовая, действует 24 часа. Новая ссылка отключает прежнее подключение этого фармацевта.",
  "Сотрудник": "Фармацевт",
  "Загружаем сотрудников…": "Загружаем фармацевтов…",
  "Не удалось загрузить сотрудников": "Не удалось загрузить фармацевтов",
  "Выберите сотрудника": "Выберите фармацевта",
  "Сверьте товар и ответ гостя с записью и кассой. Подтверждайте только состоявшуюся продажу.": "Сверьте товар и ответ покупателя с записью и кассой. Подтверждайте только состоявшуюся продажу.",
  "Сотрудник: «": "Фармацевт: «",
  "Гость: «": "Покупатель: «"
}
const pharmacyCategories: Record<string, string> = {
  "other": "Сопутствующий товар",
  "size": "Упаковка побольше",
  "promo": "Акция или товар дня",
  "loyalty": "Карта лояльности",
  "addon": "Дополнение к препарату",
  "food": "Питание",
  "drink": "Вода и напитки"
}
const statuses: Record<string,string> = {pending:'На подтверждении',confirmed:'Начислено',rejected:'Отклонено',voided:'Отменено'}
const errorText = (e: any) => typeof e?.response?.data?.detail === 'string' ? e.response.data.detail : 'Не удалось выполнить действие. Проверьте данные и попробуйте ещё раз.'

export function MotivationPage() {
  const user = useAuthStore(s => s.user)
  const qc = useQueryClient()
  const {data:organization}=useOrganization()
  const isPharmacy = organization?.industry === 'pharmacy'
  const ph = (text: string) => isPharmacy ? pharmacyTexts[text] || text : text
  const [store, setStore] = useState(user?.role === 'manager' ? user.store_id || '' : '')
  const [tab,setTab] = useState<'rules'|'pending'|'history'>('rules')
  const [draft,setDraft] = useState<Rule[]>([])
  const [notice,setNotice] = useState('')
  const [reason,setReason] = useState('')
  const [decision,setDecision] = useState<{id:string;action:'rejected'|'voided'} | null>(null)
  const [sellerId,setSellerId] = useState('')
  const [invitation,setInvitation] = useState<{url:string;expires_at:string;seller_name:string}|null>(null)
  const {data:stores} = useQuery({queryKey:['admin-stores'],queryFn:()=>adminApi.getStores()})
  const {data:roster,isLoading:loadingRoster,isError:rosterError} = useQuery({queryKey:['motivation-roster',user?.organization_id,store],queryFn:()=>adminApi.getSellers({store_id:store||undefined,is_active:true,limit:200})})
  const canOrg = user?.role === 'director' || user?.role === 'admin'
  const ruleKey = ['coin-rules',user?.organization_id,store]
  const {data:rules,isLoading:loadingRules,isError:rulesError} = useQuery({queryKey:ruleKey,
    queryFn:async()=> (await api.get('/api/v1/dashboard/coins/rules',{params:{store_id:store||undefined}})).data,
    staleTime:Infinity})
  useEffect(()=>{setDraft(rules?.version?.rules||rules?.inherited?.rules||[])},[rules])
  const {data:events,isLoading:loadingEvents,isError:eventsError} = useQuery<{items:Event[];total:number}>({queryKey:['coin-events',user?.organization_id,store,tab],
    queryFn:async()=> (await api.get('/api/v1/dashboard/coins/events',{params:{store_id:store||undefined,status:tab==='pending'?'pending':undefined}})).data,
    enabled:tab!=='rules',refetchInterval:60000})
  const save = useMutation({mutationFn:async()=> (await api.put('/api/v1/dashboard/coins/rules',{store_id:store||null,rules:draft})).data,
    onSuccess:(data)=>{qc.setQueryData(ruleKey,data);setNotice('Правила опубликованы. Они действуют для новых записей с этого момента.')},onError:e=>setNotice(errorText(e))})
  const decide = useMutation({mutationFn:async({id,action,reason}:{id:string;action:string;reason?:string})=>
    api.post(`/api/v1/dashboard/coins/events/${id}/decision`,{action,reason:reason||''}),
    onSuccess:()=>{qc.invalidateQueries({queryKey:['coin-events']});setDecision(null);setReason('');setNotice('Решение сохранено.')},onError:e=>setNotice(errorText(e))})
  const connect = useMutation({mutationFn:async()=> (await api.post('/api/v1/auth/mobile/invitations',{seller_id:sellerId})).data,
    onSuccess:data=>{setInvitation(data);setNotice(ph('Ссылка готова. Передайте её сотруднику лично.'))},onError:e=>setNotice(errorText(e))})
  const revoke = useMutation({mutationFn:()=>api.delete(`/api/v1/auth/mobile/accounts/${sellerId}`),
    onSuccess:()=>{setInvitation(null);setNotice(ph('Доступ сотрудника к приложению отозван.'))},onError:e=>setNotice(errorText(e))})
  const update = (i:number,patch:Partial<Rule>)=>setDraft(rows=>rows.map((r,n)=>i===n?{...r,...patch}:r))

  return <div className="motivation">
    <div className="mo-heading"><div><h2><Coins size={25}/>Монеты за допродажи</h2><p>Ценность допродаж, прозрачные начисления и приложение для команды.</p></div>
      <label className="mo-scope">Правила и начисления<select value={store} disabled={save.isPending||connect.isPending||revoke.isPending||decide.isPending} onChange={e=>{setStore(e.target.value);setNotice('');setInvitation(null);setSellerId('')}}>
        <option value="">{canOrg?'Вся сеть':ph('Выберите точку')}</option>
        {(stores?.items||[]).filter(s=>s.is_active).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
      </select></label></div>
    <div className="seg mo-tabs"><button aria-pressed={tab==='rules'} onClick={()=>setTab('rules')}>Правила монет</button><button aria-pressed={tab==='pending'} onClick={()=>setTab('pending')}>Подтверждение</button><button aria-pressed={tab==='history'} onClick={()=>setTab('history')}>История</button></div>
    {organization?.slug==="horeca-demo" && <p className="mo-info">Демо-данные Coffee Shop: смены, правила и начисления вымышлены. Здесь можно менять стоимость допродаж и пробовать подтверждение заявок.</p>}
    {notice && <p className="mo-notice" role="status">{notice}</p>}
    {tab==='rules'?<>
      <section className="panel mo-panel"><h2>За что начислять монеты</h2><p className="mo-muted">{ph("Задайте стоимость категории или конкретного товара. Собственные правила точки полностью заменяют правила сети для этой точки. Внутри категории действует самое точное совпадение по названию товара.")}</p>
        <p className="mo-info">{ph("Согласие гостя создаёт заявку. Руководитель проверяет продажу и подтверждает монеты. Монеты не равны рублям; автоматической проверки оплаты по кассе пока нет.")}</p>
        {loadingRules?<p role="status">Загружаем правила…</p>:rulesError?<p role="alert">Не удалось загрузить правила. Обновите страницу.</p>:<>
          {rules?.inherited && !rules?.version && <p className="mo-info">{ph("Эта точка использует правила сети. Сохранение создаст собственную версию для точки; исходные значения уже подставлены ниже.")}</p>}
          {rules?.version && <p className="mo-muted">Текущая версия действует с {new Date(rules.version.effective_at).toLocaleString('ru-RU')}. Изменения не пересчитывают прежние начисления.</p>}
          {!draft.length && <div className="mo-empty">Монеты пока не начисляются. Добавьте первое правило. Если сохранить пустой список, начисления для новых записей в этой области будут отключены.</div>}
          {draft.map((r,i)=><div className="mo-rule" key={i}>
            <label>Название правила<input value={r.label} maxLength={120} onChange={e=>update(i,{label:e.target.value})} placeholder={ph("Например, выпечка к кофе")}/></label>
            <label>Категория<select value={r.category} onChange={e=>update(i,{category:e.target.value})}>{Object.entries(isPharmacy ? pharmacyCategories : categories).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
            <label>Название товара содержит<input value={r.item_pattern} maxLength={120} onChange={e=>update(i,{item_pattern:e.target.value})} placeholder="Пусто — вся категория"/></label>
            <label>Монет<input type="number" min={1} max={1000} step={1} value={Number.isFinite(r.coins)?r.coins:''} onChange={e=>update(i,{coins:Number(e.target.value)})}/></label>
            <button className="btn-icon" aria-label={`Удалить правило ${r.label||i+1}`} onClick={()=>setDraft(rows=>rows.filter((_,n)=>n!==i))}><Trash2 size={17}/></button>
          </div>)}
          <div className="mo-actions"><button className="btn btn-outline" disabled={draft.length>=50} onClick={()=>setDraft(rows=>[...rows,{label:'',category:isPharmacy?'other':'food',item_pattern:'',coins:10}])}><Plus size={16}/>Добавить правило</button>
            <button className="btn btn-primary" disabled={save.isPending||(!canOrg&&!store)||draft.some(r=>!r.label.trim()||!Number.isInteger(r.coins)||r.coins<1||r.coins>1000)} onClick={()=>save.mutate()}>{save.isPending?'Сохраняем…':'Опубликовать правила'}</button></div>
        </>}
      </section>
      <section className="panel mo-panel"><h2><Smartphone size={20}/>{ph("Приложение сотрудника")}</h2><p className="mo-muted">{ph("Сотрудник видит свою смену, советы и монеты. Ссылка одноразовая, действует 24 часа. Новая ссылка отключает прежнее подключение этого сотрудника.")}</p>
        <div className="mo-connect"><label>{ph("Сотрудник")}<select value={sellerId} onChange={e=>{setSellerId(e.target.value);setInvitation(null)}}><option value="">{loadingRoster?ph("Загружаем сотрудников…"):rosterError?ph("Не удалось загрузить сотрудников"):ph("Выберите сотрудника")}</option>{(roster?.items||[]).map(s=><option key={s.id} value={s.id}>{s.first_name} {s.last_name}{!store&&s.store_name?` · ${s.store_name}`:''}</option>)}</select></label>
          <button className="btn btn-primary" disabled={!sellerId||connect.isPending||revoke.isPending} onClick={()=>connect.mutate()}>{connect.isPending?'Готовим…':'Создать ссылку подключения'}</button>
          <button className="btn btn-outline" disabled={!sellerId||revoke.isPending||connect.isPending} onClick={()=>revoke.mutate()}>Отозвать доступ</button></div>
        {invitation&&<div className="mo-link"><label>Личная ссылка для {invitation.seller_name}<input readOnly value={invitation.url} onFocus={e=>e.target.select()}/></label><button className="btn btn-outline" onClick={async()=>{try{await navigator.clipboard.writeText(invitation.url);setNotice('Ссылка скопирована.')}catch{setNotice('Выделите и скопируйте ссылку из поля.')}}}>Скопировать</button><p className="mo-muted">Действует до {new Date(invitation.expires_at).toLocaleString('ru-RU')}.</p></div>}
        <a className="mo-app-link" href="https://mobile.voicer-ai.pro/app.html" target="_blank" rel="noopener">Открыть приложение <ExternalLink size={14}/></a>
      </section>
    </>:<section className="panel mo-panel"><h2>{tab==='pending'?'Проверьте успешные допродажи':'История решений'}</h2>
      <p className="mo-muted">{tab==='pending'?ph('Сверьте товар и ответ гостя с записью и кассой. Подтверждайте только состоявшуюся продажу.'):'Подтверждённые монеты входят в баланс. Отмена сохраняет причину и исходное решение.'}</p>
      {loadingEvents?<p role="status">Загружаем…</p>:eventsError?<p role="alert">Не удалось загрузить начисления. Обновите страницу.</p>:!events?.items.length?<div className="mo-empty">{tab==='pending'?'Нет заявок на подтверждение. Они появятся после разбора новых записей, для которых действуют правила монет.':'Начислений пока нет.'}</div>:<>
        <p className="mo-muted">Показано {events.items.length} из {events.total}</p>
        {events.items.map(e=><article className="mo-event" key={e.id}><div className="mo-event-head"><div><b>{e.item}</b><p>{e.seller_name} · {e.store_name} · {e.session_date}</p></div><span className={`mo-status ${e.status}`}>{statuses[e.status]} · {e.coins} монет</span></div>
          <p className="mo-muted">Правило: {e.rule_label}</p><blockquote>{ph("Сотрудник: «")}{e.quote}»<br/>{ph("Гость: «")}{e.customer_quote||'Ответ не выделен'}»</blockquote>
          {(e.reason||e.void_reason)&&<p className="mo-muted">Причина: {e.void_reason||e.reason}</p>}
          <div className="mo-actions">{e.conversation_id&&<Link className="btn btn-ghost" to={`/conversations/${e.conversation_id}`}>Проверить разговор</Link>}
            {e.status==='pending'&&<><button className="btn btn-primary" disabled={decide.isPending} onClick={()=>decide.mutate({id:e.id,action:'confirmed'})}><Check size={15}/>Подтвердить продажу</button><button className="btn btn-outline" onClick={()=>{setDecision({id:e.id,action:'rejected'});setReason('')}}><X size={15}/>Отклонить</button></>}
            {e.status==='confirmed'&&<button className="btn btn-outline" onClick={()=>{setDecision({id:e.id,action:'voided'});setReason('')}}>Отменить начисление</button>}</div>
          {decision?.id===e.id&&<div className="mo-reason"><label>Причина {decision.action==='rejected'?'отказа':'отмены'}<input value={reason} maxLength={500} onChange={e=>setReason(e.target.value)} autoFocus/></label><button className="btn btn-primary" disabled={!reason.trim()||decide.isPending} onClick={()=>decide.mutate({...decision,reason})}>Сохранить решение</button><button className="btn btn-ghost" onClick={()=>setDecision(null)}>Закрыть</button></div>}
        </article>)}
      </>}
    </section>}
  </div>
}
