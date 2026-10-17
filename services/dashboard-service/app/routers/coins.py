"""Coins are manager-confirmed, with rule and recording snapshots that survive reanalysis."""
import json
import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, get_mobile_user
from app.routers.upsell import _allowed_stores, _check_store, _seller_or_404

router = APIRouter(prefix='/api/v1/dashboard/coins', tags=['motivation'])
CATEGORIES = ('size','addon','food','drink','loyalty','promo','other')

class Rule(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    category: Literal['size','addon','food','drink','loyalty','promo','other']
    item_pattern: str = Field(default='', max_length=120)
    coins: int = Field(ge=1, le=1000, strict=True)

    @model_validator(mode='after')
    def clean(self):
        self.label = self.label.strip()
        self.item_pattern = self.item_pattern.strip().casefold()
        if not self.label:
            raise ValueError('Название не должно быть пустым')
        return self

class RulesUpdate(BaseModel):
    store_id: uuid.UUID | None = None
    rules: list[Rule] = Field(max_length=50)

    @model_validator(mode='after')
    def unique(self):
        keys = [(r.category, r.item_pattern) for r in self.rules]
        if len(keys) != len(set(keys)):
            raise ValueError('Два правила для одной категории и товара')
        return self

class Decision(BaseModel):
    action: Literal['confirmed','rejected','voided']
    reason: str = Field(default='', max_length=500)

def match_rule(rules, offer):
    """One award per offer. Longer product filters win over a category fallback."""
    item = offer['item'].casefold()
    matched = [r for r in rules if r['category'] == offer['category']
               and (not r['item_pattern'] or r['item_pattern'] in item)]
    return max(matched, key=lambda r:len(r['item_pattern']), default=None)

def scope(user, alias='c'):
    params = {'org':uuid.UUID(user['organization_id'])}
    sql = f'{alias}.organization_id=:org'
    stores = _allowed_stores(user)
    if stores is not None:
        sql += f' AND {alias}.store_id=ANY(:stores)'
        params['stores'] = [uuid.UUID(s) for s in stores]
    if user.get('role') == 'employee':
        sql += f' AND {alias}.seller_id=:own'
        params['own'] = uuid.UUID(user['seller_id'])
    return sql, params

async def sync_sources(db, user):
    """Capture a recording once, after its completed offer analysis. Never delete on reanalysis.

    Rules apply to the time the recording started, not the analysis/confirmation time.
    No rules => no snapshot yet. Empty published rules disable future awards.
    """
    where, params = scope(user)
    rows = (await db.execute(text(f'''
        SELECT c.id, c.recording_id,c.organization_id,c.store_id,c.seller_id,c.session_date,
               COALESCE(r.started_at,c.analyzed_at) AS at
        FROM analytics.conversations c LEFT JOIN recorder.recordings r ON r.id=c.recording_id
        WHERE {where} AND c.offer_opportunity IS NOT NULL
          AND NOT EXISTS(SELECT 1 FROM analytics.coin_sources x WHERE x.recording_id=c.recording_id)
          AND EXISTS(SELECT 1 FROM analytics.coin_rules p WHERE p.organization_id=c.organization_id
              AND (p.store_id IS NULL OR p.store_id=c.store_id)
              AND p.effective_at<=COALESCE(r.started_at,c.analyzed_at))
        ORDER BY c.analyzed_at LIMIT 500
    '''), params)).mappings().all()
    for c in rows:
        version = (await db.execute(text('''SELECT * FROM analytics.coin_rules
            WHERE organization_id=:org AND (store_id IS NULL OR store_id=:store)
              AND effective_at<=:at
            ORDER BY (store_id IS NOT NULL) DESC,effective_at DESC LIMIT 1
        '''), {'org':c['organization_id'],'store':c['store_id'],'at':c['at']})).mappings().first()
        if not version:
            continue
        claimed = (await db.execute(text('''INSERT INTO analytics.coin_sources(recording_id,organization_id)
            VALUES(:recording,:org) ON CONFLICT DO NOTHING RETURNING recording_id'''),
            {'recording':c['recording_id'],'org':c['organization_id']})).first()
        if not claimed:
            continue
        offers = (await db.execute(text('''SELECT * FROM analytics.conversation_offers
            WHERE conversation_id=:id AND response='accepted' AND technique<>'generic'
            ORDER BY sort_order,id'''), {'id':c['id']})).mappings().all()
        for i, o in enumerate(offers):
            rule = match_rule(version['rules'], o)
            if not rule:
                continue
            await db.execute(text('''INSERT INTO analytics.coin_events
                (organization_id,store_id,seller_id,recording_id,source_order,session_date,
                 item,category,quote,customer_quote,rule_id,rule_label,coins)
                VALUES(:org,:store,:seller,:recording,:n,:day,:item,:category,:quote,:customer,
                       :rule,:label,:coins) ON CONFLICT DO NOTHING'''),
                {'org':c['organization_id'],'store':c['store_id'],'seller':c['seller_id'],
                 'recording':c['recording_id'],'n':i,'day':c['session_date'],'item':o['item'],
                 'category':o['category'],'quote':o['quote'],'customer':o['customer_quote'],
                 'rule':version['id'],'label':rule['label'],'coins':rule['coins']})
    await db.commit()

@router.get('/rules')
async def get_rules(store_id: uuid.UUID | None = None, user=Depends(get_current_user), db=Depends(get_db)):
    if store_id:
        _check_store(user, store_id)
    row = (await db.execute(text('''SELECT * FROM analytics.coin_rules
        WHERE organization_id=:org AND store_id IS NOT DISTINCT FROM :store
        ORDER BY effective_at DESC LIMIT 1'''),
        {'org':uuid.UUID(user['organization_id']),'store':store_id})).mappings().first()
    inherited = None
    if store_id and not row:
        inherited = (await db.execute(text('''SELECT * FROM analytics.coin_rules
            WHERE organization_id=:org AND store_id IS NULL
            ORDER BY effective_at DESC LIMIT 1'''),
            {'org':uuid.UUID(user['organization_id'])})).mappings().first()
    return {'version':dict(row) if row else None, 'inherited':dict(inherited) if inherited else None}

@router.put('/rules')
async def put_rules(body: RulesUpdate, user=Depends(get_current_user), db=Depends(get_db)):
    if user.get('role') not in ('director','admin','manager','rop'):
        raise HTTPException(403, 'Настройка доступна руководителю')
    if body.store_id:
        _check_store(user, body.store_id)
        exists = (await db.execute(text('SELECT id FROM admin_schema.stores WHERE id=:id AND organization_id=:org'),
            {'id':body.store_id,'org':uuid.UUID(user['organization_id'])})).first()
        if not exists:
            raise HTTPException(404, 'Точка недоступна')
    elif user['role'] not in ('director','admin'):
        raise HTTPException(403, 'Для всей сети правила задаёт директор или администратор')
    row = (await db.execute(text('''INSERT INTO analytics.coin_rules(organization_id,store_id,rules,created_by)
        VALUES(:org,:store,CAST(:rules AS jsonb),:by) RETURNING *'''),
        {'org':uuid.UUID(user['organization_id']),'store':body.store_id,
         'rules':json.dumps([r.model_dump() for r in body.rules],ensure_ascii=False),'by':uuid.UUID(user['sub'])})).mappings().first()
    await db.commit()
    return {'version':dict(row)}

@router.get('/events')
async def events(day: date | None = None, store_id: uuid.UUID | None = None,
                 status: Literal['pending','confirmed','rejected','voided'] | None = None,
                 user=Depends(get_current_user), db=Depends(get_db)):
    await sync_sources(db, user)
    where, params = scope(user, 'e')
    if day:
        where += ' AND e.session_date=:day'; params['day']=day
    if store_id:
        _check_store(user,store_id)
        where += ' AND e.store_id=:store'; params['store']=store_id
    if status:
        where += ' AND e.status=:status'; params['status']=status
    rows = (await db.execute(text(f'''SELECT e.*,s.first_name||' '||s.last_name AS seller_name,
        st.name AS store_name,c.id AS conversation_id FROM analytics.coin_events e
        LEFT JOIN admin_schema.sellers s ON s.id=e.seller_id
        LEFT JOIN admin_schema.stores st ON st.id=e.store_id
        LEFT JOIN analytics.conversations c ON c.recording_id=e.recording_id
        WHERE {where} ORDER BY e.created_at DESC,e.id LIMIT 500'''),params)).mappings().all()
    count = (await db.execute(text(f'SELECT COUNT(*) FROM analytics.coin_events e WHERE {where}'),params)).scalar()
    return {'items':[dict(r) for r in rows],'total':count}

@router.post('/events/{event_id}/decision')
async def decide(event_id: uuid.UUID, body: Decision, user=Depends(get_current_user), db=Depends(get_db)):
    where, params = scope(user,'e'); params['id']=event_id
    row = (await db.execute(text(f'''SELECT e.* FROM analytics.coin_events e
        WHERE {where} AND e.id=:id FOR UPDATE'''),params)).mappings().first()
    if not row:
        raise HTTPException(404, 'Начисление недоступно')
    if row['status'] == body.action:
        return dict(row)  # transport retry is safe
    if body.action == 'voided':
        if row['status'] != 'confirmed' or not body.reason.strip():
            raise HTTPException(409, 'Отменить можно подтверждённое начисление; укажите причину')
        sql = '''UPDATE analytics.coin_events SET status='voided',voided_by=:by,
                 voided_at=now(),void_reason=:reason WHERE id=:id RETURNING *'''
    else:
        if row['status'] != 'pending':
            raise HTTPException(409, 'Решение уже принято. Обновите список.')
        if body.action == 'rejected' and not body.reason.strip():
            raise HTTPException(422, 'Укажите причину отказа')
        sql = '''UPDATE analytics.coin_events SET status=:status,decided_by=:by,
                 decided_at=now(),reason=:reason WHERE id=:id RETURNING *'''
    result = (await db.execute(text(sql), {'id':event_id,'by':uuid.UUID(user['sub']),
        'status':body.action,'reason':body.reason.strip()})).mappings().first()
    await db.commit()
    return dict(result)

@router.get('/sellers/{seller_id}')
async def summary(seller_id: uuid.UUID, day: date | None = None,
                  user=Depends(get_mobile_user), db=Depends(get_db)):
    s = await _seller_or_404(db,user,seller_id)
    await sync_sources(db, {**user,'role':'employee','seller_id':str(seller_id),'store_id':str(s.store_id)})
    day = day or date.today()
    params={'org':uuid.UUID(user['organization_id']),'seller':seller_id,'day':day}
    totals = (await db.execute(text('''SELECT
        COALESCE(SUM(coins) FILTER(WHERE status='confirmed'),0) AS balance,
        COALESCE(SUM(coins) FILTER(WHERE status='confirmed' AND session_date=:day),0) AS today,
        COALESCE(SUM(coins) FILTER(WHERE status='pending'),0) AS pending
        FROM analytics.coin_events WHERE organization_id=:org AND seller_id=:seller'''),params)).mappings().first()
    history = (await db.execute(text('''SELECT id,item,coins,status,session_date,rule_label,reason,void_reason,
        decided_at,created_at FROM analytics.coin_events WHERE organization_id=:org AND seller_id=:seller
        ORDER BY created_at DESC,id LIMIT 100'''),params)).mappings().all()
    version = (await db.execute(text('''SELECT rules,effective_at FROM analytics.coin_rules
        WHERE organization_id=:org AND (store_id IS NULL OR store_id=:store)
        ORDER BY (store_id IS NOT NULL) DESC,effective_at DESC LIMIT 1'''),
        {'org':params['org'],'store':s.store_id})).mappings().first()
    is_demo = (await db.execute(text('SELECT slug FROM auth.organizations WHERE id=:id'), {'id':params['org']})).scalar() == 'horeca-demo'
    return {**dict(totals),'is_demo':is_demo,'history':[dict(r) for r in history],
            'rules':version['rules'] if version else [],'effective_at':version['effective_at'] if version else None}
