import path from 'node:path';
import { IMAGES_DIR } from '../config/upload';
import { HttpError } from '../errors/HttpError';
import { Image } from '../models';

/**
 * Checks that an account photo (user.faceImageId) shows a face.
 *
 * A small neural network (SSD MobileNet face detector from face-api, run with TensorFlow.js on WebAssembly: plain
 * CPU, nothing to compile) looks at the picture, scaled down to at most 640 px. It answers in about half a second.
 * Nothing leaves the server and nothing about the face is stored: only "a face was found".
 *
 * Lenient on purpose: one face of ordinary size with a modest score is enough (glasses, a head covering, a group
 * photo are all fine). It keeps out logos, products, landscapes and blank pictures; it does not check who it is.
 * If the detector itself can't run (missing package, out of memory), photos are accepted and the error is logged:
 * a broken checker must not stop people from using their account.
 */

/** A detection counts from this score (0 to 1). Clear portraits score 0.9+; non-faces in tests stayed under 0.3 */
const MIN_SCORE = 0.4;
/** ... and when the face covers at least this share of the picture (a face far in the background doesn't count) */
const MIN_SHARE = 0.01;
/** The picture is scaled to fit this many pixels before looking (speed; faces stay large enough) */
const MAX_SIDE = 640;

export const FACE_REQUIRED_MESSAGE =
  'Foto profil harus menampilkan wajah Anda dengan jelas. Gunakan foto yang menghadap kamera dengan cahaya yang cukup, bukan logo, produk, atau pemandangan';

type Detector = (file: string) => Promise<boolean>;
let detector: Promise<Detector> | null = null;

/** Loaded at the first check, not at start-up: the model and TensorFlow take memory only once they are needed. */
function load(): Promise<Detector> {
  detector ??= (async (): Promise<Detector> => {
    const sharp = (await import('sharp')).default;
    const tf = await import('@tensorflow/tfjs');
    const wasm = await import('@tensorflow/tfjs-backend-wasm');
    const faceapi = await import('@vladmandic/face-api/dist/face-api.node-wasm.js');
    wasm.setWasmPaths(`${path.dirname(require.resolve('@tensorflow/tfjs-backend-wasm/package.json'))}/dist/`);
    await tf.setBackend('wasm');
    await tf.ready();
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(path.join(path.dirname(require.resolve('@vladmandic/face-api/package.json')), 'model'));
    const options = new faceapi.SsdMobilenetv1Options({ minConfidence: MIN_SCORE, maxResults: 10 });
    console.log('[face] detector ready');

    return async (file) => {
      // rotate(): phone photos are stored sideways with a note on how to turn them
      const { data, info } = await sharp(file, { failOn: 'none' })
        .rotate()
        .resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const input = tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3]);
      try {
        const found = await faceapi.detectAllFaces(input as never, options);
        const area = info.width * info.height;
        return found.some((d) => d.score >= MIN_SCORE && (d.box.width * d.box.height) / area >= MIN_SHARE);
      } finally {
        input.dispose();
      }
    };
  })();
  // A failed load is tried again at the next check
  detector.catch(() => (detector = null));
  return detector;
}

/** One picture at a time: detection is CPU work, and several at once would only slow each other down. */
let queue: Promise<unknown> = Promise.resolve();

/** true = a face was found, false = none, null = the detector couldn't run (the caller lets the photo through). */
export function hasFace(file: string): Promise<boolean | null> {
  const run = queue.then(async () => {
    try {
      return await (await load())(file);
    } catch (err) {
      console.error('[face] detection could not run, the photo is accepted unchecked:', (err as Error).message);
      return null;
    }
  });
  queue = run;
  return run;
}

/** Results of recent checks by image id, so a photo checked at upload isn't looked at again when it is saved. */
const checked = new Map<number, boolean>();
function remember(imageId: number, result: boolean) {
  if (checked.size > 500) checked.delete(checked.keys().next().value as number);
  checked.set(imageId, result);
}

/** An uploaded file meant as an account photo: throws 400 FACE_NOT_FOUND when it shows no face. */
export async function assertFaceInFile(file: string) {
  if ((await hasFace(file)) === false) throw new HttpError(400, FACE_REQUIRED_MESSAGE, 'FACE_NOT_FOUND');
}

export const rememberFaceImage = (imageId: number) => remember(imageId, true);

/**
 * An image about to become an account photo (register, PATCH /api/auth/me): throws 400 with a `faceImageId` field
 * error when it shows no face. This is the check that counts; the one at upload only gives the answer sooner.
 */
export async function assertFaceImage(imageId: number) {
  let ok = checked.get(imageId);
  if (ok === undefined) {
    const image = await Image.findByPk(imageId, { attributes: ['id', 'imgUrl'] });
    // A missing image is reported by the caller's own check
    if (!image) return;
    const result = await hasFace(path.join(IMAGES_DIR, path.basename(image.imgUrl)));
    ok = result !== false;
    if (result !== null) remember(imageId, ok);
  }
  if (!ok) throw new HttpError(400, 'Validasi gagal', 'FACE_NOT_FOUND', [{ field: 'faceImageId', message: FACE_REQUIRED_MESSAGE }]);
}
