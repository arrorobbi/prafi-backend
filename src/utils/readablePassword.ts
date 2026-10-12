import { randomInt } from 'node:crypto';

/** Everyday Indonesian words, 4 to 6 letters: easy to read out, type and remember */
const WORDS = [
  'kopi', 'teh', 'nasi', 'roti', 'susu', 'madu', 'gula', 'padi', 'sagu', 'ubi', 'jagung', 'pisang', 'mangga', 'pepaya', 'jeruk',
  'kelapa', 'durian', 'salak', 'nanas', 'melon', 'apel', 'tomat', 'cabai', 'bayam', 'wortel', 'kacang', 'bunga', 'mawar', 'melati',
  'daun', 'pohon', 'hutan', 'gunung', 'bukit', 'sungai', 'danau', 'pantai', 'laut', 'pulau', 'ombak', 'pasir', 'batu', 'angin',
  'hujan', 'embun', 'awan', 'langit', 'bulan', 'bintang', 'surya', 'pagi', 'siang', 'senja', 'malam', 'burung', 'ikan', 'rusa',
  'kupu', 'lebah', 'ayam', 'kuda', 'rumah', 'pintu', 'meja', 'kursi', 'lampu', 'buku', 'pena', 'jalan', 'pasar', 'kebun',
  'sawah', 'ladang', 'desa', 'kota', 'perahu', 'sepeda', 'payung', 'topi', 'baju', 'kain', 'emas', 'perak', 'merah', 'biru',
  'hijau', 'putih', 'kuning', 'ungu', 'manis', 'segar', 'cerah', 'damai', 'ramah', 'rajin', 'hebat', 'maju', 'jaya', 'makmur',
].filter((w) => w.length >= 4 && w.length <= 6);

/** No 0 or 1: they are mistaken for the letters O and l */
const DIGITS = '23456789';

export const READABLE_PASSWORD_LENGTH = 8;

/**
 * A temporary password a person can read and remember: a capitalised word followed by digits, 8 characters in all,
 * e.g. "Mangga47", "Senja394", "Kopi2847". Not meant to be strong on its own: it is only accepted together with the
 * activation link from the same email, and must be replaced before the account can log in.
 */
export function readablePassword() {
  const word = WORDS[randomInt(WORDS.length)];
  let digits = '';
  while (word.length + digits.length < READABLE_PASSWORD_LENGTH) digits += DIGITS[randomInt(DIGITS.length)];
  return word[0].toUpperCase() + word.slice(1) + digits;
}
