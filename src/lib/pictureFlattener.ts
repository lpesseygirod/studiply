/**
 * Pictures drawn on white on the iPhone. React Native has no
 * canvas, so a picture that can be transparent goes to the editor bundle's
 * WebView (export bridge, `flatten`), which draws it on white. The app's
 * root mounts that WebView only while pictures are waiting
 * (PictureFlattenerHost); here is the queue between them.
 */

interface Job {
  dataUrl: string;
  resolve: (dataUrl: string) => void;
  reject: (err: Error) => void;
}

const jobs: Job[] = [];
let wake: (() => void) | null = null;
/** No host within this long (it isn't mounted): the picture can't be read. */
const HOST_TIMEOUT_MS = 30_000;

/** The host (the app's root) listens for work. Returns how to stop. */
export function registerFlattener(onWork: () => void): () => void {
  wake = onWork;
  if (jobs.length) onWork();
  return () => {
    if (wake === onWork) wake = null;
  };
}

/** The next picture to draw (the host takes them one by one). */
export const nextFlattenJob = (): Job | undefined => jobs.shift();
export const hasFlattenJobs = () => jobs.length > 0;

/** The picture (a data URI) drawn on white, as a PNG data URI. */
export function flattenOnWhiteNative(dataUrl: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      const at = jobs.indexOf(job);
      if (at >= 0) jobs.splice(at, 1);
      if (!settled) reject(new Error("This image can't be read."));
      settled = true;
    }, HOST_TIMEOUT_MS);
    const job: Job = {
      dataUrl,
      resolve: (out) => {
        clearTimeout(timer);
        if (!settled) resolve(out);
        settled = true;
      },
      reject: (err) => {
        clearTimeout(timer);
        if (!settled) reject(err);
        settled = true;
      },
    };
    jobs.push(job);
    wake?.();
  });
}
