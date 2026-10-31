import { test, expect } from '@playwright/test';
import fs from 'node:fs';
fs.mkdirSync('qa-artifacts/screens', { recursive: true });

const ERA = {
  13: { app: '#app', node: '.node.available', reader: '#nodeReader', scroll: '.reader-body', cta: '#readerBuy' },
  14: { app: '#era14App', node: '.e14-node.available', reader: '#e14Reader', scroll: '.e14-reader-body', cta: '#e14Buy' },
  15: { app: '#era15App', node: '.e15-node.available', reader: '#e15Reader', scroll: '.e15-reader-body', cta: '#e15Buy' },
  16: { app: '#era16App', node: '.e16-tech.available', reader: '#e16Reader', scroll: '.e16-reader-body', cta: '#e16Buy' },
  17: { app: '#era17App', node: '.e17-tech.available', reader: '#e17Reader', scroll: '.e17-reader-body', cta: '#e17Buy' },
  18: { app: '#era18App', node: '.e18-tech.available', reader: '#e18Reader', scroll: '.e18-reader-body', cta: '#e18Buy' },
  19: { app: '#era19App', node: '.e19-tech.available', reader: '#e19Reader', scroll: '.e19-reader-body', cta: '#e19Buy' }
};

async function boot(page, era = 13) {
  await page.addInitScript(() => {
    localStorage.clear();
    window.__BTS_TEST_MODE = true;
  });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/app/src/main/assets/index.html?test=1', { waitUntil: 'load' });
  await page.evaluate(() => {
    window.__BTS_TEST_MODE = true;
    document.querySelector('#btsBoot')?.remove();
    document.querySelector('#btsEraReel')?.remove();
  });
  if (era >= 14) {
    await page.evaluate(e => {
      const fn = window['enterEra' + e];
      if (typeof fn !== 'function') throw new Error('Missing enterEra' + e);
      fn();
    }, era);
  }
  await page.waitForTimeout(220);
  await expect(page.locator(ERA[era].app)).toBeVisible();
  expect(errors, 'uncaught page errors').toEqual([]);
}

async function assertNoGlobalOverflow(page) {
  const m = await page.evaluate(() => ({
    iw: innerWidth, ih: innerHeight,
    deW: document.documentElement.scrollWidth,
    bodyW: document.body.scrollWidth,
    bodyH: document.body.scrollHeight
  }));
  expect(m.deW).toBeLessThanOrEqual(m.iw + 2);
  expect(m.bodyW).toBeLessThanOrEqual(m.iw + 2);
  expect(m.bodyH).toBeLessThanOrEqual(m.ih + 3);
}

async function touchTap(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const r = await locator.boundingBox();
  expect(r, 'touch target has a bounding box').not.toBeNull();
  await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2);
}

function representative(testInfo) {
  return /android-galaxy-s24|ios-iphone-15-landscape/.test(testInfo.project.name);
}

async function reachable(page, selector) {
  return page.locator(selector).evaluate(el => {
    const r = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(innerWidth - 1, r.left + r.width / 2));
    const y = Math.max(0, Math.min(innerHeight - 1, r.top + Math.min(r.height / 2, 20)));
    const top = document.elementFromPoint(x, y);
    return {
      rect: { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right },
      visible: r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth,
      hit: !!top && (top === el || el.contains(top) || top.contains(el))
    };
  });
}

