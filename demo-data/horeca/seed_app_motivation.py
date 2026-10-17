"""Additive Coffee Shop app fixtures. Hard-bound to horeca-demo; never resets history.

Run inside dashboard-service: python seed_app_motivation.py --apply [--day YYYY-MM-DD]
Use --database coffee_shop_demo_test for rehearsal. Default is a read-only plan.
Synthetic conversations retain their transcripts, offers, scores and evidence.
"""
import argparse
import asyncio
import json
import os
import re
import uuid
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from urllib.parse import urlsplit, urlunsplit
from zoneinfo import ZoneInfo

import asyncpg

ORG = uuid.UUID('c9842e2d-9d12-51ad-8880-08cb67489cac')
NS = uuid.uuid5(uuid.NAMESPACE_URL, 'https://horeca.voicer-ai.pro/coffee-shop-motivation-v1')
SEED = 'coffee-shop-motivation-v1'
N_ORDERS = 18
GUEST_NAMES = dict(zip(['Анна','Сергей','Мария','Дмитрий','Ольга','Илья','Катя','Павел','Лена','Артём','Ира','Никита','Света','Олег'], ['Айдана','Асылбек','Гүлнұр','Ерасыл','Жанар','Арман','Аружан','Әлихан','Динара','Данияр','Айгерім','Бекзат','Әсел','Нұрбол']))
STORES = {
    '37dfb88a-cb8c-5ff7-ab69-111d180dc9fb': 'Coffee Shop 01',
    '5a7b802b-e1ca-5637-b8a8-1900dafbf451': 'Coffee Shop 02',
    '8a47187a-6784-5d37-b3d0-04c07711422a': 'Coffee Shop 03',
}
NAMES = {
    '5686b4a2-22a2-5c39-95f6-788ef18c1249': ('Айгерім', 'Сейтова'),
    '45f723b6-3a22-51de-90e4-9a964e0d26d7': ('Әлихан', 'Төлегенов'),
    'c1745405-7cf4-5667-a3fc-c953c47e73e6': ('Данияр', 'Омаров'),
    'bfea175b-1354-5a18-a0f4-98b40bf29db4': ('Аружан', 'Нұрланова'),
    'be7eb79c-3977-5641-af37-8174902f7b23': ('Нұрсұлтан', 'Қайратұлы'),
    'e70939ab-799b-56b0-bea0-a8b89583cd07': ('Мадина', 'Ермекова'),
    '479478ba-6c4d-5b98-8d85-9b58d9520af8': ('Аян', 'Әбілов'),
    '10652a1f-7be5-53a4-bd75-0fe640113a40': ('Әсел', 'Жұмабаева'),
}
RULES = [
    {'label':'Больший размер напитка','category':'size','item_pattern':'','coins':5},
    {'label':'Сироп или добавка','category':'addon','item_pattern':'','coins':3},
    {'label':'Выпечка к кофе','category':'food','item_pattern':'','coins':10},
    {'label':'Сезонный тыквенный латте','category':'drink','item_pattern':'тыквенный латте','coins':15},
]
TABLES = [
    ('transcription','transcript_segments','transcript_id'),
    ('analytics','conversation_script_results','conversation_id'),
    ('analytics','conversation_scores','conversation_id'),
    ('analytics','objections','conversation_id'),
    ('analytics','conversation_compliance_violations','conversation_id'),
    ('analytics','conversation_offers','conversation_id'),
]

def uid(key):
    return uuid.uuid5(NS, key)

def match(rules, offer):
    rows = [r for r in rules if r['category']==offer['category']
            and (not r['item_pattern'] or r['item_pattern'] in offer['item'].casefold())]
    return max(rows,key=lambda r:len(r['item_pattern']),default=None)

def rename_strings(row):
    return {key:re.sub(r"\b("+"|".join(GUEST_NAMES)+r")\b",lambda m:GUEST_NAMES[m.group()],value) if isinstance(value,str) else value for key,value in row.items()}

