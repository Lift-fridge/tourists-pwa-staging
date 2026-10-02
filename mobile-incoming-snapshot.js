'use strict';

// Supabase temporary transferから受け取るsnapshot v2だけを保存前に検証する。
// 既存のMobileSnapshotStore.validSnapshot()は保存済み旧snapshotとの互換用なので変更しない。
globalThis.MobileIncomingSnapshot = (() => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const TIME = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/;
  const HASH = /^[0-9a-f]{64}$/;
  const CREATED_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
  const MAX_ROWS = 10000;
  const MAX_INFORMATION_LENGTH = 20000;
  const MAX_MEMO_BODY_LENGTH = 20000;
  const TOP_FIELDS = ['schema_version', 'snapshot_id', 'created_at', 'content_hash', 'trip_key', 'trip', 'places', 'days', 'candidates', 'memo_pages'];
  const TRIP_FIELDS = ['title', 'destination', 'departure_date', 'nights', 'interests', 'pace', 'fixed_schedule'];
  const DAY_FIELDS = ['day_key', 'day_number', 'date', 'summary', 'notes', 'items'];
  const ITEM_FIELDS = ['card_key', 'start_time', 'end_time', 'title', 'item_type', 'information', 'origin', 'destination', 'transport_mode', 'place_key', 'maps_url', 'website_location_url', 'website_additional_url', 'website_url', 'placement'];
  const FORMAL_ITEM_FIELDS = [...ITEM_FIELDS, 'options'];
  const CANDIDATE_FIELDS = [...ITEM_FIELDS, 'candidate_origin'];
  const PLACE_FIELDS = ['place_key', 'name', 'category', 'address', 'notes', 'auto_url', 'user_url', 'auto_url_status'];
  const MEMO_FIELDS = ['memo_page_key', 'title', 'body', 'sort_order'];

  function record(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return Object.prototype.toString.call(value) === '[object Object]';
  }

  function exactFields(value, fields) {
    return record(value) && Object.keys(value).length === fields.length
      && fields.every((field) => Object.prototype.hasOwnProperty.call(value, field));
  }

  function safeText(value, {required = false, limit = 200, preserve = false} = {}) {
    if (value === null && !required) return true;
    if (typeof value !== 'string') return false;
    if ((required && !value.trim()) || value.length > limit) return false;
    if (!preserve && value !== value.trim()) return false;
    return !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
  }

  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(value + 'T00:00:00Z');
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }

  function validCreatedAt(value) {
    if (typeof value !== 'string' || !CREATED_AT.test(value)) return false;
    const parsed = new Date(value);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value.slice(0, -1) + '.000Z';
  }

  function validUrl(value) {
    if (value === null) return true;
    if (typeof value !== 'string' || !value || value.length > 4096 || /[\u0000-\u001f\u007f]/.test(value)) return false;
    try {
      const url = new URL(value);
      return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password;
    } catch (_) {
      return false;
    }
  }

  function validOptionalKey(value, prefix) {
    return value === null || (typeof value === 'string' && new RegExp('^' + prefix + '-[1-9][0-9]*$').test(value));
  }

  function validItem(value, placement, placeKeys, {formal = false, candidate = false} = {}) {
    const fields = formal ? FORMAL_ITEM_FIELDS : candidate ? CANDIDATE_FIELDS : ITEM_FIELDS;
    if (!exactFields(value, fields) || value.placement !== placement) return false;
    if (!safeText(value.card_key, {required: true, limit: 200})
        || !safeText(value.title, {required: true, limit: 200})
        || !safeText(value.item_type, {required: true, limit: 50})
        || !safeText(value.information, {limit: MAX_INFORMATION_LENGTH, preserve: true})
        || !safeText(value.origin, {limit: 200})
        || !safeText(value.destination, {limit: 200})
        || !safeText(value.transport_mode, {limit: 200})
        || !validOptionalKey(value.place_key, 'place')
        || (value.place_key !== null && !placeKeys.has(value.place_key))
        || !validUrl(value.maps_url) || !validUrl(value.website_location_url)
        || !validUrl(value.website_additional_url) || !validUrl(value.website_url)) return false;
    if (!(value.start_time === null || TIME.test(value.start_time))
        || !(value.end_time === null || TIME.test(value.end_time))) return false;
    if (formal) {
      if (!Array.isArray(value.options) || value.options.length > MAX_ROWS) return false;
      if (!value.options.every((option) => validItem(option, 'option', placeKeys))) return false;
    }
    if (candidate) {
      const origin = value.candidate_origin;
      if (origin !== null && (!exactFields(origin, ['day_key', 'position'])
          || !/^day-[1-9][0-9]*$/.test(origin.day_key)
          || !Number.isInteger(origin.position) || origin.position < 1 || origin.position > MAX_ROWS)) return false;
    }
    return true;
  }

  function validPlace(value, expectedKey) {
    return exactFields(value, PLACE_FIELDS)
      && value.place_key === expectedKey
      && safeText(value.name, {required: true, limit: 200})
      && safeText(value.category, {required: true, limit: 50})
      && safeText(value.address, {limit: 500})
      && safeText(value.notes, {limit: 2000})
      && validUrl(value.auto_url) && validUrl(value.user_url)
      && ['available', 'not_found', 'unverified'].includes(value.auto_url_status);
  }

  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (!record(value)) return value;
    const result = {};
    Object.keys(value).sort().forEach((key) => { result[key] = canonical(value[key]); });
    return result;
  }

  async function contentHash(content, cryptoApi = globalThis.crypto) {
    if (!cryptoApi?.subtle?.digest || typeof TextEncoder !== 'function') return null;
    const encoded = new TextEncoder().encode(JSON.stringify(canonical(content)));
    const digest = await cryptoApi.subtle.digest('SHA-256', encoded);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async function validSnapshot(snapshot, cryptoApi = globalThis.crypto) {
    try {
      if (!exactFields(snapshot, TOP_FIELDS) || snapshot.schema_version !== 2
          || !UUID.test(snapshot.snapshot_id) || !UUID.test(snapshot.trip_key)
          || !validCreatedAt(snapshot.created_at) || !HASH.test(snapshot.content_hash)) return false;
      if (!exactFields(snapshot.trip, TRIP_FIELDS)
          || !safeText(snapshot.trip.title, {required: true, limit: 200})
          || !safeText(snapshot.trip.destination, {required: true, limit: 100})
          || !validDate(snapshot.trip.departure_date)
          || !Number.isInteger(snapshot.trip.nights) || snapshot.trip.nights < 0 || snapshot.trip.nights > 365
          || !Array.isArray(snapshot.trip.interests) || snapshot.trip.interests.length > 10000
          || !snapshot.trip.interests.every((value) => safeText(value, {required: true, limit: 100}))
          || !['slow', 'normal', 'busy'].includes(snapshot.trip.pace)
          || !safeText(snapshot.trip.fixed_schedule, {limit: MAX_INFORMATION_LENGTH})) return false;
      if (!Array.isArray(snapshot.places) || snapshot.places.length > MAX_ROWS * 3
          || !Array.isArray(snapshot.days) || snapshot.days.length !== snapshot.trip.nights + 1 || snapshot.days.length > 366
          || !Array.isArray(snapshot.candidates) || snapshot.candidates.length > MAX_ROWS
          || !Array.isArray(snapshot.memo_pages) || snapshot.memo_pages.length > MAX_ROWS) return false;
      const placeKeys = new Set();
      for (let index = 0; index < snapshot.places.length; index += 1) {
        const key = 'place-' + (index + 1);
        if (!validPlace(snapshot.places[index], key)) return false;
        placeKeys.add(key);
      }
      const dayKeys = new Set();
      let formalCount = 0;
      let optionCount = 0;
      for (let index = 0; index < snapshot.days.length; index += 1) {
        const day = snapshot.days[index];
        const number = index + 1;
        const key = 'day-' + number;
        if (!exactFields(day, DAY_FIELDS) || day.day_key !== key || day.day_number !== number
            || !validDate(day.date) || !safeText(day.summary, {limit: 200})
            || !safeText(day.notes, {limit: 2000}) || !Array.isArray(day.items)) return false;
        const expectedDate = new Date(snapshot.trip.departure_date + 'T00:00:00Z');
        expectedDate.setUTCDate(expectedDate.getUTCDate() + index);
        if (expectedDate.toISOString().slice(0, 10) !== day.date) return false;
        formalCount += day.items.length;
        if (formalCount > MAX_ROWS || !day.items.every((item) => validItem(item, 'day', placeKeys, {formal: true}))) return false;
        optionCount += day.items.reduce((total, item) => total + item.options.length, 0);
        if (optionCount > MAX_ROWS) return false;
        dayKeys.add(key);
      }
      for (const candidate of snapshot.candidates) {
        if (!validItem(candidate, 'candidate', placeKeys, {candidate: true})) return false;
        if (candidate.candidate_origin !== null && !dayKeys.has(candidate.candidate_origin.day_key)) return false;
      }
      let lastSortOrder = 0;
      for (let index = 0; index < snapshot.memo_pages.length; index += 1) {
        const memo = snapshot.memo_pages[index];
        if (!exactFields(memo, MEMO_FIELDS) || memo.memo_page_key !== 'memo-page-' + (index + 1)
            || !safeText(memo.title, {required: true, limit: 200})
            || typeof memo.body !== 'string'
            || !safeText(memo.body, {limit: MAX_MEMO_BODY_LENGTH, preserve: true})
            || !Number.isInteger(memo.sort_order) || memo.sort_order < 1 || memo.sort_order <= lastSortOrder) return false;
        lastSortOrder = memo.sort_order;
      }
      const content = {
        trip_key: snapshot.trip_key, trip: snapshot.trip, places: snapshot.places,
        days: snapshot.days, candidates: snapshot.candidates, memo_pages: snapshot.memo_pages,
      };
      return (await contentHash(content, cryptoApi)) === snapshot.content_hash;
    } catch (_) {
      return false;
    }
  }

  return Object.freeze({validSnapshot, contentHash});
})();
