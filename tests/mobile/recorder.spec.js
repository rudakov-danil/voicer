import {test,expect} from '@playwright/test';
const user={id:'11111111-1111-4111-8111-111111111111',organization_id:'22222222-2222-4222-8222-222222222222',email:'test@example.com'};
const seller={id:'33333333-3333-4333-8333-333333333333',store_id:'44444444-4444-4444-8444-444444444444',first_name:'Анна',last_name:'Иванова',store_name:'Тестовый магазин'};
async function setup(page){
 await page.route('**/api/v1/auth/login',route=>route.fulfill({json:{access_token:'test-token',refresh_token:'refresh',user}}));
 await page.route('**/api/v1/admin/sellers?*',route=>route.fulfill({json:{items:[seller],total:1}}));
 await page.goto('/'); await page.locator('#email').fill(user.email);await page.locator('#password').fill('test-password');await page.locator('#login-button').click(); await expect(page.locator('#record')).toBeEnabled();
}
async function record(page){await page.locator('#record').click();await expect(page.locator('#record-state')).toHaveText('Идёт запись');await page.waitForTimeout(700);await page.locator('#record').click();}
test('records audio and uploads only after stop',async({page})=>{
 let uploads=0,body;
 await page.route('**/api/v1/recorder/mobile/upload',route=>{uploads++;body=route.request().postDataBuffer();return route.fulfill({status:202,json:{recording_id:'recorded',status:'mobile_queued'}});});
 await setup(page);await page.locator('#record').click();await expect(page.locator('#record-state')).toHaveText('Идёт запись');await page.waitForTimeout(800);expect(uploads).toBe(0);await page.locator('#record').click();
 await expect(page.getByText('Передано на анализ',{exact:true})).toBeVisible();expect(uploads).toBe(1);expect(body.toString()).toContain('audio/webm');expect(body.toString()).toContain('client_upload_id');expect(body.length).toBeGreaterThan(1000);
 await page.screenshot({path:'../../../../outputs/mobile-preview.png',fullPage:true});
});
test('offline recording survives reload and retries with stable upload id',async({page})=>{
 let ids=[];let fail=true;
 await page.route('**/api/v1/recorder/mobile/upload',route=>{const b=route.request().postData();ids.push(b.match(/name="client_upload_id"\r\n\r\n([^\r]+)/)[1]);return fail ? route.abort() : route.fulfill({status:202,json:{recording_id:'recorded',status:'mobile_queued'}});});
 await setup(page);await record(page);await expect(page.getByText('Ожидает отправки',{exact:true})).toBeVisible();await page.reload();await expect(page.locator('#record')).toBeEnabled();
 fail=false;await page.locator('#retry-all').click();await expect(page.getByText('Передано на анализ',{exact:true})).toBeVisible();expect(new Set(ids).size).toBe(1);
});
test('recovers interrupted audio without silently uploading partial recording',async({page})=>{
 let uploads=0;await page.route('**/api/v1/recorder/mobile/upload',route=>{uploads++;return route.fulfill({status:202,json:{recording_id:'r'}});});
 await setup(page);await page.locator('#record').click();await expect(page.locator('#record-state')).toHaveText('Идёт запись');await page.waitForTimeout(3400);page.on('dialog',d=>d.accept());await page.reload();
 await expect(page.getByText('Запись могла прерваться — проверьте звук',{exact:true})).toBeVisible();expect(uploads).toBe(0);await expect(page.getByRole('button',{name:'Скачать',exact:true})).toBeEnabled();
});
test('refreshes expired credentials before retrying upload',async({page})=>{
 let calls=0;
 await page.route('**/api/v1/auth/refresh',r=>r.fulfill({json:{access_token:'new-token',refresh_token:'new-refresh',user}}));
 await page.route('**/api/v1/recorder/mobile/upload',r=>{calls++;return r.request().headers().authorization==='Bearer new-token' ? r.fulfill({status:202,json:{recording_id:'r'}}) : r.fulfill({status:401,json:{detail:'expired'}});});
 await setup(page);await record(page);await expect(page.getByText('Передано на анализ',{exact:true})).toBeVisible();expect(calls).toBe(2);
});
test('second tab cannot record concurrently',async({page,context})=>{
 await setup(page);const second=await context.newPage();await second.goto('/');await expect(second.locator('#record')).toBeDisabled();await expect(second.locator('#message')).toContainText('одной вкладке');
});
