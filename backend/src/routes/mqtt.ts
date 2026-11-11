import { Router } from 'express';

export function mqttRoutes(
  router: Router,
  getSettings: () => any,
  getComposer: (matrixId: string) => any,
  startComposer: (matrixId: string) => any,
  stopComposer: (matrixId: string) => any
) {
  router.get('/mqtt', (req, res) => {
    const s = getSettings();
    res.json(s ? s.mqtt : {});
  });

  // PUT /api/mqtt is handled in index.ts so it can persist settings.

  router.get('/matrices', (req, res) => {
    const s = getSettings();
    res.json(s?.matrices || []);
  });

  router.post('/matrices', (req, res) => {
    // handled via /api/settings
    res.json({ ok: true });
  });

  router.put('/matrices/:id', (req, res) => {
    res.json({ ok: true });
  });

  router.post('/composer/:id/start', async (req, res) => {
    try {
      const composer = startComposer(req.params.id);
      const base = req.body;
      if (base && base.type) {
        switch (base.type) {
          case 'library':
            composer.setBaseSource({ type: 'library', id: base.id });
            break;
          case 'drawing':
            composer.setBaseSource({ type: 'drawing', id: base.id, frame: base.frame });
            break;
          case 'color':
            composer.setBaseSource({ type: 'color', r: base.r, g: base.g, b: base.b });
            break;
          default:
            composer.setBaseSource({ type: 'off' });
        }
      }
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/composer/:id/stop', async (req, res) => {
    try {
      stopComposer(req.params.id);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/composer/:id/status', (req, res) => {
    try {
      const status = getComposer(req.params.id);
      res.json(status || { running: false, queues: [] });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/composer/:matrixId/overlay/:areaId', async (req, res) => {
    try {
      const composer = startComposer(req.params.matrixId);
      composer.pushOverlay(req.params.areaId, req.body.text, req.body);
      res.json({ queued: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/composer/:matrixId/clear', async (req, res) => {
    try {
      const composer = getComposer(req.params.matrixId);
      if (composer) composer.clearOverlays(req.body.areaId);
      res.json({ cleared: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
