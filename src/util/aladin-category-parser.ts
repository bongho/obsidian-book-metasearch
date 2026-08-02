/**
 * Aladin `categoryName` is a `>` delimited hierarchy:
 *   "국내도서>인문학>철학>동양철학"
 *
 * We store it as both a full path array and the leaf, matching bongho vault
 * schema:
 *   category:   ["동양철학"]           (leaf, for filtering)
 *   categories: ["국내도서", "인문학", "철학", "동양철학"]   (full path, for navigation)
 *
 * The function is a pure utility — no dependencies, easy to unit test.
 */

export interface AladinCategoryParts {
	categoryLeaf?: string;
	categoryPath: string[];
}

export function parseAladinCategory(raw: string | undefined): AladinCategoryParts {
	if (!raw) return { categoryPath: [] };
	const path = raw
		.split('>')
		.map((s) => s.trim())
		.filter(Boolean);
	if (path.length === 0) return { categoryPath: [] };
	return {
		categoryPath: path,
		categoryLeaf: path[path.length - 1],
	};
}
