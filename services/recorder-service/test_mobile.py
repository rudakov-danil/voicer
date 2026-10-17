"""Isolated API tests; no network, production data or transcription calls."""
import hashlib
import io
import unittest
from datetime import date, datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID
from fastapi import HTTPException, UploadFile
from app.routers import mobile

ORG=UUID('22222222-2222-4222-8222-222222222222')
STORE=UUID('44444444-4444-4444-8444-444444444444')
SELLER=UUID('33333333-3333-4333-8333-333333333333')
USER={'sub':'11111111-1111-4111-8111-111111111111','organization_id':str(ORG),'role':'director'}
class MobileTests(unittest.IsolatedAsyncioTestCase):
    def args(self, name='test.webm', data=b'example-audio'):
        db=AsyncMock()
        seller=MagicMock();seller.first.return_value=(SELLER,)
        existing=MagicMock();existing.mappings.return_value.first.return_value=None
        db.execute.side_effect=[seller,MagicMock(),existing,MagicMock()]
        return dict(file=UploadFile(filename=name,file=io.BytesIO(data)),seller_id=SELLER,store_id=STORE,
                    session_date=date(2026,10,8),client_upload_id=UUID('55555555-5555-4555-8555-555555555555'),
                    started_at=datetime(2026,10,8,tzinfo=timezone.utc),current_user=USER,db=db)
    async def test_accepts_both_browser_formats(self):
        for name in ('test.webm','test.m4a'):
            args=self.args(name)
            with patch.object(mobile,'_ensure_bucket'),patch.object(mobile,'upload_bytes') as upload:
                result=await mobile.upload_mobile(**args)
                self.assertEqual(result['status'],'mobile_queued')
                self.assertEqual(upload.call_args.args[-1], 'audio/webm' if name.endswith('webm') else 'audio/mp4')
                args['db'].commit.assert_awaited_once()
    async def test_duplicate_never_enqueues_twice(self):
        args=self.args();existing=MagicMock()
        existing.mappings.return_value.first.return_value={'status':'mobile_queued','seller_id':SELLER,'store_id':STORE,'call_metadata':{'sha256':hashlib.sha256(b'example-audio').hexdigest()}}
        seller=MagicMock();seller.first.return_value=(SELLER,)
        args['db'].execute.side_effect=[seller,MagicMock(),existing]
        with patch.object(mobile,'upload_bytes') as upload:
            result=await mobile.upload_mobile(**args)
            self.assertTrue(result['duplicate']);upload.assert_not_called()
    async def test_changed_audio_same_id_rejected(self):
        args=self.args();seller=MagicMock();seller.first.return_value=(SELLER,)
        existing=MagicMock();existing.mappings.return_value.first.return_value={'status':'mobile_queued','seller_id':SELLER,'store_id':STORE,'call_metadata':{'sha256':'different'}}
        args['db'].execute.side_effect=[seller,MagicMock(),existing]
        with self.assertRaises(HTTPException) as caught: await mobile.upload_mobile(**args)
        self.assertEqual(caught.exception.status_code,409)
    async def test_cross_org_or_inactive_seller_rejected(self):
        args=self.args();result=MagicMock();result.first.return_value=None;args['db'].execute.side_effect=[result]
        with self.assertRaises(HTTPException) as caught:await mobile.upload_mobile(**args)
        self.assertEqual(caught.exception.status_code,403)
    async def test_size_limit_and_empty_audio(self):
        for data,code in ((b'',400),(b'12345',413)):
            with patch.object(mobile,'MAX_BYTES',4):
                with self.assertRaises(HTTPException) as caught:await mobile.upload_mobile(**self.args(data=data))
                self.assertEqual(caught.exception.status_code,code)
    async def test_bad_format(self):
        with self.assertRaises(HTTPException) as caught:await mobile.upload_mobile(**self.args('test.exe'))
        self.assertEqual(caught.exception.status_code,415)
    def test_role_scope(self):
        for user in ({'role':'manager','store_id':'other'}, {'role':'rop','rop_stores':[]},{'role':'unknown'}):
            with self.assertRaises(HTTPException):mobile.check_store_access(user,STORE)
        mobile.check_store_access({'role':'manager','store_id':str(STORE)},STORE)
        mobile.check_store_access({'role':'rop','rop_stores':[str(STORE)]},STORE)
if __name__=='__main__': unittest.main()
