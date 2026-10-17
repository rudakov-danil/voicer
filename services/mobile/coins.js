import {request, session} from './api.js';
import {withoutPrices} from './content.js';
let ctx, timer, loading = false;
const status = {pending:'На подтверждении',confirmed:'Начислено',rejected:'Отклонено',voided:'Отменено'};
const el = (tag, cls, text) => {const n=document.createElement(tag);n.className=cls||'';if(text!=null)n.textContent=text;return n;};
function render(data, saved) {
  const root=ctx.root;root.replaceChildren();
  if(data.is_demo)root.append(el("p","demo-notice","Демо-данные Coffee Shop · здесь можно изучить начисления"));
  const balance=el('section','card coin-balance');
  balance.append(el('p','eyebrow','ВАШИ МОНЕТЫ'),el('div','coin-total',`${data.balance.toLocaleString('ru-RU')} ◉`),el('p','small muted','За подтверждённые руководителем допродажи'));
  const totals=el('div','coin-totals');
  totals.append(el('span','',`+${data.today} за сегодня`),el('span','',`${data.pending} на подтверждении`));balance.append(totals);root.append(balance);
  if(saved)root.append(el('p','notice',`Нет связи. Показаны сохранённые данные от ${new Date(saved).toLocaleString('ru-RU')}. Баланс может измениться после обновления.`));
  const rules=el('section','card');rules.append(el('h2','','За что можно получить монеты'));
  if(!data.rules.length) rules.append(el('p','small muted','Руководитель ещё не включил начисления. Правила появятся здесь после настройки.'));
  for(const r of data.rules){const row=el('div','coin-row');row.append(el('span','',withoutPrices(r.label)||'Допродажа'),el('b','',`+${r.coins} ◉`));rules.append(row);if(withoutPrices(r.item_pattern))rules.append(el('p','small muted',`Товар: ${r.item_pattern}`));}
  rules.append(el('p','small muted','Монеты начисляются после проверки продажи руководителем. Условия обмена на награды уточните у него.'));root.append(rules);
  const history=el('section','coin-history');const head=el('div','section-heading');head.append(el('h2','','История монет'));
  const refresh=el('button','text-button','Обновить');refresh.type='button';refresh.addEventListener('click',()=>loadCoins());head.append(refresh);history.append(head);
  if(!data.history.length)history.append(el('div','empty','Начислений пока нет. После успешной допродажи здесь появится заявка на подтверждение.'));
  for(const e of data.history){const row=el('article','card coin-event');const top=el('div','coin-row');top.append(el('b','',withoutPrices(e.item)||'Допродажа'),el('b',e.status==='confirmed'?'coin-good':'',`${e.coins} ◉`));row.append(top,el('p',`small coin-status ${e.status}`,status[e.status]),el('p','small muted',`${e.session_date} · ${withoutPrices(e.rule_label)||'Допродажа'}`));const reason=withoutPrices(e.void_reason||e.reason);if(reason)row.append(el('p','small muted',`Причина: ${reason}`));history.append(row);}
  root.append(history);
}
export async function loadCoins(){
  if(!ctx||ctx.root.hidden||loading||!session)return;
  const id=ctx.sellerId();if(!id){ctx.root.replaceChildren(el('div','empty','Выберите сотрудника для просмотра монет.'));return;}
  const owner=`${session.user.organization_id}:${session.user.id}`;
  const key=`voicer-coins:${owner}:${id}`;loading=true;
  try{const date=new Date();const day=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;const data=await request(`/api/v1/dashboard/coins/sellers/${id}?day=${day}`);if(ctx.sellerId()!==id||`${session?.user.organization_id}:${session?.user.id}`!==owner)return;try{localStorage.setItem(key,JSON.stringify({data,at:Date.now()}));}catch{}render(data);}
  catch(error){if(ctx.sellerId()!==id||`${session?.user.organization_id}:${session?.user.id}`!==owner)return;let cached;try{cached=JSON.parse(localStorage.getItem(key)||'null');}catch{}if(cached)render(cached.data,cached.at);else{ctx.root.replaceChildren(el('div','empty','Не удалось загрузить монеты. Проверьте связь.'));const b=el('button','text-button','Повторить');b.addEventListener('click',()=>loadCoins());ctx.root.append(b);}}
  finally{loading=false;}
}
export function initCoins(context){ctx=context;document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')loadCoins();});}
export function showCoins(visible){clearInterval(timer);if(visible){loadCoins();timer=setInterval(loadCoins,120000);}}
