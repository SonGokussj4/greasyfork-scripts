export function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveRecordUrl(record) {
  if (record.fullUrl) {
    return record.fullUrl;
  }

  if (record.url) {
    return new URL(`/film/${record.url}/`, location.origin).toString();
  }

  return '';
}

function normalizeModalType(rawType) {
  const normalized = String(rawType || '').toLowerCase();
  if (normalized.includes('epizoda') || normalized === 'episode') {
    return { key: 'episode', label: 'Episode' };
  }
  if (normalized.includes('seriál') || normalized.includes('serial') || normalized === 'serial') {
    return { key: 'series', label: 'Series' };
  }
  if (normalized.includes('série') || normalized.includes('serie') || normalized === 'series') {
    return { key: 'season', label: 'Season' };
  }
  return { key: 'movie', label: 'Movie' };
}

function formatRatingForModal(ratingValue) {
  if (!Number.isFinite(ratingValue)) {
    return { stars: '—', isOdpad: false };
  }

  if (ratingValue === 0) {
    return { stars: 'Odpad', isOdpad: true };
  }

  const clamped = Math.max(0, Math.min(5, Math.trunc(ratingValue)));
  return {
    stars: '★'.repeat(clamped),
    isOdpad: false,
  };
}

function extractSeriesInfoToken(record, typeKey) {
  const candidates = [record?.url, record?.fullUrl, record?.name]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  for (const source of candidates) {
    const seasonEpisodeMatch = source.match(/s(\d{1,2})e(\d{1,2})/i);
    if (seasonEpisodeMatch) {
      const season = seasonEpisodeMatch[1].padStart(2, '0');
      const episode = seasonEpisodeMatch[2].padStart(2, '0');
      return `S${season}E${episode}`;
    }

    const seasonOnlyMatch = source.match(/(?:season|série|serie|seri[áa]l)[\s\-\(]*s?(\d{1,2})/i);
    if (seasonOnlyMatch) {
      const season = seasonOnlyMatch[1].padStart(2, '0');
      return `S${season}`;
    }

    const episodeOnlyMatch = source.match(/(?:episode|epizoda|ep\.?)[\s\-\(]*(\d{1,3})/i);
    if (episodeOnlyMatch) {
      const episode = episodeOnlyMatch[1].padStart(2, '0');
      return `E${episode}`;
    }
  }

  return typeKey === 'season' ? 'S??' : typeKey === 'episode' ? 'E??' : '';
}

function getRatingSquareClass(ratingValue) {
  if (!Number.isFinite(ratingValue)) {
    return 'is-unknown';
  }

  if (ratingValue <= 1) return 'is-1';
  if (ratingValue === 2) return 'is-2';
  if (ratingValue === 3) return 'is-3';
  if (ratingValue === 4) return 'is-4';
  return 'is-5';
}

function parseCzechDateToSortableValue(dateText) {
  const trimmed = String(dateText || '').trim();
  const match = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) {
    return Number.NEGATIVE_INFINITY;
  }

  const day = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const year = Number.parseInt(match[3], 10);
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) {
    return Number.NEGATIVE_INFINITY;
  }

  return year * 10000 + month * 100 + day;
}

export function toModalRows(records) {
  return records.map((record) => {
    const ratingValue = Number.isFinite(record.rating) ? record.rating : Number.NEGATIVE_INFINITY;
    const normalizedType = normalizeModalType(record.type);
    const formattedRating = formatRatingForModal(record.rating);
    const parsedYear = Number.isFinite(record.year) ? record.year : NaN;
    const typeToken = extractSeriesInfoToken(record, normalizedType.key);
    const typeDisplay =
      normalizedType.key === 'season' || normalizedType.key === 'episode'
        ? `${normalizedType.label} (${typeToken})`
        : normalizedType.label;

    return {
      name: (record.name || '').trim(),
      url: resolveRecordUrl(record),
      typeKey: normalizedType.key,
      typeLabel: normalizedType.label,
      typeDisplay,
      yearValue: parsedYear,
      ratingText: formattedRating.stars,
      ratingIsOdpad: formattedRating.isOdpad,
      ratingValue,
      ratingSquareClass: getRatingSquareClass(record.rating),
      date: (record.date || '').trim(),
      dateSortValue: parseCzechDateToSortableValue(record.date),
      rawRecord: { ...record },
    };
  });
}

function normalizeSearchText(value) {
  return String(value || '').toLowerCase();
}

export function sortRows(rows, sortKey, sortDir) {
  const sorted = [...rows].sort((a, b) => {
    if (sortKey === 'type') {
      return a.typeDisplay.localeCompare(b.typeDisplay, 'en', { sensitivity: 'base' });
    }

    if (sortKey === 'year') {
      const aYear = Number.isFinite(a.yearValue) ? a.yearValue : -Infinity;
      const bYear = Number.isFinite(b.yearValue) ? b.yearValue : -Infinity;
      return aYear - bYear;
    }

    if (sortKey === 'rating') {
      return a.ratingValue - b.ratingValue;
    }

    if (sortKey === 'date') {
      return a.dateSortValue - b.dateSortValue;
    }

    return a.name.localeCompare(b.name, 'cs', { sensitivity: 'base' });
  });

  return sortDir === 'desc' ? sorted.reverse() : sorted;
}

export function filterRows(rows, search) {
  const query = normalizeSearchText(search).trim();
  if (!query) {
    return rows;
  }

  return rows.filter((row) => {
    return (
      normalizeSearchText(row.name).includes(query) ||
      normalizeSearchText(row.url).includes(query) ||
      normalizeSearchText(row.typeLabel).includes(query) ||
      normalizeSearchText(row.typeDisplay).includes(query) ||
      normalizeSearchText(row.yearValue).includes(query) ||
      normalizeSearchText(row.ratingText).includes(query) ||
      normalizeSearchText(row.date).includes(query)
    );
  });
}

export function filterRowsByType(rows, typeFilters) {
  if (!typeFilters || typeFilters.size === 0 || typeFilters.has('all')) {
    return rows;
  }
  return rows.filter((row) => typeFilters.has(row.typeKey));
}
