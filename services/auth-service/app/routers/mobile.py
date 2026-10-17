"""Employee access is a separate token type; cabinet /verify never accepts it."""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from jose import JWTError, jwt
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import bearer_scheme, get_current_user
from app.security import decode_token

router = APIRouter(prefix='/api/v1/auth/mobile', tags=['mobile access'])

def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()

def check_scope(user, store_id):
    role = user.get('role')
    allowed = role in ('director', 'admin')
    if role == 'manager':
        allowed = str(store_id) == str(user.get('store_id'))
    if role == 'rop':
        allowed = str(store_id) in user.get('rop_stores', [])
    if not allowed:
        raise HTTPException(404, 'Сотрудник недоступен')

async def seller(db, org, seller_id):
    row = (await db.execute(text('''
        SELECT s.id, s.store_id, s.first_name, s.last_name, st.name AS store_name
        FROM admin_schema.sellers s JOIN admin_schema.stores st ON st.id=s.store_id
        WHERE s.id=:seller AND s.organization_id=:org AND st.organization_id=:org
          AND s.is_active AND st.is_active
    '''), {'seller': seller_id, 'org': org})).mappings().first()
    if not row:
        raise HTTPException(404, 'Сотрудник недоступен')
    return row

class Invitation(BaseModel):
    seller_id: UUID

class Claim(BaseModel):
    key: str = Field(min_length=32, max_length=128)

class Refresh(BaseModel):
    refresh_token: str = Field(min_length=32, max_length=128)

@router.post('/invitations')
async def invite(body: Invitation, user=Depends(get_current_user), db=Depends(get_db)):
    org = UUID(user['organization_id'])
    s = await seller(db, org, body.seller_id)
    check_scope(user, s['store_id'])
    key = secrets.token_urlsafe(32)
    expiry = datetime.now(timezone.utc) + timedelta(hours=24)
    await db.execute(text('''
        INSERT INTO auth.mobile_accounts(organization_id,seller_id,store_id,invitation_hash,
            invitation_expires_at,created_by)
        VALUES (:org,:seller,:store,:hash,:expiry,:by)
        ON CONFLICT (organization_id,seller_id) DO UPDATE SET
            store_id=EXCLUDED.store_id, invitation_hash=EXCLUDED.invitation_hash,
            invitation_expires_at=EXCLUDED.invitation_expires_at, is_active=true,
            refresh_hash=NULL, refresh_expires_at=NULL,
            session_version=mobile_accounts.session_version+1, updated_at=now()
    '''), {'org':org,'seller':body.seller_id,'store':s['store_id'],'hash':digest(key),
           'expiry':expiry,'by':UUID(user['sub'])})
    await db.commit()
    # Врачу клиники приложение сразу показывает свой экран подключения («Запись» и «Протокол»)
    industry = (await db.execute(text('SELECT industry FROM auth.organizations WHERE id=:org'), {'org': org})).scalar()
    suffix = '&app=clinic' if industry == 'clinic' else ''
    return {'url':f'https://mobile.voicer-ai.pro/app.html#connect={key}{suffix}', 'expires_at':expiry,
            'seller_name':f"{s['first_name']} {s['last_name']}".strip()}

@router.delete('/accounts/{seller_id}', status_code=204)
async def revoke(seller_id: UUID, user=Depends(get_current_user), db=Depends(get_db)):
    org = UUID(user['organization_id'])
    s = await seller(db, org, seller_id)
    check_scope(user, s['store_id'])
    await db.execute(text('''UPDATE auth.mobile_accounts SET is_active=false,
        invitation_hash=NULL,refresh_hash=NULL,session_version=session_version+1,updated_at=now()
        WHERE organization_id=:org AND seller_id=:seller'''), {'org':org,'seller':seller_id})
    await db.commit()