test.describe('Beyond the Singularity mobile quality gate', () => {
  test('all eras preserve a world-first layout with no page overflow', async ({ page }, testInfo) => {
    for (let era = 13; era <= 19; era++) {
      await test.step('Era ' + era, async () => {
        await boot(page, era);
        await assertNoGlobalOverflow(page);
        const metrics = await page.locator(ERA[era].app).evaluate((app, era) => {
          const header = app.querySelector('header');
          const world = app.querySelector('main');
          const hr = header?.getBoundingClientRect();
          const wr = world?.getBoundingClientRect();
          return {
            era,
            headerH: hr?.height || 0,
            worldW: wr?.width || 0,
            worldH: wr?.height || 0,
            viewportW: innerWidth,
            viewportH: innerHeight
          };
        }, era);
        expect(metrics.headerH, 'header should stay compact').toBeLessThanOrEqual(62);
        expect(metrics.worldW, 'world should own nearly all width').toBeGreaterThanOrEqual(metrics.viewportW * .97);
        expect(metrics.worldH, 'world should own most height').toBeGreaterThanOrEqual(metrics.viewportH - 72);
        if (era >= 14) {
          const systems = page.locator('#btsV13Systems');
          await expect(systems).toBeVisible();
          const sysHit = await reachable(page, '#btsV13Systems');
          expect(sysHit.rect.width).toBeGreaterThanOrEqual(44);
          expect(sysHit.rect.height).toBeGreaterThanOrEqual(44);
          expect(sysHit.hit).toBeTruthy();
        }
        if (representative(testInfo) && (era === 14 || era === 18)) {
          await page.screenshot({ path: `qa-artifacts/screens/${testInfo.project.name}-era${era}-world.png`, timeout: 5000 });
        }
        await page.goto('about:blank');
      });
    }
  });

  test('systems menus scroll, expose their last action, and dismiss from backdrop', async ({ page }, testInfo) => {
    const panelByEra = {
      14: '.allocation-panel', 15: '.e15-side', 16: '.e16-panel',
      17: '.e17-panel', 18: '.e18-side', 19: '.e19-side'
    };
    for (let era = 14; era <= 19; era++) {
      await test.step('Era ' + era + ' systems', async () => {
        await boot(page, era);
        await touchTap(page, page.locator('#btsV13Systems'));
        const panel = page.locator(panelByEra[era]);
        await expect(panel).toHaveClass(/bts-v13-open/);
        await expect(panel).toBeVisible();
        const p = await panel.evaluate(el => {
          const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
          return {
            width: r.width, height: r.height,
            viewportW: innerWidth, viewportH: innerHeight,
            overflowY: cs.overflowY, touchAction: cs.touchAction,
            scrollHeight: el.scrollHeight, clientHeight: el.clientHeight
          };
        });
        expect(p.width).toBeLessThanOrEqual(p.viewportW - 48);
        expect(['auto','scroll']).toContain(p.overflowY);
        expect(p.touchAction).toContain('pan-y');

        const lastInteractive = panel.locator('button:not([disabled]),select:not([disabled]),input:not([disabled])').last();
        if (await lastInteractive.count()) {
          await lastInteractive.evaluate(el => el.scrollIntoView({ block: 'center' }));
          await page.waitForTimeout(50);
          const r = await lastInteractive.boundingBox();
          expect(r).not.toBeNull();
          expect(r.y).toBeGreaterThanOrEqual(0);
          expect(r.y + r.height).toBeLessThanOrEqual(p.viewportH + 1);
        }
        if (representative(testInfo) && era === 14) {
          await page.screenshot({ path: `qa-artifacts/screens/${testInfo.project.name}-era14-systems.png`, timeout: 5000 });
        }
        await page.touchscreen.tap(6, 6);
        await expect(panel).not.toHaveClass(/bts-v13-open/);
        await expect(page.locator('#btsV13Backdrop')).not.toHaveClass(/show/);
        await page.goto('about:blank');
      });
    }
  });

  test('every technology reader is vertically scrollable and CTA remains reachable', async ({ page }, testInfo) => {
    for (let era = 13; era <= 19; era++) {
      await test.step('Era ' + era + ' reader', async () => {
        await boot(page, era);
        const node = page.locator(ERA[era].node).first();
        await expect(node, 'available technology node').toBeVisible();
        await touchTap(page, node);
        const reader = page.locator(ERA[era].reader);
        await expect(reader).toBeVisible();

        const scroll = page.locator(ERA[era].scroll);
        const m = await scroll.evaluate(el => {
          const cs = getComputedStyle(el);
          return {
            overflowY: cs.overflowY,
            touchAction: cs.touchAction,
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
            width: el.getBoundingClientRect().width
          };
        });
        expect(['auto','scroll']).toContain(m.overflowY);
        expect(m.touchAction).toContain('pan-y');
        expect(m.width).toBeGreaterThan(300);

        await scroll.evaluate(el => { el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight); });
        await page.waitForTimeout(80);
        const cta = await reachable(page, ERA[era].cta);
        expect(cta.visible, 'CTA visible after scroll').toBeTruthy();
        expect(cta.hit, 'CTA not covered by another layer').toBeTruthy();
        expect(cta.rect.height, 'CTA touch target').toBeGreaterThanOrEqual(44);

        const hiddenSystems = await page.locator('#btsV13Systems').evaluate(el => {
          const cs = getComputedStyle(el); return cs.pointerEvents === 'none' || +cs.opacity < .1;
        });
        expect(hiddenSystems, 'world chrome hidden while reading').toBeTruthy();

        if (representative(testInfo) && (era === 13 || era === 14 || era === 19)) {
          await page.screenshot({ path: `qa-artifacts/screens/${testInfo.project.name}-era${era}-reader-bottom.png`, timeout: 5000 });
        }
        await page.goto('about:blank');
      });
    }
  });

  test('active play stays hidden until an upward gesture, then backdrop dismisses it', async ({ page }) => {
    await boot(page, 15);
    const dock = page.locator('#v10Dock');
    const closed = await dock.evaluate(el => {
      const cs = getComputedStyle(el); return { visibility: cs.visibility, pointerEvents: cs.pointerEvents };
    });
    expect(closed.visibility).toBe('hidden');
    expect(closed.pointerEvents).toBe('none');

    await page.evaluate(() => {
      const g = document.querySelector('#btsV13BottomGesture');
      const r = g.getBoundingClientRect(), x = r.left + r.width / 2, y = r.bottom - 2;
      const fire = (type, yy) => g.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerId: 77, pointerType: 'touch',
        isPrimary: true, clientX: x, clientY: yy, buttons: type === 'pointerup' ? 0 : 1
      }));
      fire('pointerdown', y);
      fire('pointermove', y - 58);
      fire('pointerup', y - 58);
    });
    await expect(dock).toHaveClass(/bts-v13-active/);
    await expect(dock).toBeVisible();
    await page.touchscreen.tap(6, 6);
    await expect(dock).not.toHaveClass(/bts-v13-active/);
  });

  test('Era 13 camera zooms first, then pans without losing touch control', async ({ page }) => {
    await boot(page, 13);
    const before = await page.locator('#camera').evaluate(el => getComputedStyle(el).transform);

    // First zoom in so panning has meaningful room even on tablets/foldables.
    await page.evaluate(() => {
      const v = document.querySelector('#viewport'), r = v.getBoundingClientRect();
      const fire = (type,id,x,y,primary=false) => v.dispatchEvent(new PointerEvent(type,{
        bubbles:true,cancelable:true,pointerId:id,pointerType:'touch',isPrimary:primary,
        clientX:x,clientY:y,buttons:type==='pointerup'?0:1
      }));
      const cy=r.top+r.height*.52, cx=r.left+r.width*.52;
      fire('pointerdown',101,cx-42,cy,true);
      fire('pointerdown',102,cx+42,cy,false);
      fire('pointermove',101,cx-130,cy,true);
      fire('pointermove',102,cx+130,cy,false);
      fire('pointerup',101,cx-130,cy,true);
      fire('pointerup',102,cx+130,cy,false);
    });
    await page.waitForTimeout(100);
    const afterPinch = await page.locator('#camera').evaluate(el => getComputedStyle(el).transform);
    expect(afterPinch, 'pinch changes camera transform').not.toBe(before);

    await page.evaluate(() => {
      const v = document.querySelector('#viewport'), r = v.getBoundingClientRect();
      const fire = (type,x,y) => v.dispatchEvent(new PointerEvent(type,{
        bubbles:true,cancelable:true,pointerId:201,pointerType:'touch',isPrimary:true,
        clientX:x,clientY:y,buttons:type==='pointerup'?0:1
      }));
      const x=r.left+r.width*.62, y=r.top+r.height*.52;
      fire('pointerdown',x,y);
      fire('pointermove',x-25,y+10); // cross drag threshold; capture starts here
      fire('pointermove',x-145,y+55);
      fire('pointerup',x-145,y+55);
    });
    await page.waitForTimeout(100);
    const afterPan = await page.locator('#camera').evaluate(el => getComputedStyle(el).transform);
    expect(afterPan, 'one-finger pan changes camera after zoom').not.toBe(afterPinch);
  });

  test('reader scroll animation stays responsive in the S24/iPhone class proxy', async ({ page }, testInfo) => {
    test.skip(!/galaxy-s24|iphone-15-landscape/.test(testInfo.project.name), 'performance proxy only on representative Android + iOS');
    await boot(page, 14);
    await touchTap(page, page.locator('.e14-node.available').first());
    const result = await page.locator('.e14-reader-body').evaluate(async el => {
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      const frames = [];
      let last = performance.now(), i = 0;
      await new Promise(resolve => {
        const step = t => {
          frames.push(t-last); last=t; i++;
          el.scrollTop = max * Math.min(1, i/36);
          if(i<36)requestAnimationFrame(step); else resolve();
        };
        requestAnimationFrame(step);
      });
      const sorted=[...frames].sort((a,b)=>a-b);
      return {
        p95: sorted[Math.floor(sorted.length*.95)] || 0,
        worst: Math.max(...frames),
        frames: frames.length,
        finalScroll: el.scrollTop,
        max
      };
    });
    expect(result.frames).toBeGreaterThanOrEqual(30);
    if(result.max>5)expect(result.finalScroll).toBeGreaterThan(result.max*.85);
    await testInfo.attach('scroll-frame-proxy.json', {
      body: Buffer.from(JSON.stringify({ project: testInfo.project.name, ...result }, null, 2)),
      contentType: 'application/json'
    });
    // Chromium is the Android/WebView proxy and remains a release gate.
    // Headless WebKit timing is diagnostic only; CI scheduling is not physical-iPhone FPS.
    if(testInfo.project.name === 'android-galaxy-s24') {
      expect(result.p95, 'S24-class Chromium rAF p95 under scroll').toBeLessThan(80);
      expect(result.worst, 'S24-class Chromium has no catastrophic long frame').toBeLessThan(180);
    }
  });
});