def json_value(value):
    return json.loads(value) if isinstance(value,str) else value

async def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--day',type=date.fromisoformat,default=datetime.now(ZoneInfo('Asia/Almaty')).date())
    parser.add_argument('--database')
    args=parser.parse_args()
    days=[args.day-timedelta(days=1),args.day]
    dsn=os.environ['DATABASE_URL'].replace('postgresql+asyncpg://','postgresql://')
    if args.database:
        if args.database != 'coffee_shop_demo_test':
            raise RuntimeError('Only the named isolated rehearsal database is permitted')
        url=urlsplit(dsn);dsn=urlunsplit(url._replace(path='/'+args.database))
    conn=await asyncpg.connect(dsn)
    try:
        org=await conn.fetchrow('SELECT * FROM auth.organizations WHERE id=$1',ORG)
        assert org and org['slug']=='horeca-demo' and org['industry']=='coffee', 'Demo scope mismatch'
        sellers=await conn.fetch('SELECT * FROM admin_schema.sellers WHERE organization_id=$1 ORDER BY created_at,id',ORG)
        assert {str(s['id']) for s in sellers}==set(NAMES),'Unexpected demo roster; refusing a partial rename'
        stores=await conn.fetch('SELECT id FROM admin_schema.stores WHERE organization_id=$1',ORG)
        assert {str(s['id']) for s in stores}==set(STORES),'Unexpected demo store IDs'
        actor=await conn.fetchval("SELECT u.id FROM auth.users u JOIN auth.organizations o ON o.id=u.organization_id WHERE o.slug='demo' AND u.role IN ('director','admin') AND u.is_active ORDER BY u.created_at LIMIT 1")
        assert actor
        print(f'{len(sellers)} Kazakh names, {len(stores)} Coffee Shop locations, {len(days)*N_ORDERS*len(sellers)} fixture orders for {days[0]}–{days[-1]}')
        if not args.apply:
            print('Read-only plan. Pass --apply to write.');return
        source_pred="c.organization_id=$1 AND c.llm_model='demo' AND COALESCE(r.call_metadata->>'demo_seed','')<>$2"
        curated=[]
        for category,needle in [('food','круассан'),('size',''),('addon',''),('drink','тыквенный латте')]:
            row=await conn.fetchrow(f'''SELECT c.* FROM analytics.conversations c
                JOIN recorder.recordings r ON r.id=c.recording_id
                WHERE {source_pred} AND EXISTS(SELECT 1 FROM analytics.conversation_offers o
                    WHERE o.conversation_id=c.id AND o.category=$3 AND o.response='accepted'
                      AND o.technique<>'generic' AND o.item ILIKE '%'||$4||'%')
                ORDER BY c.analyzed_at DESC,c.id LIMIT 1''',ORG,SEED,category,needle)
            assert row,f'Missing coherent demo example for {category}'
            curated.append(row)
        cache={}
        async def source(schema,table,key,value):
            k=(schema,table,key,value)
            if k not in cache:
                cache[k]=await conn.fetch(f'SELECT * FROM {schema}.{table} WHERE {key}=$1',value)
            return cache[k]
        batch=defaultdict(list)
        new_ids=[]
        created=0
        tz=ZoneInfo('Europe/Moscow')
        async with conn.transaction(isolation='repeatable_read'):
            other_before=await conn.fetch('''SELECT organization_id,COUNT(*) AS n FROM analytics.conversations
                WHERE organization_id<>$1 GROUP BY organization_id ORDER BY organization_id''',ORG)
            await conn.execute("UPDATE auth.organizations SET name='Coffee Shop (демо)',updated_at=now() WHERE id=$1 AND slug='horeca-demo'",ORG)
            for sid,name in STORES.items():
                await conn.execute('UPDATE admin_schema.stores SET name=$1,address=$2,updated_at=now() WHERE id=$3 AND organization_id=$4',name,'Демонстрационная точка '+name,uuid.UUID(sid),ORG)
            for s in sellers:
                first,last=NAMES[str(s['id'])]
                await conn.execute('UPDATE admin_schema.sellers SET first_name=$1,last_name=$2,updated_at=now() WHERE id=$3 AND organization_id=$4',first,last,s['id'],ORG)
                own=await conn.fetch(f'''SELECT c.* FROM analytics.conversations c
                    JOIN recorder.recordings r ON r.id=c.recording_id
                    WHERE {source_pred} AND c.seller_id=$3 AND c.offer_opportunity IS TRUE
                    ORDER BY c.analyzed_at DESC,c.id LIMIT 40''',ORG,SEED,s['id'])
                assert len(own)>=N_ORDERS
                examples=curated+own[:N_ORDERS-len(curated)]
                for day in days:
                    for i,c in enumerate(examples):
                        key=f'{day}:{s["id"]}:{i}'
                        rec_id,tr_id,conv_id=uid('recording:'+key),uid('transcript:'+key),uid('conversation:'+key)
                        new_ids.append(rec_id)
                        if await conn.fetchval('SELECT id FROM recorder.recordings WHERE id=$1',rec_id):
                            assert await conn.fetchval('SELECT id FROM analytics.conversations WHERE id=$1 AND organization_id=$2',conv_id,ORG)
                            continue
                        rec=rename_strings(dict((await source('recorder','recordings','id',c['recording_id']))[0]))
                        tr=rename_strings(dict((await source('transcription','transcripts','id',c['transcript_id']))[0]))
                        started=datetime.combine(day,time(9,0),tz)+timedelta(minutes=i*10)
                        duration=rec['duration_seconds'] or tr['duration_seconds'] or 60
                        rec.update(id=rec_id,organization_id=ORG,store_id=s['store_id'],seller_id=s['id'],
                            session_date=day,started_at=started,ended_at=started+timedelta(seconds=duration),
                            status='analyzed',source='transcript',audio_path=f'transcript-only/{rec_id}',
                            call_metadata=json.dumps({'demo':True,'demo_seed':SEED,'source_fixture':str(c['recording_id'])}),
                            created_at=started,updated_at=datetime.now(timezone.utc))
                        tr.update(id=tr_id,recording_id=rec_id,organization_id=ORG,store_id=s['store_id'],seller_id=s['id'])
                        cv=rename_strings(dict(c))
                        cv.update(id=conv_id,recording_id=rec_id,transcript_id=tr_id,organization_id=ORG,
                            store_id=s['store_id'],seller_id=s['id'],session_date=day,
                            analyzed_at=started+timedelta(seconds=duration+150),llm_model='demo',summary=None,summary_generated_at=None)
                        batch[('recorder','recordings')].append(rec)
                        batch[('transcription','transcripts')].append(tr)
                        batch[('analytics','conversations')].append(cv)
                        for schema,table,fk in TABLES:
                            old_id=c['transcript_id'] if fk=='transcript_id' else c['id']
                            for child in await source(schema,table,fk,old_id):
                                row=rename_strings(dict(child));row.update(id=uid(f'{table}:{key}:{child["id"]}'))
                                row[fk]=tr_id if fk=='transcript_id' else conv_id
                                batch[(schema,table)].append(row)
                        created+=1
            # Parent tables precede their FK children. Existing IDs are skipped above.
            for (schema,table),rows in batch.items():
                columns=list(rows[0])
                await conn.copy_records_to_table(table,schema_name=schema,columns=columns,
                    records=[tuple(r[col] for col in columns) for r in rows])
            for store in [None,uuid.UUID('5a7b802b-e1ca-5637-b8a8-1900dafbf451')]:
                rules=[dict(r) for r in RULES]
                if store:
                    for r in rules:
                        if r['category']=='food':r['coins']=12
                        if r['category']=='drink':r['coins']=20
                for version,at in [('history',datetime.combine(days[0],time.min,tz)),('current',datetime.now(timezone.utc))]:
                    await conn.execute('''INSERT INTO analytics.coin_rules(id,organization_id,store_id,rules,effective_at,created_by)
                        VALUES($1,$2,$3,$4::jsonb,$5,$6) ON CONFLICT(id) DO NOTHING''',
                        uid(f'rules:{store}:{version}'),ORG,store,json.dumps(rules,ensure_ascii=False),at,actor)
            # Legacy synthetic orders predate loading this programme: preserve their zero-award
            # snapshot, so backdated demo rule history never creates unexpected retroactive awards.
            await conn.execute('''INSERT INTO analytics.coin_sources(recording_id,organization_id)
                SELECT c.recording_id,c.organization_id FROM analytics.conversations c
                JOIN recorder.recordings r ON r.id=c.recording_id
                WHERE c.organization_id=$1 AND c.llm_model='demo'
                  AND COALESCE(r.call_metadata->>'demo_seed','')<>$2
                  AND c.session_date>=$3 ON CONFLICT DO NOTHING''',ORG,SEED,days[0])
            fixtures=await conn.fetch('''SELECT c.*,r.started_at FROM analytics.conversations c
                JOIN recorder.recordings r ON r.id=c.recording_id
                WHERE c.organization_id=$1 AND r.id=ANY($2::uuid[]) ORDER BY c.session_date,c.seller_id,r.started_at''',ORG,new_ids)
            event_index=defaultdict(int)
            for c in fixtures:
                claimed=await conn.fetchval('''INSERT INTO analytics.coin_sources(recording_id,organization_id)
                    VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING recording_id''',c['recording_id'],ORG)
                if not claimed:continue
                version=await conn.fetchrow('''SELECT * FROM analytics.coin_rules
                    WHERE organization_id=$1 AND (store_id IS NULL OR store_id=$2) AND effective_at<=$3
                    ORDER BY (store_id IS NOT NULL) DESC,effective_at DESC LIMIT 1''',ORG,c['store_id'],c['started_at'])
                assert version
                rules=json_value(version['rules'])
                offers=await conn.fetch("SELECT * FROM analytics.conversation_offers WHERE conversation_id=$1 AND response='accepted' AND technique<>'generic' ORDER BY sort_order,id",c['id'])
                for order,o in enumerate(offers):
                    rule=match(rules,o)
                    if not rule:continue
                    k=(c['session_date'],c['seller_id']);j=event_index[k];event_index[k]+=1
                    state='confirmed'
                    if c['session_date']==args.day:
                        if j in (2,3) or j%7==4:state='pending'
                        elif j%11==6:state='rejected'
                        elif j%11==7:state='voided'
                    elif j%13==9:state='rejected'
                    elif j%13==10:state='voided'
                    reason={'confirmed':'Демо-пример: продажа условно подтверждена по чеку.',
                        'pending':None,'rejected':'Демо-пример: гость отказался от позиции при оплате.',
                        'voided':'Демо-пример: первоначальная продажа была подтверждена.'}[state]
                    decided=c['analyzed_at']+timedelta(minutes=5) if state!='pending' else None
                    await conn.execute('''INSERT INTO analytics.coin_events
                        (id,organization_id,store_id,seller_id,recording_id,source_order,session_date,
                         item,category,quote,customer_quote,rule_id,rule_label,coins,status,decided_by,
                         decided_at,reason,voided_by,voided_at,void_reason,created_at)
                        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
                        ON CONFLICT DO NOTHING''',uid(f'event:{c["recording_id"]}:{order}'),ORG,c['store_id'],c['seller_id'],
                        c['recording_id'],order,c['session_date'],o['item'],o['category'],o['quote'],o['customer_quote'],
                        version['id'],rule['label'],rule['coins'],state,actor if decided else None,decided,reason,
                        actor if state=='voided' else None,decided+timedelta(minutes=15) if state=='voided' else None,
                        'Демо-пример: возврат позиции в кассе, монеты отменены.' if state=='voided' else None,c['analyzed_at'])
            # Prepared demo feedback is grounded in these counters and remains audience-specific.
            for s in sellers:
                for day in days:
                    stats=await conn.fetchrow('''SELECT COUNT(*) AS n,
                        COUNT(*) FILTER(WHERE COALESCE(offers_count,0)>0) AS offered,
                        COALESCE(SUM(offers_accepted),0) AS accepted,BOOL_AND(llm_model='demo') AS synthetic
                        FROM analytics.conversations WHERE organization_id=$1 AND seller_id=$2
                          AND session_date=$3 AND offer_opportunity IS TRUE''',ORG,s['id'],day)
                    if not stats['synthetic']:continue
                    for audience in ['employee','manager']:
                        if audience=='employee':
                            tips={'praise':f'В этой демо-смене вы сделали предложение в {stats["offered"]} из {stats["n"]} заказов. Гости согласились на {stats["accepted"]} предложений.',
                                'focus':'Предлагайте конкретную позицию к напитку',
                                'tips':[{'title':'Предложите выпечку','text':'В примерах смены гостям предлагали круассан к кофе. Начните с одной подходящей позиции, а не общего вопроса «что-нибудь ещё?».','phrase':'К вашему кофе возьмёте круассан?'},
                                    {'title':'Дайте выбор объёма','text':'В демо-заказах есть согласия на больший объём. Сначала предложите выбор и спокойно примите отказ.','phrase':'Сделать напиток стандартным или большим?'}]}
                        else:
                            tips={'praise':f'Похвалите сотрудника за конкретные предложения: в демо-смене они прозвучали в {stats["offered"]} из {stats["n"]} заказов.',
                                'focus':'Разберите с сотрудником удачное предложение',
                                'tips':[{'title':'Отметьте удачный приём','text':f'В демо-смене гости согласились на {stats["accepted"]} предложений. Выберите успешный пример с выпечкой и похвалите сотрудника за конкретику.','phrase':'Давайте разберём, что помогло гостю согласиться на вашу допродажу.'},
                                    {'title':'Потренируйте выбор объёма','text':'В примерах есть предложения большего объёма. Потренируйте с сотрудником нейтральный выбор, затем проверьте несколько следующих заказов.','phrase':'Потренируем выбор между двумя объёмами без давления на гостя.'}]}
                        tips.update(_period='day',_demo_seed=SEED)
                        await conn.execute('''INSERT INTO analytics.seller_tips(organization_id,seller_id,tip_date,conversations_count,tips,audience,generated_at)
                            VALUES($1,$2,$3,$4,$5::jsonb,$6,now()) ON CONFLICT(seller_id,tip_date,audience)
                            DO UPDATE SET conversations_count=EXCLUDED.conversations_count,tips=EXCLUDED.tips,generated_at=EXCLUDED.generated_at''',
                            ORG,s['id'],day,stats['n'],json.dumps(tips,ensure_ascii=False),audience)
            assert other_before==await conn.fetch('''SELECT organization_id,COUNT(*) AS n FROM analytics.conversations
                WHERE organization_id<>$1 GROUP BY organization_id ORDER BY organization_id''',ORG),'Other org changed'
        print(f'Added {created} orders; re-running preserves IDs and manager decisions.')
        rows=await conn.fetch('''SELECT s.first_name,s.last_name,
            COALESCE(SUM(e.coins) FILTER(WHERE e.status='confirmed'),0) AS balance,
            COALESCE(SUM(e.coins) FILTER(WHERE e.status='pending'),0) AS pending
            FROM admin_schema.sellers s LEFT JOIN analytics.coin_events e ON e.seller_id=s.id AND e.organization_id=s.organization_id
            WHERE s.organization_id=$1 GROUP BY s.id ORDER BY s.store_id,s.first_name''',ORG)
        for r in rows:
            assert r['balance']>0 and r['pending']>0
            print(f'{r["first_name"]} {r["last_name"]}: {r["balance"]} coins, {r["pending"]} pending')
    finally:
        await conn.close()

if __name__=='__main__':
    asyncio.run(main())