async def token_response(db, account):
    s = await seller(db, account['organization_id'], account['seller_id'])
    if s['store_id'] != account['store_id']:
        raise HTTPException(401, 'Точка сотрудника изменилась. Нужна новая ссылка подключения.')
    now = datetime.now(timezone.utc)
    payload = {'sub':str(account['id']), 'organization_id':str(account['organization_id']),
               'seller_id':str(account['seller_id']), 'store_id':str(account['store_id']),
               'role':'employee','type':'mobile_access','version':account['session_version'],
               'iat':now,'exp':now+timedelta(minutes=15)}
    refresh = secrets.token_urlsafe(48)
    await db.execute(text('''UPDATE auth.mobile_accounts SET refresh_hash=:hash,
        refresh_expires_at=:expiry,invitation_hash=NULL,invitation_expires_at=NULL,updated_at=now()
        WHERE id=:id'''), {'hash':digest(refresh),'expiry':now+timedelta(days=30),'id':account['id']})
    await db.commit()
    return {'access_token':jwt.encode(payload,settings.JWT_SECRET,algorithm=settings.JWT_ALGORITHM),
            'refresh_token':refresh,'expires_in':900,'token_type':'bearer',
            'user':{'id':str(account['id']),'organization_id':str(account['organization_id']),
                    'seller_id':str(account['seller_id']),'store_id':str(account['store_id']),
                    'role':'employee','email':'','first_name':s['first_name'],'last_name':s['last_name']}}

@router.post('/claim')
async def claim(body: Claim, db=Depends(get_db)):
    row = (await db.execute(text('''SELECT * FROM auth.mobile_accounts
        WHERE invitation_hash=:hash AND invitation_expires_at>now() AND is_active FOR UPDATE'''),
        {'hash':digest(body.key)})).mappings().first()
    if not row:
        raise HTTPException(401, 'Ссылка уже использована или истекла. Запросите новую у руководителя.')
    return await token_response(db, row)

@router.post('/refresh')
async def refresh(body: Refresh, db=Depends(get_db)):
    row = (await db.execute(text('''SELECT * FROM auth.mobile_accounts
        WHERE refresh_hash=:hash AND refresh_expires_at>now() AND is_active FOR UPDATE'''),
        {'hash':digest(body.refresh_token)})).mappings().first()
    if not row:
        raise HTTPException(401, 'Подключение истекло или отозвано. Нужна новая ссылка руководителя.')
    return await token_response(db, row)

async def get_mobile_user(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
                          db: AsyncSession = Depends(get_db)):
    try:
        payload = decode_token(credentials.credentials)
    except JWTError:
        raise HTTPException(401, 'Подключение истекло')
    if payload.get('type') == 'access':
        return await get_current_user(credentials, db)
    if payload.get('type') != 'mobile_access':
        raise HTTPException(401, 'Требуется подключение к приложению')
    account = (await db.execute(text('''SELECT * FROM auth.mobile_accounts
        WHERE id=:id AND is_active AND refresh_expires_at>now()'''),
        {'id':UUID(payload['sub'])})).mappings().first()
    if not account or account['session_version'] != payload.get('version'):
        raise HTTPException(401, 'Подключение отозвано')
    s = await seller(db, account['organization_id'], account['seller_id'])
    if s['store_id'] != account['store_id']:
        raise HTTPException(401, 'Точка изменилась. Подключитесь по новой ссылке.')
    return payload

@router.get('/verify')
async def verify(user=Depends(get_mobile_user)):
    return {'valid':True,'payload':user}

@router.get('/profile')
async def profile(user=Depends(get_mobile_user), db=Depends(get_db)):
    """Сотрудник и отрасль организации: по отрасли приложение выбирает разделы (у врачей клиники —
    «Запись» и «Протокол»). Руководителю, который смотрит приложение, — только организация."""
    org_id = UUID(user['organization_id'])
    org = (await db.execute(text('SELECT name, industry FROM auth.organizations WHERE id=:id'),
                            {'id': org_id})).mappings().first()
    organization = {'name': org['name'], 'industry': org['industry']} if org else None
    if user.get('role') != 'employee':
        return {'seller': None, 'organization': organization}
    s = await seller(db, org_id, UUID(user['seller_id']))
    return {'seller':dict(s), 'organization': organization}
