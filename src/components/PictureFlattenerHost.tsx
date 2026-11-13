import React, { useEffect, useRef, useState } from 'react';

import { PdfRenderer, type PdfRendererHandle } from '../editor/PdfRenderer';
import { hasFlattenJobs, nextFlattenJob, registerFlattener } from '../lib/pictureFlattener';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The iPhone's pictures drawn on white (lib/pictureFlattener):
 * mounted once at the app's root, it shows the editor bundle's small WebView
 * only while pictures are waiting, draws them there one by one, and takes it
 * away again. A camera photo never comes here (toJpeg only sends pictures
 * that can be transparent).
 */
export function PictureFlattenerHost() {
  const [run, setRun] = useState(0);
  const [busy, setBusy] = useState(false);
  const renderer = useRef<PdfRendererHandle>(null);

  useEffect(() => registerFlattener(() => setRun((n) => n + 1)), []);

  useEffect(() => {
    if (!hasFlattenJobs()) return;
    let cancelled = false;
    setBusy(true);
    void (async () => {
      while (!cancelled) {
        const job = nextFlattenJob();
        if (!job) break;
        try {
          let handle = renderer.current;
          for (let i = 0; !handle && i < 200; i++) {
            await sleep(50);
            handle = renderer.current;
          }
          if (!handle) throw new Error("This image can't be read.");
          job.resolve(await handle.flattenPicture(job.dataUrl));
        } catch (err) {
          job.reject(err instanceof Error ? err : new Error("This image can't be read."));
        }
      }
      // A newer run took over (more pictures came): it closes the WebView when it is done.
      if (!cancelled && !hasFlattenJobs()) setBusy(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [run]);

  return busy ? <PdfRenderer ref={renderer} /> : null;
}
