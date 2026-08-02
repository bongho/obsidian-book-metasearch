/**
 * Language-code translation between the two-letter ISO 639-1 codes we use as
 * canonical (`ko`, `en`, ...) and the three-letter ISO 639-2 codes Open
 * Library exposes (`kor`, `eng`, ...).
 */

const TWO_FROM_THREE: Record<string, string> = {
	eng: 'en',
	kor: 'ko',
	jpn: 'ja',
	chi: 'zh',
	zho: 'zh',
	fre: 'fr',
	fra: 'fr',
	ger: 'de',
	deu: 'de',
	spa: 'es',
	ita: 'it',
	por: 'pt',
	rus: 'ru',
	ara: 'ar',
	hin: 'hi',
	dut: 'nl',
	nld: 'nl',
	pol: 'pl',
	tur: 'tr',
	swe: 'sv',
	dan: 'da',
	fin: 'fi',
	nor: 'no',
	tha: 'th',
	vie: 'vi',
	ind: 'id',
	heb: 'he',
	gre: 'el',
	ell: 'el',
	cze: 'cs',
	ces: 'cs',
	hun: 'hu',
	rom: 'ro',
	ron: 'ro',
	ukr: 'uk',
	bul: 'bg',
	cat: 'ca',
	hrv: 'hr',
	slo: 'sk',
	slk: 'sk',
	slv: 'sl',
	srp: 'sr',
	est: 'et',
	lav: 'lv',
	lit: 'lt',
};

/** Convert an ISO 639-2 code (e.g. 'kor') to ISO 639-1 (e.g. 'ko'). */
export function iso6392to6391(three: string): string | undefined {
	return TWO_FROM_THREE[three.toLowerCase()];
}

/** Convert an ISO 639-1 code (e.g. 'ko') to ISO 639-2 (e.g. 'kor'). */
export function iso6391to6392(two: string): string | undefined {
	for (const [three, twoLetter] of Object.entries(TWO_FROM_THREE)) {
		if (twoLetter === two) return three;
	}
	return undefined;
}
