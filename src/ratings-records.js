export function buildRatingRecordId(userSlug, movieId) {
  return `${userSlug}:${movieId}`;
}

function parseLastUpdateMs(record) {
  const parsed = Date.parse(record?.lastUpdate || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickPreferredRatingRecord(existingRecord, nextRecord) {
  if (!existingRecord) return nextRecord;

  const existingUpdatedAt = parseLastUpdateMs(existingRecord);
  const nextUpdatedAt = parseLastUpdateMs(nextRecord);
  if (nextUpdatedAt !== existingUpdatedAt) {
    return nextUpdatedAt > existingUpdatedAt ? nextRecord : existingRecord;
  }

  const existingDeleted = existingRecord?.deleted === true;
  const nextDeleted = nextRecord?.deleted === true;
  if (existingDeleted !== nextDeleted) {
    return nextDeleted ? existingRecord : nextRecord;
  }

  const existingDirect = existingRecord?.computed !== true;
  const nextDirect = nextRecord?.computed !== true;
  if (existingDirect !== nextDirect) {
    return nextDirect ? nextRecord : existingRecord;
  }

  const existingRating = Number.isFinite(existingRecord?.rating) ? existingRecord.rating : Number.NEGATIVE_INFINITY;
  const nextRating = Number.isFinite(nextRecord?.rating) ? nextRecord.rating : Number.NEGATIVE_INFINITY;
  if (nextRating !== existingRating) {
    return nextRating > existingRating ? nextRecord : existingRecord;
  }

  return nextRecord;
}

export function reconcileUserRatingRecords(records, userSlug) {
  const relevantRecords = Array.isArray(records)
    ? records.filter((record) => record?.userSlug === userSlug && Number.isFinite(record?.movieId))
    : [];

  const sourceRecordIdsByMovieId = new Map();
  const preferredRecordsByMovieId = new Map();

  for (const record of relevantRecords) {
    const normalizedRecord = {
      ...record,
      id: buildRatingRecordId(userSlug, record.movieId),
    };
    const preferredRecord = pickPreferredRatingRecord(preferredRecordsByMovieId.get(record.movieId), normalizedRecord);
    preferredRecordsByMovieId.set(record.movieId, preferredRecord);
    if (preferredRecord === normalizedRecord) {
      sourceRecordIdsByMovieId.set(record.movieId, record.id);
    }
  }

  const staleRecordIds = [];
  for (const record of relevantRecords) {
    const expectedId = buildRatingRecordId(userSlug, record.movieId);
    const chosenSourceId = sourceRecordIdsByMovieId.get(record.movieId);
    if (record.id !== expectedId || record.id !== chosenSourceId) {
      staleRecordIds.push(record.id);
    }
  }

  return {
    normalizedRecords: Array.from(preferredRecordsByMovieId.values()),
    recordsByMovieId: preferredRecordsByMovieId,
    staleRecordIds: Array.from(new Set(staleRecordIds.filter(Boolean))),
    hasChanges: staleRecordIds.length > 0,
  };
}

/**
 * Direct (non-computed, not yet deleted) records that a complete scan of the
 * user's ČSFD ratings list did not see — i.e. ratings removed on ČSFD since
 * they were stored locally.
 */
export function findStaleRatingRecords(records, seenMovieIds) {
  return (Array.isArray(records) ? records : []).filter(
    (record) =>
      record?.deleted !== true &&
      record?.computed !== true &&
      Number.isFinite(record?.movieId) &&
      !seenMovieIds.has(record.movieId),
  );
}

/**
 * Only trust a scan for deletions when it walked every page and saw at least as
 * many ratings as ČSFD reports; a partial or misparsed scan must never delete.
 */
export function canReconcileDeletions({ completed, totalRatings, seenCount }) {
  return completed === true && totalRatings > 0 && seenCount >= totalRatings;
}

export function toDeletedRatingRecord(record, nowIso = new Date().toISOString()) {
  return { ...record, rating: null, deleted: true, lastUpdate: nowIso };
}
