'use strict';

const homeTitle = document.getElementById('mobile-home-trip-title');
const homeDates = document.getElementById('mobile-home-trip-dates');
const homeMessage = document.getElementById('mobile-home-message');
const mobileCover = document.getElementById('mobile-cover');
const mobileCoverTitle = document.getElementById('mobile-cover-title');
const mobileCoverDestination = document.getElementById('mobile-cover-destination');
const mobileCoverDates = document.getElementById('mobile-cover-dates');
const mobileCoverSavedAt = document.getElementById('mobile-cover-saved-at');
const mobileTripContent = document.getElementById('mobile-trip-content');
const savedTripsShow = document.getElementById('mobile-cover-saved-trips-show');
const savedTripList = document.getElementById('mobile-saved-trip-list');
const savedTripListStatus = document.getElementById('mobile-saved-trip-list-status');
const savedTripListItems = document.getElementById('mobile-saved-trip-list-items');
const savedTripReceiveShow = document.getElementById('mobile-saved-trip-receive-show');
const savedTripQrScanner = document.getElementById('mobile-saved-trip-qr-scanner');
const savedTripQrScannerVideo = document.getElementById('mobile-saved-trip-qr-scanner-video');
const savedTripQrScannerCanvas = document.getElementById('mobile-saved-trip-qr-scanner-canvas');
const savedTripQrScannerStatus = document.getElementById('mobile-saved-trip-qr-scanner-status');
const savedTripQrScannerClose = document.getElementById('mobile-saved-trip-qr-scanner-close');
const mobileItinerary = document.getElementById('mobile-itinerary');
const mobileItineraryTabInfo = document.getElementById('mobile-itinerary-tab-info');
const mobileItineraryTabItinerary = document.getElementById('mobile-itinerary-tab-itinerary');
const mobileItineraryTabMemo = document.getElementById('mobile-itinerary-tab-memo');
const mobileItineraryDateNav = document.getElementById('mobile-itinerary-date-nav');
const mobileItineraryDays = document.getElementById('mobile-itinerary-days');
const pwaDiagnosticsShow = document.getElementById('mobile-pwa-diagnostics-show');
const pwaDiagnosticsResult = document.getElementById('mobile-pwa-diagnostics-result');
const pwaDiagnosticsSection = document.getElementById('mobile-pwa-diagnostics');

const PWA_SHELL_VERSION = 'staging-1923fc3';
const PWA_CACHE_PREFIX = 'travel-shiori-staging-shell-';
const PWA_CACHE_NAME = PWA_CACHE_PREFIX + PWA_SHELL_VERSION;
const PWA_SHELL_ASSETS = [
  './index.html?pwa=staging-1923fc3',
  './mobile.js?pwa=staging-1923fc3',
  './mobile.css?pwa=staging-1923fc3',
  './mobile-snapshot-store.js?pwa=staging-1923fc3',
  './mobile-incoming-snapshot.js?pwa=staging-1923fc3',
  './tourists-public-config.js?pwa=staging-1923fc3',
  './assets/jsqr-1.4.0.js?pwa=staging-1923fc3',
  './manifest.webmanifest?pwa=staging-1923fc3',
  './assets/icon-192.png?pwa=staging-1923fc3',
  './assets/icon-512.png?pwa=staging-1923fc3',
  './assets/icon-maskable-512.png?pwa=staging-1923fc3',
  './assets/mobile-cover.png?pwa=staging-1923fc3',
  './assets/mobile-clover.svg?pwa=staging-1923fc3',
];

let selectedMobileDayKey = null;
let mobileItineraryDayButtons = new Map();
let currentMobileSnapshot = null;
let mobileActiveTab = 'itinerary';
let selectedMobileMemoPageKey = null;
const MOBILE_COVER_SWIPE_THRESHOLD_RATIO = 0.10;
const MOBILE_COVER_DIRECTION_LOCK_PX = 8;
const MOBILE_COVER_SETTLE_MS = 180;
let mobileCoverPointer = null;
let mobileCoverSettleTimer = null;
let mobileCoverLeaving = false;
let savedTripCrossfadeTimer = null;
const MOBILE_SAVED_TRIP_CROSSFADE_MS = 600;
const MOBILE_ITINERARY_DAY_SWIPE_THRESHOLD_PX = 56;
const MOBILE_ITINERARY_DAY_SWIPE_DIRECTION_LOCK_PX = 8;
const MOBILE_TAB_SWIPE_SETTLE_MS = 180;
let mobileItineraryDaySwipe = null;
let mobileTabSwipeSettling = false;
const mobileTabScrollPositions = {
  itinerary: new Map(),
  info: new Map(),
  memoList: null,
};
const MOBILE_PREVIEW_SHIFT_AXIS_DOMINANCE_RATIO = 1.25;
let mobilePreviewShiftLatch = {
  held: false, consumed: false, ambiguous: false, axis: null, direction: 0, distance: 0, pendingX: 0, pendingY: 0,
};
const MOBILE_PREVIEW_SHIFT_MESSAGE_TYPE = 'travel-planner:mobile-preview-shift';
const MOBILE_FONT_SIZE_DEFAULT = 'medium';
const MOBILE_FONT_SIZES = new Set(['small', 'medium', 'large']);
let mobileFontSize = MOBILE_FONT_SIZE_DEFAULT;
let mobileFontSizeWriteChain = Promise.resolve();
const mobileFontSizeButtons = new Map();
let mobileQrScannerSession = null;
const TOURISTS_TRANSFER_PAYLOAD = /^tourists:v1:([A-Za-z0-9_-]{43})$/;

function mobilePreviewRequest() {
  if (!window.location || typeof window.location.search !== 'string') return {enabled: false, tripId: null};
  const params = new URLSearchParams(window.location.search);
  if (!params.has('preview')) return {enabled: false, tripId: null};
  const tripIds = params.getAll('trip_id');
  const valid = params.getAll('preview').length === 1 && params.get('preview') === '1'
    && tripIds.length === 1
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tripIds[0])
    && [...params.keys()].length === 2;
  return {enabled: true, tripId: valid ? tripIds[0] : null};
}

const mobilePreview = mobilePreviewRequest();

function mobileFontSizeValue(value) {
  return typeof value === 'string' && MOBILE_FONT_SIZES.has(value) ? value : MOBILE_FONT_SIZE_DEFAULT;
}

function applyMobileFontSize(value) {
  mobileFontSize = mobileFontSizeValue(value);
  mobileTripContent.setAttribute('data-mobile-font-size', mobileFontSize);
  savedTripList.setAttribute('data-mobile-font-size', mobileFontSize);
  mobileFontSizeButtons.forEach((button, size) => {
    const selected = size === mobileFontSize;
    button.setAttribute('aria-pressed', String(selected));
    toggleMobileElementClass(button, 'mobile-font-size-option-current', selected);
  });
}

async function restoreMobileFontSize() {
  applyMobileFontSize(MOBILE_FONT_SIZE_DEFAULT);
  if (mobilePreview.enabled) return;
  try {
    applyMobileFontSize(await globalThis.MobileSnapshotStore.loadFontSize());
  } catch (_) {
    applyMobileFontSize(MOBILE_FONT_SIZE_DEFAULT);
  }
}

function setMobileFontSize(value) {
  const next = mobileFontSizeValue(value);
  if (!MOBILE_FONT_SIZES.has(value) || mobilePreview.enabled) return;
  applyMobileFontSize(next);
  mobileFontSizeWriteChain = mobileFontSizeWriteChain.catch(() => {}).then(
    () => globalThis.MobileSnapshotStore.saveFontSize(next),
  ).catch(() => {
    if (mobileFontSize === next) applyMobileFontSize(MOBILE_FONT_SIZE_DEFAULT);
  });
}

function mobileTripTitle(snapshot) {
  const title = snapshot?.trip?.title;
  return typeof title === 'string' && title.trim() && title.length <= 200 ? title.trim() : null;
}

function mobileDepartureDate(snapshot) {
  const departure = snapshot?.trip?.departure_date;
  return typeof departure === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(departure) ? departure : null;
}

function mobileDateRange(snapshot) {
  const departure = mobileDepartureDate(snapshot);
  const nights = snapshot?.trip?.nights;
  if (!departure || !Number.isInteger(nights) || nights < 0 || nights > 365) return null;
  const start = new Date(departure + 'T00:00:00Z');
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime());
  end.setUTCDate(end.getUTCDate() + nights);
  const format = (value) => new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', timeZone: 'UTC',
  }).format(value);
  return format(start) + '〜' + format(end);
}

function mobileCoverDestinationText(snapshot) {
  const destination = snapshot?.trip?.destination;
  // snapshotには英字表記専用fieldがない。既存の英字目的地だけを安全に大文字表示し、
  // 日本語等を新たに変換・生成しない。
  return typeof destination === 'string' && /^[A-Za-z][A-Za-z .,'-]*$/.test(destination.trim())
    ? destination.trim().toUpperCase() : null;
}

function mobileSnapshotSavedAt(snapshot) {
  if (typeof snapshot?.created_at !== 'string') return null;
  const value = new Date(snapshot.created_at);
  if (Number.isNaN(value.getTime())) return null;
  const parts = new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hour12: false, timeZone: 'Asia/Tokyo',
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year && values.month && values.day && values.hour && values.minute
    ? '保存 ' + values.year + '/' + values.month + '/' + values.day + ' ' + values.hour + ':' + values.minute
    : null;
}

function mobileItineraryDaysFrom(snapshot) {
  if (!Array.isArray(snapshot?.days)) return [];
  return snapshot.days
    .filter((day) => day && typeof day === 'object' && typeof day.day_key === 'string'
      && typeof day.date === 'string' && Array.isArray(day.items))
    .sort((left, right) => (left.day_number || 0) - (right.day_number || 0));
}

function mobileItineraryDateLabel(day) {
  const value = new Date(day.date + 'T00:00:00Z');
  if (Number.isNaN(value.getTime())) return 'Day ' + day.day_number;
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'UTC',
  }).format(value);
}

function mobileLocalDateKey() {
  const today = new Date();
  if (Number.isNaN(today.getTime())) return null;
  const pad = (value) => String(value).padStart(2, '0');
  return today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate());
}

function mobileInitialDayKey(days) {
  const first = days[0];
  const last = days[days.length - 1];
  const today = mobileLocalDateKey();
  if (today && first.date <= today && today <= last.date) {
    return days.find((day) => day.date === today)?.day_key || first.day_key;
  }
  return first.day_key;
}

function appendMobileText(parent, tagName, className, value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = value;
  parent.append(element);
  return element;
}

function mobileExternalUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? value : null;
  } catch (_) {
    return null;
  }
}

function appendMobileExternalLink(parent, url, label, kind) {
  const link = document.createElement('a');
  link.className = 'mobile-itinerary-url-link mobile-itinerary-url-link-' + kind;
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.setAttribute('aria-label', label);
  link.title = label;
  const svg = document.createElementNS
    ? document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    : document.createElement('svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const shape = document.createElementNS
    ? document.createElementNS('http://www.w3.org/2000/svg', kind === 'maps' ? 'path' : 'circle')
    : document.createElement(kind === 'maps' ? 'path' : 'circle');
  if (kind === 'maps') {
    shape.setAttribute('d', 'M12 2a7 7 0 0 0-7 7c0 5.1 7 13 7 13s7-7.9 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z');
    svg.append(shape);
  } else {
    shape.setAttribute('cx', '12'); shape.setAttribute('cy', '12'); shape.setAttribute('r', '8.5');
    const vertical = document.createElementNS
      ? document.createElementNS('http://www.w3.org/2000/svg', 'path') : document.createElement('path');
    const horizontal = document.createElementNS
      ? document.createElementNS('http://www.w3.org/2000/svg', 'path') : document.createElement('path');
    vertical.setAttribute('d', 'M12 3.5c2.4 2.2 3.7 5 3.7 8.5S14.4 18.3 12 20.5C9.6 18.3 8.3 15.5 8.3 12S9.6 5.7 12 3.5Z');
    horizontal.setAttribute('d', 'M4 12h16');
    svg.append(shape, vertical, horizontal);
  }
  link.append(svg);
  parent.append(link);
}

function appendMobileItineraryLinks(parent, item) {
  const links = document.createElement('span');
  links.className = 'mobile-itinerary-links';
  const mapsUrl = mobileExternalUrl(item.maps_url);
  if (mapsUrl) appendMobileExternalLink(links, mapsUrl, 'Google Mapsを開く', 'maps');

  const locationUrl = mobileExternalUrl(item.website_location_url);
  const additionalUrl = mobileExternalUrl(item.website_additional_url);
  const websiteUrls = [];
  if (locationUrl) websiteUrls.push({url: locationUrl, kind: 'location', label: '場所のWebサイトを開く'});
  if (additionalUrl && !websiteUrls.some((entry) => entry.url === additionalUrl)) {
    websiteUrls.push({url: additionalUrl, kind: 'additional', label: '追加Webサイトを開く'});
  }
  // Step 1以前の保存済みv2 snapshotだけは、既存の実効URLを1件として読む。
  if (!Object.prototype.hasOwnProperty.call(item, 'website_location_url')
      && !Object.prototype.hasOwnProperty.call(item, 'website_additional_url')) {
    const legacyUrl = mobileExternalUrl(item.website_url);
    if (legacyUrl) websiteUrls.push({url: legacyUrl, kind: 'location', label: 'Webサイトを開く'});
  }
  websiteUrls.forEach((entry) => appendMobileExternalLink(links, entry.url, entry.label, entry.kind));
  if (links.childElementCount) parent.append(links);
}

function mobileItemTime(value) {
  const time = typeof value === 'string' ? value.trim() : '';
  return /^\d{2}:\d{2}(?::\d{2})?$/.test(time) ? time.slice(0, 5) : '';
}

function mobileItemStartTime(item) {
  return mobileItemTime(item.start_time);
}

function mobileItemEndTime(item) {
  return mobileItemTime(item.end_time);
}

function mobileItemHeading(item) {
  if (item.item_type !== 'transport') return item.title;
  if (typeof item.origin === 'string' && item.origin && typeof item.destination === 'string' && item.destination) {
    return item.origin + ' → ' + item.destination;
  }
  return item.title;
}

function mobileItineraryTimeLabel(item) {
  const start = mobileItemStartTime(item);
  const end = mobileItemEndTime(item);
  if (start) return start;
  if (end) return end + 'まで';
  return '';
}

function mobileInfoTimeRange(item) {
  const start = mobileItemStartTime(item);
  const end = mobileItemEndTime(item);
  if (start && end) return start + '–' + end;
  if (start) return start;
  if (end) return end + 'まで';
  return '';
}

function appendMobileItineraryLine(parent, item, time, lineClassName, {reserveTimeColumn = false} = {}) {
  const line = document.createElement('div');
  line.className = lineClassName;
  if (time || reserveTimeColumn) {
    const timeCell = document.createElement('p');
    timeCell.className = 'mobile-itinerary-card-time';
    if (time) {
      if (!mobileItemStartTime(item) && mobileItemEndTime(item) && time.endsWith('まで')) {
        timeCell.append(document.createTextNode(time.slice(0, -2)));
        const suffix = document.createElement('span');
        suffix.className = 'mobile-itinerary-time-suffix';
        suffix.textContent = 'まで';
        timeCell.append(suffix);
      } else {
        timeCell.textContent = time;
      }
    } else {
      timeCell.setAttribute('aria-hidden', 'true');
    }
    line.append(timeCell);
  }
  const content = document.createElement('div');
  content.className = 'mobile-itinerary-card-content';
  const title = appendMobileText(content, 'h3', 'mobile-itinerary-card-title', mobileItemHeading(item));
  if (title) appendMobileItineraryLinks(title, item);
  line.append(content);
  parent.append(line);
}

function renderMobileItineraryCard(item, {
  kind = 'formal', showTime = true, reserveTimeColumn = false, showTransport = true, itemIndex = null,
} = {}) {
  const card = document.createElement('article');
  const isTransport = item.item_type === 'transport';
  card.className = 'mobile-itinerary-card mobile-itinerary-card-' + kind + ' ' + (isTransport
    ? 'mobile-itinerary-card-transport' : 'mobile-itinerary-card-stay');
  if (kind === 'formal' && Number.isInteger(itemIndex)) card.setAttribute('data-mobile-item-index', String(itemIndex));
  const time = showTime ? mobileItineraryTimeLabel(item) : '';
  const lineOptions = {reserveTimeColumn: reserveTimeColumn || showTime};
  if (!isTransport) {
    appendMobileItineraryLine(card, item, time, 'mobile-itinerary-stay-line', lineOptions);
    return card;
  }

  appendMobileItineraryLine(card, item, time, 'mobile-itinerary-movement-line', lineOptions);
  const secondLine = document.createElement('div');
  secondLine.className = 'mobile-itinerary-movement-second-line';
  const transport = typeof item.transport_mode === 'string' ? item.transport_mode.trim() : '';
  if (transport) appendMobileText(secondLine, 'p', 'mobile-itinerary-card-transport-mode', transport);
  if (showTransport && secondLine.childElementCount) card.append(secondLine);
  return card;
}

function appendMobileInfoCard(parent, item, {
  kind = 'formal', showTime = true, showTransport = true, itemIndex = null,
} = {}) {
  const card = document.createElement('article');
  const isTransport = item.item_type === 'transport';
  card.className = 'mobile-info-card mobile-info-card-' + kind
    + (isTransport ? ' mobile-info-card-transport' : ' mobile-info-card-stay');
  if (kind === 'formal' && Number.isInteger(itemIndex)) card.setAttribute('data-mobile-item-index', String(itemIndex));
  if (showTime) appendMobileText(card, 'p', 'mobile-info-card-time-range', mobileInfoTimeRange(item));

  const heading = document.createElement('div');
  heading.className = 'mobile-info-card-heading';
  const title = appendMobileText(heading, 'h3', 'mobile-info-card-title', mobileItemHeading(item));
  if (title) appendMobileItineraryLinks(title, item);
  card.append(heading);

  if (showTransport && isTransport) {
    const transport = typeof item.transport_mode === 'string' ? item.transport_mode.trim() : '';
    appendMobileText(card, 'p', 'mobile-info-card-transport-mode', transport);
  }
  appendMobileText(card, 'p', 'mobile-info-card-information', item.information);
  parent.append(card);
  return card;
}

function appendMobileInfoOptions(parent, item) {
  if (!Array.isArray(item.options) || !item.options.length) return;
  const options = document.createElement('section');
  options.className = 'mobile-info-options';
  item.options
    .filter((option) => option && typeof option === 'object' && option.placement === 'option')
    .forEach((option) => appendMobileInfoCard(options, option, {
      kind: 'option', showTime: false, showTransport: false,
    }));
  if (options.childElementCount) parent.append(options);
}

function appendMobileItineraryOptions(parent, item) {
  if (!Array.isArray(item.options) || !item.options.length) return;
  const options = document.createElement('section');
  options.className = 'mobile-itinerary-options';
  item.options
    .filter((option) => option && typeof option === 'object' && option.placement === 'option')
    .forEach((option) => options.append(renderMobileItineraryCard(option, {
      kind: 'option', showTime: false, reserveTimeColumn: true, showTransport: false,
    })));
  if (options.childElementCount) parent.append(options);
}

function mobileTravelCandidates(snapshot) {
  if (!Array.isArray(snapshot?.candidates)) return [];
  return snapshot.candidates.filter((candidate) => candidate && typeof candidate === 'object'
    && candidate.placement === 'candidate' && candidate.item_type === 'place');
}

function appendMobileCandidateSection(parent, snapshot, appendCandidate) {
  const candidates = mobileTravelCandidates(snapshot);
  if (!candidates.length) return;
  appendMobileText(parent, 'p', 'mobile-info-candidate-separator', '・　・　・');
  appendMobileText(parent, 'h3', 'mobile-info-candidate-heading', '候補');
  candidates.forEach(appendCandidate);
}

function mobileMemoPages(snapshot) {
  if (!Array.isArray(snapshot?.memo_pages)) return [];
  return snapshot.memo_pages.filter((page) => page && typeof page === 'object'
    && typeof page.memo_page_key === 'string' && page.memo_page_key
    && typeof page.title === 'string' && page.title.trim());
}

function mobileMemoPage(snapshot, memoPageKey) {
  return mobileMemoPages(snapshot).find((page) => page.memo_page_key === memoPageKey) || null;
}

function mobileIsPrivateHttpHost(hostname) {
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '::1' || hostname === '::') return true;
  if (hostname.includes(':') && (/^(?:fc|fd)[0-9a-f:]*$/i.test(hostname) || /^fe80:/i.test(hostname))) return true;
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some((octet) => octet > 255)) return true;
  const [first, second] = octets;
  return first === 0 || first === 10 || first === 127 || first === 169 && second === 254
    || first === 172 && second >= 16 && second <= 31 || first === 192 && second === 168
    || first === 100 && second >= 64 && second <= 127;
}

function mobileSafeHttpUrl(value) {
  if (typeof value !== 'string' || !value || value.length > 2000 || /[\s\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!['https:', 'http:'].includes(url.protocol) || !hostname || url.username || url.password
        || mobileIsPrivateHttpHost(hostname)) return null;
    return url.href;
  } catch (_) {
    return null;
  }
}

function appendMobilePlainTextWithHttpLinksFragment(container, text) {
  const urlPattern = /https?:\/\/[^\s<>\"'`]+/g;
  let cursor = 0;
  for (const match of text.matchAll(urlPattern)) {
    const urlText = match[0];
    const index = match.index ?? cursor;
    if (index > cursor) container.append(document.createTextNode(text.slice(cursor, index)));
    const safeUrl = mobileSafeHttpUrl(urlText);
    if (safeUrl) {
      const link = document.createElement('a');
      link.href = safeUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = urlText;
      container.append(link);
    } else {
      container.append(document.createTextNode(urlText));
    }
    cursor = index + urlText.length;
  }
  if (cursor < text.length) container.append(document.createTextNode(text.slice(cursor)));
}

function appendMobilePlainTextWithHttpLinks(container, value) {
  const text = typeof value === 'string' ? value : '';
  container.replaceChildren();
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const safeUrl = trimmed && mobileSafeHttpUrl(trimmed);
    if (safeUrl) {
      const urlOnlyLine = document.createElement('span');
      urlOnlyLine.className = 'mobile-memo-url-only';
      const link = document.createElement('a');
      link.href = safeUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = trimmed;
      urlOnlyLine.append(link);
      container.append(urlOnlyLine);
    } else {
      appendMobilePlainTextWithHttpLinksFragment(container, line);
    }
    if (index < lines.length - 1 && !safeUrl) container.append(document.createTextNode('\n'));
  });
}

function selectMobileMemoPage(snapshot, memoPageKey) {
  if (!mobileMemoPage(snapshot, memoPageKey)) return;
  if (mobileActiveTab === 'memo' && !selectedMobileMemoPageKey) saveMobileTabScroll('memo');
  selectedMobileMemoPageKey = memoPageKey;
  renderMobileItinerary(snapshot);
}

function showMobileMemoList(snapshot) {
  selectedMobileMemoPageKey = null;
  renderMobileItinerary(snapshot);
  restoreMobileTabScroll('memo', savedMobileTabScroll('memo'));
}

function renderMobileFontSizeSettings() {
  const section = document.createElement('section');
  section.className = 'mobile-font-size-settings';
  section.setAttribute('aria-label', '文字サイズ');
  appendMobileText(section, 'span', 'mobile-font-size-label', '文字サイズ');
  const options = document.createElement('div');
  options.className = 'mobile-font-size-options';
  options.setAttribute('role', 'group');
  options.setAttribute('aria-label', '文字サイズを選択');
  [
    ['small', '小'],
    ['medium', '中'],
    ['large', '大'],
  ].forEach(([value, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mobile-font-size-option';
    button.textContent = label;
    button.setAttribute('aria-pressed', String(value === mobileFontSize));
    if (value === mobileFontSize) toggleMobileElementClass(button, 'mobile-font-size-option-current', true);
    button.addEventListener('click', () => setMobileFontSize(value));
    mobileFontSizeButtons.set(value, button);
    options.append(button);
  });
  section.append(options);
  return section;
}

function renderMobileMemoList(snapshot) {
  const section = document.createElement('section');
  section.className = 'mobile-memo-list';
  appendMobileText(section, 'h2', 'mobile-memo-heading', '旅行メモ');
  const pages = mobileMemoPages(snapshot);
  if (!pages.length) {
    appendMobileText(section, 'p', 'mobile-memo-empty', '旅行メモはまだありません。');
  } else {
    const list = document.createElement('ul');
    list.className = 'mobile-memo-pages';
    pages.forEach((page) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mobile-memo-page';
      appendMobileText(button, 'span', 'mobile-memo-page-title', page.title);
      appendMobileText(button, 'span', 'mobile-memo-page-marker', '＞');
      button.addEventListener('click', () => selectMobileMemoPage(snapshot, page.memo_page_key));
      item.append(button);
      list.append(item);
    });
    section.append(list);
  }
  if (!mobilePreview.enabled) section.append(renderMobileFontSizeSettings());
  return section;
}

function renderMobileMemoDetail(snapshot, page) {
  const section = document.createElement('section');
  section.className = 'mobile-memo-detail';
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'mobile-memo-back';
  back.textContent = '＜ 旅行メモ';
  back.addEventListener('click', () => showMobileMemoList(snapshot));
  section.append(back);
  appendMobileText(section, 'h2', 'mobile-memo-detail-title', page.title);
  if (typeof page.body === 'string' && page.body) {
    const body = document.createElement('p');
    body.className = 'mobile-memo-body';
    appendMobilePlainTextWithHttpLinks(body, page.body);
    section.append(body);
  }
  return section;
}

function renderMobileMemo(snapshot) {
  mobileFontSizeButtons.clear();
  const page = selectedMobileMemoPageKey ? mobileMemoPage(snapshot, selectedMobileMemoPageKey) : null;
  return page ? renderMobileMemoDetail(snapshot, page) : renderMobileMemoList(snapshot);
}

function mobileDocumentScrollTop() {
  const root = document.scrollingElement || document.documentElement || document.body;
  return Math.max(
    typeof root?.scrollTop === 'number' ? root.scrollTop : 0,
    typeof window.scrollY === 'number' ? window.scrollY : 0,
  );
}

function setMobileDocumentScrollTop(top) {
  const value = Math.max(0, Number(top) || 0);
  const root = document.scrollingElement || document.documentElement || document.body;
  if (root && typeof root.scrollTop === 'number') root.scrollTop = value;
  if (typeof window.scrollTo === 'function') window.scrollTo({top: value, behavior: 'auto'});
}

function mobileFormalCardSelector(tab) {
  return tab === 'info'
    ? '.mobile-info-card-formal[data-mobile-item-index]'
    : '.mobile-itinerary-card-formal[data-mobile-item-index]';
}

function mobileHeaderBottom(root = mobileItinerary) {
  const header = root?.querySelector?.('.mobile-itinerary-header');
  const bottom = header?.getBoundingClientRect?.().bottom;
  return typeof bottom === 'number' ? bottom : 0;
}

function mobileCaptureTabScroll(tab = mobileActiveTab) {
  const top = mobileDocumentScrollTop();
  if (tab === 'memo') return {top, memoPageKey: selectedMobileMemoPageKey || null};
  const cards = Array.from(mobileItineraryDays.querySelectorAll?.(mobileFormalCardSelector(tab)) || []);
  const headerBottom = mobileHeaderBottom();
  const card = cards.find((entry) => {
    const bottom = entry.getBoundingClientRect?.().bottom;
    return typeof bottom === 'number' && bottom > headerBottom;
  }) || cards[0] || null;
  const rect = card?.getBoundingClientRect?.();
  const itemIndex = Number(card?.getAttribute?.('data-mobile-item-index'));
  return {
    top,
    dayKey: selectedMobileDayKey,
    itemIndex: Number.isInteger(itemIndex) ? itemIndex : null,
    offset: rect && typeof rect.top === 'number' ? rect.top - headerBottom : 0,
  };
}

function saveMobileTabScroll(tab, state = mobileCaptureTabScroll(tab)) {
  if (tab === 'memo') {
    if (!state.memoPageKey) mobileTabScrollPositions.memoList = state;
    return;
  }
  if (state?.dayKey) mobileTabScrollPositions[tab].set(state.dayKey, state);
}

function savedMobileTabScroll(tab) {
  if (tab === 'memo') return selectedMobileMemoPageKey ? null : mobileTabScrollPositions.memoList;
  return mobileTabScrollPositions[tab].get(selectedMobileDayKey) || null;
}

function mobileMappedTabScroll(sourceTab, targetTab, sourceState) {
  if (!sourceState || !['info', 'itinerary'].includes(sourceTab)
      || !['info', 'itinerary'].includes(targetTab) || sourceState.dayKey !== selectedMobileDayKey) return null;
  return {
    top: sourceState.top,
    dayKey: selectedMobileDayKey,
    itemIndex: sourceState.itemIndex,
    offset: sourceState.offset,
  };
}

function restoreMobileTabScroll(tab, state) {
  if (!state) return;
  if (tab === 'memo') {
    if (!selectedMobileMemoPageKey) setMobileDocumentScrollTop(state.top);
    return;
  }
  if (state.dayKey !== selectedMobileDayKey) return;
  setMobileDocumentScrollTop(state.top);
  if (!Number.isInteger(state.itemIndex)) return;
  const card = mobileItineraryDays.querySelector?.(
    mobileFormalCardSelector(tab) + '[data-mobile-item-index="' + state.itemIndex + '"]',
  );
  const rect = card?.getBoundingClientRect?.();
  if (!rect || typeof rect.top !== 'number') return;
  setMobileDocumentScrollTop(mobileDocumentScrollTop() + rect.top - mobileHeaderBottom() - state.offset);
}

function resetMobileTabScrollPositions() {
  mobileTabScrollPositions.itinerary.clear();
  mobileTabScrollPositions.info.clear();
  mobileTabScrollPositions.memoList = null;
}

function renderMobileInfoDay(snapshot, day, selectedDayIndex, days) {
  const daySection = document.createElement('section');
  daySection.className = 'mobile-itinerary-day mobile-info-day';
  daySection.setAttribute('data-mobile-day-key', day.day_key);
  const heading = document.createElement('h2');
  heading.textContent = mobileItineraryDayHeading(day, selectedDayIndex, days.length);
  daySection.append(heading);

  day.items
    .filter((item) => item && typeof item === 'object' && item.placement === 'day')
    .forEach((item, index) => {
      appendMobileInfoCard(daySection, item, {itemIndex: index});
      appendMobileInfoOptions(daySection, item);
    });

  if (selectedDayIndex === days.length - 1) {
    appendMobileCandidateSection(daySection, snapshot, (candidate) => appendMobileInfoCard(daySection, candidate, {
      kind: 'candidate', showTime: false, showTransport: false,
    }));
  }
  return daySection;
}

function mobileItineraryDayHeading(day, index, count) {
  const dayNumber = Number.isInteger(day.day_number) && day.day_number > 0 ? day.day_number : index + 1;
  if (count === 1) return dayNumber + '日目（日帰り）';
  if (index === 0) return dayNumber + '日目（初日）';
  if (index === count - 1) return dayNumber + '日目（最終日）';
  return dayNumber + '日目';
}

function setSelectedMobileDay(dayKey) {
  selectedMobileDayKey = dayKey;
  mobileItineraryDayButtons.forEach((button, key) => {
    if (key === dayKey) button.setAttribute('aria-current', 'date');
    else button.removeAttribute?.('aria-current');
  });
}

function scheduleMobileMemoScrollability() {
  const apply = () => {
    const root = document.scrollingElement || document.documentElement || document.body;
    const viewport = Math.max(0, Number(root?.clientHeight) || Number(window.innerHeight) || 0);
    const contentHeight = Math.max(0, Number(root?.scrollHeight) || 0);
    const fitsViewport = mobileActiveTab === 'memo' && viewport > 0 && contentHeight <= viewport + 1;
    document.body.classList.toggle('mobile-memo-viewport-fit', fitsViewport);
  };
  if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(apply);
  else window.setTimeout(apply, 0);
}

function setMobileActiveTab(tab) {
  mobileActiveTab = tab === 'info' || tab === 'memo' ? tab : 'itinerary';
  const activeClass = 'mobile-itinerary-tab mobile-itinerary-tab-current';
  const inactiveClass = 'mobile-itinerary-tab';
  mobileItineraryTabInfo.className = mobileActiveTab === 'info' ? activeClass : inactiveClass;
  mobileItineraryTabItinerary.className = mobileActiveTab === 'itinerary' ? activeClass : inactiveClass;
  mobileItineraryTabMemo.className = mobileActiveTab === 'memo' ? activeClass : inactiveClass;
  if (mobileActiveTab === 'info') {
    mobileItinerary.setAttribute('aria-label', '情報');
  } else if (mobileActiveTab === 'memo') {
    mobileItinerary.setAttribute('aria-label', '旅行メモ');
  } else {
    mobileItinerary.setAttribute('aria-label', '旅程');
  }
  [mobileItineraryTabInfo, mobileItineraryTabItinerary, mobileItineraryTabMemo].forEach((button) => {
    if (button === (mobileActiveTab === 'info' ? mobileItineraryTabInfo
      : mobileActiveTab === 'memo' ? mobileItineraryTabMemo : mobileItineraryTabItinerary)) {
      button.setAttribute('aria-current', 'page');
    } else {
      button.removeAttribute('aria-current');
    }
  });
}

function selectMobileTab(tab, {restoreState = null, sourceAlreadySaved = false} = {}) {
  if (!currentMobileSnapshot || !['info', 'itinerary', 'memo'].includes(tab)) return;
  const sourceTab = mobileActiveTab;
  const sourceState = sourceAlreadySaved ? null : mobileCaptureTabScroll(sourceTab);
  if (!sourceAlreadySaved) saveMobileTabScroll(sourceTab, sourceState);
  setMobileActiveTab(tab);
  renderMobileItinerary(currentMobileSnapshot);
  const targetState = restoreState || savedMobileTabScroll(tab)
    || mobileMappedTabScroll(sourceTab, tab, sourceState);
  restoreMobileTabScroll(tab, targetState);
}

function appendMobileItineraryClover(parent) {
  const clover = document.createElement('img');
  clover.className = 'mobile-itinerary-clover';
  clover.src = './assets/mobile-clover.svg?pwa=staging-1923fc3';
  clover.alt = '';
  clover.setAttribute('aria-hidden', 'true');
  parent.append(clover);
}

function mobileItineraryWeekdayClass(day) {
  const value = new Date(day.date + 'T00:00:00Z');
  if (Number.isNaN(value.getTime())) return '';
  const weekday = value.getUTCDay();
  if (weekday === 6) return ' mobile-itinerary-date-button-saturday';
  if (weekday === 0) return ' mobile-itinerary-date-button-sunday';
  return '';
}

function appendMobileItineraryDaySlot(parent, day, snapshot) {
  const slot = document.createElement('div');
  slot.className = 'mobile-itinerary-date-slot';
  if (!day) {
    appendMobileItineraryClover(slot);
  } else {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mobile-itinerary-date-button' + mobileItineraryWeekdayClass(day);
    button.setAttribute('data-mobile-day-key', day.day_key);
    button.textContent = mobileItineraryDateLabel(day);
    mobileItineraryDayButtons.set(day.day_key, button);
    button.addEventListener('click', () => selectMobileItineraryDay(snapshot, day.day_key));
    slot.append(button);
  }
  parent.append(slot);
}

function appendMobileItineraryWindowSlot(parent, days, selectedDayIndex, direction, snapshot) {
  const slot = document.createElement('div');
  slot.className = 'mobile-itinerary-window-slot';
  const targetIndex = selectedDayIndex + direction * 3;
  if (targetIndex >= 0 && targetIndex < days.length) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mobile-itinerary-window-button';
    button.textContent = direction < 0 ? '≪' : '≫';
    button.setAttribute('aria-label', direction < 0 ? '3日前の表示に移動' : '3日後の表示に移動');
    button.addEventListener('click', () => selectMobileItineraryDay(snapshot, days[targetIndex].day_key));
    slot.append(button);
  }
  parent.append(slot);
}

function selectMobileItineraryDay(snapshot, dayKey) {
  saveMobileTabScroll(mobileActiveTab);
  setSelectedMobileDay(dayKey);
  mobileTabScrollPositions.itinerary.delete(dayKey);
  mobileTabScrollPositions.info.delete(dayKey);
  renderMobileItinerary(snapshot);
  // previewは選択日のDOMだけを差し替えるため、iframe外まで届き得るscrollIntoViewは不要。
  if (!mobilePreview.enabled) mobileItineraryDays.scrollIntoView?.({behavior: 'auto', block: 'start'});
}

function mobileItineraryScrollState() {
  const root = document.scrollingElement || document.documentElement || document.body;
  const top = Math.max(
    typeof root?.scrollTop === 'number' ? root.scrollTop : 0,
    typeof window.scrollY === 'number' ? window.scrollY : 0,
  );
  const viewport = typeof root?.clientHeight === 'number' && root.clientHeight > 0
    ? root.clientHeight : (window.innerHeight || 0);
  const height = typeof root?.scrollHeight === 'number' ? root.scrollHeight : viewport;
  return {top, maxTop: Math.max(0, height - viewport)};
}

function mobileSelectedItineraryDayFitsViewport() {
  const day = mobileItineraryDays.firstElementChild || mobileItineraryDays.children?.[0];
  const rect = day?.getBoundingClientRect?.();
  const viewport = window.innerHeight || document.scrollingElement?.clientHeight || 0;
  const navBottom = mobileItineraryDateNav.getBoundingClientRect?.().bottom;
  const available = viewport - (typeof navBottom === 'number'
    ? Math.max(0, Math.min(navBottom, viewport)) : 0);
  return Boolean(rect && typeof rect.height === 'number' && rect.height <= available + 1);
}

function mobileItineraryDayEdgeState() {
  const {top, maxTop} = mobileItineraryScrollState();
  const shortDay = mobileSelectedItineraryDayFitsViewport();
  return {
    shortDay,
    atTop: shortDay || top <= 1,
    atBottom: shortDay || top >= maxTop - 1,
  };
}

function mobileItineraryAdjacentDay(direction) {
  const days = mobileItineraryDaysFrom(currentMobileSnapshot);
  const index = days.findIndex((day) => day.day_key === selectedMobileDayKey);
  return days[index + direction] || null;
}

function mobileItineraryIsFirstDay() {
  const days = mobileItineraryDaysFrom(currentMobileSnapshot);
  return days.length > 0 && days[0].day_key === selectedMobileDayKey;
}

function mobileAdjacentHorizontalTab(tab, direction) {
  if (direction > 0) {
    if (tab === 'itinerary') return 'info';
    if (tab === 'memo' && !selectedMobileMemoPageKey) return 'itinerary';
  }
  if (direction < 0) {
    if (tab === 'info') return 'itinerary';
    if (tab === 'itinerary') return 'memo';
  }
  return null;
}

function mobileHorizontalTabTarget(tab, deltaX) {
  if (Math.abs(deltaX) < MOBILE_ITINERARY_DAY_SWIPE_THRESHOLD_PX) return null;
  return mobileAdjacentHorizontalTab(tab, deltaX > 0 ? 1 : -1);
}

function mobileSwipeHeader(snapshot, tab, selected) {
  const source = mobileItinerary.querySelector?.('.mobile-itinerary-header');
  const header = source?.cloneNode?.(true) || document.createElement('header');
  header.className = 'mobile-itinerary-header';
  header.setAttribute('aria-hidden', 'true');
  header.querySelectorAll?.('[id]').forEach((element) => element.removeAttribute('id'));
  header.querySelectorAll?.('.mobile-itinerary-tab').forEach((button) => {
    const isCurrent = button.textContent.trim() === (tab === 'info' ? '情報' : tab === 'memo' ? 'メモ' : '旅程');
    button.className = isCurrent
      ? 'mobile-itinerary-tab mobile-itinerary-tab-current' : 'mobile-itinerary-tab';
    if (isCurrent) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  const dateNav = header.querySelector?.('.mobile-itinerary-date-nav');
  if (dateNav && tab === 'memo') {
    dateNav.remove?.();
  } else if (dateNav && selected?.day) {
    dateNav.replaceChildren();
    const currentButtons = mobileItineraryDayButtons;
    const swipeButtons = new Map();
    mobileItineraryDayButtons = swipeButtons;
    appendMobileItineraryWindowSlot(dateNav, selected.days, selected.selectedDayIndex, -1, snapshot);
    appendMobileItineraryDaySlot(dateNav, selected.days[selected.selectedDayIndex - 1], snapshot);
    appendMobileItineraryDaySlot(dateNav, selected.day, snapshot);
    appendMobileItineraryDaySlot(dateNav, selected.days[selected.selectedDayIndex + 1], snapshot);
    appendMobileItineraryWindowSlot(dateNav, selected.days, selected.selectedDayIndex, 1, snapshot);
    swipeButtons.forEach((button, dayKey) => {
      if (dayKey === selectedMobileDayKey) button.setAttribute('aria-current', 'date');
    });
    mobileItineraryDayButtons = currentButtons;
  }
  return header;
}

function mobileSwipePane(snapshot, tab, selected, state) {
  const pane = document.createElement('section');
  pane.className = 'mobile-tab-swipe-pane';
  pane.setAttribute('aria-hidden', 'true');
  pane.append(mobileSwipeHeader(snapshot, tab, selected));
  const days = document.createElement('div');
  days.className = 'mobile-itinerary-days';
  const body = renderMobileTabBody(snapshot, tab, selected);
  if (body) days.append(body);
  pane.append(days);
  pane.scrollTop = Math.max(0, Number(state?.top) || 0);
  if (Number.isInteger(state?.itemIndex)) {
    const card = pane.querySelector?.(mobileFormalCardSelector(tab)
      + '[data-mobile-item-index="' + state.itemIndex + '"]');
    const rect = card?.getBoundingClientRect?.();
    if (rect && typeof rect.top === 'number') {
      pane.scrollTop += rect.top - mobileHeaderBottom(pane) - state.offset;
    }
  }
  return pane;
}

function beginMobileTabSwipe(gesture, targetTab) {
  if (gesture.tabSwipe || !currentMobileSnapshot || !targetTab) return;
  const sourceTab = mobileActiveTab;
  const sourceState = mobileCaptureTabScroll(sourceTab);
  saveMobileTabScroll(sourceTab, sourceState);
  const targetState = savedMobileTabScroll(targetTab)
    || mobileMappedTabScroll(sourceTab, targetTab, sourceState)
    || {top: 0, dayKey: selectedMobileDayKey};
  const selected = mobileSelectedItineraryDay(currentMobileSnapshot);
  const overlay = document.createElement('div');
  overlay.className = 'mobile-tab-swipe-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  const sourcePane = mobileSwipePane(currentMobileSnapshot, sourceTab, selected, sourceState);
  const targetPane = mobileSwipePane(currentMobileSnapshot, targetTab, selected, targetState);
  const width = window.innerWidth || mobileItinerary.getBoundingClientRect?.().width || 393;
  const targetStart = targetTab === 'info' || (sourceTab === 'memo' && targetTab === 'itinerary') ? -width : width;
  sourcePane.style.transform = 'translate3d(0, 0, 0)';
  targetPane.style.transform = 'translate3d(' + targetStart + 'px, 0, 0)';
  overlay.append(sourcePane, targetPane);
  mobileItinerary.append(overlay);
  gesture.tabSwipe = {overlay, sourcePane, targetPane, sourceTab, targetTab, sourceState, targetState, width, targetStart};
}

function updateMobileTabSwipe(gesture) {
  const swipe = gesture?.tabSwipe;
  if (!swipe) return;
  const deltaX = gesture.currentX - gesture.startX;
  const distance = swipe.targetStart < 0 ? Math.max(0, deltaX) : Math.min(0, deltaX);
  swipe.sourcePane.style.transform = 'translate3d(' + distance + 'px, 0, 0)';
  swipe.targetPane.style.transform = 'translate3d(' + (swipe.targetStart + distance) + 'px, 0, 0)';
}

function settleMobileTabSwipe(gesture, commit) {
  const swipe = gesture?.tabSwipe;
  if (!swipe) return false;
  mobileTabSwipeSettling = true;
  const sourceEnd = commit ? -swipe.targetStart : 0;
  const targetEnd = commit ? 0 : swipe.targetStart;
  [swipe.sourcePane, swipe.targetPane].forEach((pane) => {
    pane.style.transition = 'transform ' + MOBILE_TAB_SWIPE_SETTLE_MS + 'ms ease-out';
  });
  swipe.sourcePane.style.transform = 'translate3d(' + sourceEnd + 'px, 0, 0)';
  swipe.targetPane.style.transform = 'translate3d(' + targetEnd + 'px, 0, 0)';
  window.setTimeout(() => {
    swipe.overlay.remove?.();
    mobileTabSwipeSettling = false;
    if (commit) {
      selectMobileTab(swipe.targetTab, {
        restoreState: swipe.targetState,
        sourceAlreadySaved: true,
      });
    } else {
      restoreMobileTabScroll(swipe.sourceTab, swipe.sourceState);
    }
  }, MOBILE_TAB_SWIPE_SETTLE_MS);
  return true;
}

function startMobileItineraryDaySwipe(pointerId, clientX, clientY) {
  if (mobileTabSwipeSettling || mobileTripContent.hidden || mobileItinerary.hidden || !currentMobileSnapshot || !mobileCover.hidden) return false;
  const memoDetail = mobileActiveTab === 'memo'
    && selectedMobileMemoPageKey
    && mobileMemoPage(currentMobileSnapshot, selectedMobileMemoPageKey);
  if (memoDetail) {
    mobileItineraryDaySwipe = {
      pointerId, startX: clientX, startY: clientY, currentX: clientX, currentY: clientY,
      direction: null, mode: 'memo-detail',
    };
    return true;
  }
  if (mobileActiveTab === 'memo') {
    mobileItineraryDaySwipe = {
      pointerId, startX: clientX, startY: clientY, currentX: clientX, currentY: clientY,
      direction: null, mode: 'tab',
    };
    return true;
  }
  const {atTop, atBottom} = mobileItineraryDayEdgeState();
  mobileItineraryDaySwipe = {
    pointerId, startX: clientX, startY: clientY, currentX: clientX, currentY: clientY,
    direction: null, mode: 'tab-or-itinerary-day', atTop, atBottom,
  };
  return true;
}

function updateMobileItineraryDaySwipe(pointerId, clientX, clientY) {
  const gesture = mobileItineraryDaySwipe;
  if (!gesture || gesture.pointerId !== pointerId) return null;
  gesture.currentX = clientX;
  gesture.currentY = clientY;
  const deltaX = clientX - gesture.startX;
  const deltaY = clientY - gesture.startY;
  if (gesture.direction === null
      && Math.max(Math.abs(deltaX), Math.abs(deltaY)) >= MOBILE_ITINERARY_DAY_SWIPE_DIRECTION_LOCK_PX) {
    gesture.direction = Math.abs(deltaY) > Math.abs(deltaX) ? 'vertical' : 'horizontal';
  }
  return gesture;
}

function mobileItineraryDaySwipeTarget(gesture) {
  if (!gesture) return null;
  if (gesture.mode === 'memo-detail') {
    const deltaX = gesture.currentX - gesture.startX;
    return gesture.direction === 'horizontal' && deltaX >= MOBILE_ITINERARY_DAY_SWIPE_THRESHOLD_PX
      ? {kind: 'memo-list'} : null;
  }
  if (gesture.direction === 'horizontal') {
    const tab = mobileHorizontalTabTarget(mobileActiveTab, gesture.currentX - gesture.startX);
    return tab ? {kind: 'tab', tab} : null;
  }
  if (gesture.mode !== 'tab-or-itinerary-day' || gesture.direction !== 'vertical') return null;
  const deltaY = gesture.currentY - gesture.startY;
  let direction = 0;
  if (gesture.atBottom && deltaY <= -MOBILE_ITINERARY_DAY_SWIPE_THRESHOLD_PX) direction = 1;
  if (gesture.atTop && deltaY >= MOBILE_ITINERARY_DAY_SWIPE_THRESHOLD_PX) direction = -1;
  if (!direction) return null;
  if (direction < 0 && mobileItineraryIsFirstDay()) return {kind: 'cover'};
  return mobileItineraryAdjacentDay(direction);
}

function finishMobileItineraryDaySwipe(pointerId, clientX, clientY, cancelled = false) {
  const gesture = updateMobileItineraryDaySwipe(pointerId, clientX, clientY);
  if (!gesture) return false;
  const target = cancelled ? null : mobileItineraryDaySwipeTarget(gesture);
  mobileItineraryDaySwipe = null;
  if (gesture.tabSwipe) return settleMobileTabSwipe(gesture, !cancelled && target?.kind === 'tab'
    && target.tab === gesture.tabSwipe.targetTab);
  if (cancelled || !target) return false;
  if (target.kind === 'tab') {
    selectMobileTab(target.tab);
    return true;
  }
  if (target.kind === 'memo-list') {
    showMobileMemoList(currentMobileSnapshot);
    return true;
  }
  if (target.kind === 'cover') {
    showMobileCover(currentMobileSnapshot);
    return true;
  }
  selectMobileItineraryDay(currentMobileSnapshot, target.day_key);
  return true;
}

function touchForMobileItineraryDaySwipe(touches, pointerId) {
  if (!touches) return null;
  for (const touch of touches) if ('touch:' + touch.identifier === pointerId) return touch;
  return null;
}

function startMobileItineraryTouchSwipe(event) {
  if (event.touches?.length !== 1 || !event.changedTouches?.length) return;
  const touch = event.changedTouches[0];
  startMobileItineraryDaySwipe('touch:' + touch.identifier, touch.clientX, touch.clientY);
}

function moveMobileItineraryTouchSwipe(event) {
  const gesture = mobileItineraryDaySwipe;
  if (!gesture?.pointerId?.startsWith('touch:')) return;
  const touch = touchForMobileItineraryDaySwipe(event.changedTouches, gesture.pointerId);
  if (!touch) return;
  const updated = updateMobileItineraryDaySwipe(gesture.pointerId, touch.clientX, touch.clientY);
  if (updated?.direction === 'horizontal') {
    const target = mobileItineraryDaySwipeTarget(updated);
    if (updated.mode === 'memo-detail') {
      if (target) event.preventDefault();
      return;
    }
    const previewTab = mobileAdjacentHorizontalTab(mobileActiveTab,
      updated.currentX > updated.startX ? 1 : -1);
    if (previewTab) {
      beginMobileTabSwipe(updated, previewTab);
      updateMobileTabSwipe(updated);
    }
    event.preventDefault();
    return;
  }
  if (mobileItineraryDaySwipeTarget(updated)) event.preventDefault();
}

function finishMobileItineraryTouchSwipe(event, cancelled = false) {
  const gesture = mobileItineraryDaySwipe;
  if (!gesture?.pointerId?.startsWith('touch:')) return;
  const touch = touchForMobileItineraryDaySwipe(event.changedTouches, gesture.pointerId);
  finishMobileItineraryDaySwipe(gesture.pointerId, touch?.clientX ?? gesture.currentX,
    touch?.clientY ?? gesture.currentY, cancelled);
}

function resetMobilePreviewShiftLatch() {
  mobilePreviewShiftLatch = {
    held: false, consumed: false, ambiguous: false, axis: null, direction: 0, distance: 0, pendingX: 0, pendingY: 0,
  };
}

function armMobilePreviewShiftLatch(event) {
  if (event.key !== 'Shift' || event.repeat || mobilePreviewShiftLatch.held) return;
  mobilePreviewShiftLatch = {
    held: true, consumed: false, ambiguous: false, axis: null, direction: 0, distance: 0, pendingX: 0, pendingY: 0,
  };
}

function releaseMobilePreviewShiftLatch(event) {
  if (event.key === 'Shift') resetMobilePreviewShiftLatch();
}

function receiveMobilePreviewShiftLatch(event) {
  if (!mobilePreview.enabled || event.origin !== window.location.origin || event.source !== window.parent) return;
  const state = event.data?.type === MOBILE_PREVIEW_SHIFT_MESSAGE_TYPE ? event.data.state : null;
  if (state === 'down') armMobilePreviewShiftLatch({key: 'Shift', repeat: false});
  if (state === 'up' || state === 'reset') resetMobilePreviewShiftLatch();
}

function mobilePreviewWheelDelta(event, axis) {
  const delta = Number(axis === 'x' ? event.deltaX : event.deltaY);
  if (!Number.isFinite(delta)) return 0;
  if (event.deltaMode === 1) return delta * 16;
  if (event.deltaMode === 2) return delta * (window.innerHeight || 800);
  return delta;
}

function consumeMobilePreviewWheel(event) {
  if (event.cancelable) event.preventDefault();
}

function mobilePreviewShiftWheelAction(deltaX, deltaY) {
  const latch = mobilePreviewShiftLatch;
  if (!latch.held || latch.consumed || latch.ambiguous) return 0;
  if (!latch.axis) {
    latch.pendingX += deltaX;
    latch.pendingY += deltaY;
    const absX = Math.abs(latch.pendingX);
    const absY = Math.abs(latch.pendingY);
    if (Math.max(absX, absY) < MOBILE_ITINERARY_DAY_SWIPE_DIRECTION_LOCK_PX) return 0;
    if (absX >= absY * MOBILE_PREVIEW_SHIFT_AXIS_DOMINANCE_RATIO) {
      latch.axis = 'horizontal';
      latch.direction = latch.pendingX > 0 ? -1 : 1;
      latch.distance = absX;
    } else if (absY >= absX * MOBILE_PREVIEW_SHIFT_AXIS_DOMINANCE_RATIO) {
      latch.axis = 'vertical';
      latch.direction = latch.pendingY > 0 ? 1 : -1;
      latch.distance = absY;
    } else {
      latch.ambiguous = true;
      return 0;
    }
  } else {
    const delta = latch.axis === 'horizontal' ? deltaX : deltaY;
    const direction = delta > 0 ? (latch.axis === 'horizontal' ? -1 : 1)
      : (latch.axis === 'horizontal' ? 1 : -1);
    if (direction !== latch.direction) return 0;
    latch.distance += Math.abs(delta);
  }
  if (latch.distance < MOBILE_ITINERARY_DAY_SWIPE_THRESHOLD_PX) return 0;
  latch.consumed = true;
  return {axis: latch.axis, direction: latch.direction};
}

function moveMobileItineraryDayByWheel(direction) {
  if (mobileTripContent.hidden || mobileItinerary.hidden || !currentMobileSnapshot || !mobileCover.hidden || mobileActiveTab === 'memo') return;
  const days = mobileItineraryDaysFrom(currentMobileSnapshot);
  if (direction < 0 && mobileItineraryIsFirstDay()) {
    showMobileCover(currentMobileSnapshot, {preservePreviewShiftLatch: true});
    return;
  }
  if (days.length < 2) return;
  const target = mobileItineraryAdjacentDay(direction);
  if (!target) return;
  selectMobileItineraryDay(currentMobileSnapshot, target.day_key);
}

function moveMobileTabByWheel(direction) {
  if (mobileTripContent.hidden || mobileItinerary.hidden || !currentMobileSnapshot || !mobileCover.hidden) return;
  if (mobileActiveTab === 'memo' && selectedMobileMemoPageKey) return;
  const targetTab = mobileAdjacentHorizontalTab(mobileActiveTab, direction);
  if (targetTab) selectMobileTab(targetTab);
}

function installMobileItineraryDaySwipe() {
  mobileItinerary.addEventListener('touchstart', startMobileItineraryTouchSwipe, {passive: true});
  mobileItinerary.addEventListener('touchmove', moveMobileItineraryTouchSwipe, {passive: false});
  mobileItinerary.addEventListener('touchend', finishMobileItineraryTouchSwipe, {passive: true});
  mobileItinerary.addEventListener('touchcancel', (event) => finishMobileItineraryTouchSwipe(event, true), {passive: true});
}

function moveMobilePreviewByWheel(event) {
  if (!mobilePreview.enabled || !event.shiftKey) return;
  const deltaX = mobilePreviewWheelDelta(event, 'x');
  const deltaY = mobilePreviewWheelDelta(event, 'y');
  if (!deltaX && !deltaY) return;
  // threshold前、曖昧な斜め入力、消費済みburstを含め、preview専用shortcutのscrollはiframe内で止める。
  consumeMobilePreviewWheel(event);
  if (!currentMobileSnapshot) return;
  const action = mobilePreviewShiftWheelAction(deltaX, deltaY);
  if (!action) return;
  if (!mobileCover.hidden) {
    if (action.axis === 'vertical') moveMobileCoverByWheel(action.direction);
    return;
  }
  if (action.axis === 'vertical') moveMobileItineraryDayByWheel(action.direction);
  else moveMobileTabByWheel(action.direction);
}

function installMobilePreviewWheelShortcut() {
  if (!mobilePreview.enabled) return;
  document.addEventListener('wheel', moveMobilePreviewByWheel, {capture: true, passive: false});
  document.addEventListener('keydown', armMobilePreviewShiftLatch, {capture: true});
  document.addEventListener('keyup', releaseMobilePreviewShiftLatch, {capture: true});
  window.addEventListener('message', receiveMobilePreviewShiftLatch);
  window.addEventListener('blur', resetMobilePreviewShiftLatch);
  window.addEventListener('focus', resetMobilePreviewShiftLatch);
}

function mobileSelectedItineraryDay(snapshot) {
  const days = mobileItineraryDaysFrom(snapshot);
  if (!days.length) return {days, selectedDayIndex: -1, day: null};
  if (!days.some((day) => day.day_key === selectedMobileDayKey)) {
    selectedMobileDayKey = mobileInitialDayKey(days);
  }
  const selectedDayIndex = days.findIndex((day) => day.day_key === selectedMobileDayKey);
  return {days, selectedDayIndex, day: days[selectedDayIndex] || null};
}

function renderMobileItineraryDay(snapshot, day, selectedDayIndex, days) {
  const daySection = document.createElement('section');
  daySection.className = 'mobile-itinerary-day';
  daySection.setAttribute('data-mobile-day-key', day.day_key);
  const heading = document.createElement('h2');
  heading.textContent = mobileItineraryDayHeading(day, selectedDayIndex, days.length);
  daySection.append(heading);
  appendMobileText(daySection, 'p', 'mobile-itinerary-day-summary', day.summary);
  day.items
    .filter((item) => item && typeof item === 'object' && item.placement === 'day')
    .forEach((item, index) => {
      daySection.append(renderMobileItineraryCard(item, {itemIndex: index}));
      appendMobileItineraryOptions(daySection, item);
    });
  if (selectedDayIndex === days.length - 1) {
    appendMobileCandidateSection(daySection, snapshot, (candidate) => {
      daySection.append(renderMobileItineraryCard(candidate, {
        kind: 'candidate', showTime: false, reserveTimeColumn: true,
      }));
    });
  }
  return daySection;
}

function renderMobileTabBody(snapshot, tab, selected = mobileSelectedItineraryDay(snapshot)) {
  if (tab === 'memo') return renderMobileMemo(snapshot);
  if (!selected.day) return null;
  return tab === 'info'
    ? renderMobileInfoDay(snapshot, selected.day, selected.selectedDayIndex, selected.days)
    : renderMobileItineraryDay(snapshot, selected.day, selected.selectedDayIndex, selected.days);
}

function renderMobileItinerary(snapshot) {
  const isMemo = mobileActiveTab === 'memo';
  const selected = mobileSelectedItineraryDay(snapshot);
  mobileItineraryDateNav.replaceChildren();
  mobileItineraryDateNav.hidden = isMemo;
  mobileItineraryDays.replaceChildren();
  mobileItineraryDayButtons = new Map();
  if (!isMemo && !selected.day) {
    mobileItinerary.hidden = true;
    return;
  }
  if (!isMemo) {
    appendMobileItineraryWindowSlot(mobileItineraryDateNav, selected.days, selected.selectedDayIndex, -1, snapshot);
    appendMobileItineraryDaySlot(mobileItineraryDateNav, selected.days[selected.selectedDayIndex - 1], snapshot);
    appendMobileItineraryDaySlot(mobileItineraryDateNav, selected.day, snapshot);
    appendMobileItineraryDaySlot(mobileItineraryDateNav, selected.days[selected.selectedDayIndex + 1], snapshot);
    appendMobileItineraryWindowSlot(mobileItineraryDateNav, selected.days, selected.selectedDayIndex, 1, snapshot);
  }
  const body = renderMobileTabBody(snapshot, mobileActiveTab, selected);
  if (body) mobileItineraryDays.append(body);
  setSelectedMobileDay(selectedMobileDayKey);
  setMobileActiveTab(mobileActiveTab);
  mobileItinerary.hidden = false;
  scheduleMobileMemoScrollability();
}

function orderedSnapshots(snapshots) {
  const valid = snapshots.filter((snapshot) => mobileTripTitle(snapshot) && mobileDepartureDate(snapshot));
  valid.sort((left, right) => {
    const dateOrder = mobileDepartureDate(right).localeCompare(mobileDepartureDate(left));
    if (dateOrder !== 0) return dateOrder;
    // 同日の場合はtrip_keyの昇順で固定し、最後に開いた旅行には依存しない。
    return globalThis.MobileSnapshotStore.tripKey(left).localeCompare(globalThis.MobileSnapshotStore.tripKey(right));
  });
  return valid;
}

function latestSnapshot(snapshots) {
  return orderedSnapshots(snapshots)[0] || null;
}

function mobileCoverHeight() {
  const measured = mobileCover.getBoundingClientRect?.().height;
  return measured > 0 ? measured : (window.innerHeight || 852);
}

function mobileCoverThreshold() {
  return mobileCoverHeight() * MOBILE_COVER_SWIPE_THRESHOLD_RATIO;
}

function clearMobileCoverSettleTimer() {
  if (mobileCoverSettleTimer !== null) window.clearTimeout(mobileCoverSettleTimer);
  mobileCoverSettleTimer = null;
}

function setMobileCoverOffset(offset, settle = false) {
  mobileCover.style.transition = settle ? 'transform ' + MOBILE_COVER_SETTLE_MS + 'ms ease-out' : 'none';
  mobileCover.style.transform = 'translate3d(0, ' + Math.min(0, offset) + 'px, 0)';
}

function resetMobileCoverPosition() {
  clearMobileCoverSettleTimer();
  mobileCoverPointer = null;
  mobileCoverLeaving = false;
  mobileTripContent.hidden = false;
  setMobileCoverOffset(0, true);
  mobileCoverSettleTimer = window.setTimeout(() => {
    mobileCover.style.transition = '';
    mobileTripContent.hidden = true;
    mobileCoverSettleTimer = null;
  }, MOBILE_COVER_SETTLE_MS);
}

function showMobileItineraryFromCover() {
  clearMobileCoverSettleTimer();
  mobileCoverPointer = null;
  mobileCoverLeaving = true;
  // 表紙の下に既存rendererの旅程を出し、表紙だけを短く上へ抜く。
  mobileTripContent.hidden = false;
  setMobileCoverOffset(-mobileCoverHeight(), true);
  mobileCoverSettleTimer = window.setTimeout(() => {
    mobileCoverSettleTimer = null;
    hideMobileCover();
    mobileTripContent.hidden = false;
    document.body.classList.add('mobile-itinerary-active');
  }, MOBILE_COVER_SETTLE_MS);
}

function moveMobileCoverByWheel(direction) {
  if (mobileCover.hidden || mobileCoverLeaving) return;
  // previewの表紙では上方向だけが旅程へ進む操作である。
  if (direction !== 1) return;
  showMobileItineraryFromCover();
}

function startMobileCoverSwipe(event) {
  if (mobileCover.hidden || mobileCoverLeaving
      || (event.pointerType === 'mouse' && (event.button !== 0 || mobilePreview.enabled))) return;
  // 復帰アニメーション中でも次のdragは受け付け、遅延状態を持ち越さない。
  clearMobileCoverSettleTimer();
  mobileCoverPointer = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    currentY: event.clientY,
    offset: 0,
    direction: null,
  };
  mobileCover.setPointerCapture?.(event.pointerId);
  mobileTripContent.hidden = false;
  setMobileCoverOffset(0);
}

function moveMobileCoverSwipe(event) {
  const gesture = mobileCoverPointer;
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  const deltaX = event.clientX - gesture.startX;
  const deltaY = event.clientY - gesture.startY;
  if (gesture.direction === null
      && Math.max(Math.abs(deltaX), Math.abs(deltaY)) >= MOBILE_COVER_DIRECTION_LOCK_PX) {
    gesture.direction = Math.abs(deltaY) > Math.abs(deltaX) ? 'vertical' : 'horizontal';
  }
  if (gesture.direction !== 'vertical') return;
  gesture.currentY = event.clientY;
  gesture.offset = Math.min(0, deltaY);
  setMobileCoverOffset(gesture.offset);
}

function finishMobileCoverSwipe(event, cancelled = false) {
  const gesture = mobileCoverPointer;
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  // pointermoveは途中までしか届かない場合があるため、release座標で距離を確定する。
  if (gesture.direction === 'vertical') {
    gesture.currentY = event.clientY;
    gesture.offset = Math.min(0, gesture.currentY - gesture.startY);
    setMobileCoverOffset(gesture.offset);
  }
  const crossed = !cancelled && gesture.direction === 'vertical' && -gesture.offset >= mobileCoverThreshold();
  mobileCover.releasePointerCapture?.(event.pointerId);
  if (crossed) {
    showMobileItineraryFromCover();
  } else {
    resetMobileCoverPosition();
  }
}

function installMobileCoverSwipe() {
  mobileCover.addEventListener('pointerdown', startMobileCoverSwipe);
  mobileCover.addEventListener('pointermove', moveMobileCoverSwipe);
  mobileCover.addEventListener('pointerup', finishMobileCoverSwipe);
  mobileCover.addEventListener('pointercancel', (event) => finishMobileCoverSwipe(event, true));
}

function toggleMobileElementClass(element, className, enabled) {
  const names = new Set((element.className || '').split(/\s+/).filter(Boolean));
  if (enabled) names.add(className);
  else names.delete(className);
  element.className = [...names].join(' ');
}

function clearSavedTripCrossfade() {
  if (savedTripCrossfadeTimer !== null) window.clearTimeout(savedTripCrossfadeTimer);
  savedTripCrossfadeTimer = null;
  toggleMobileElementClass(mobileCover, 'mobile-cover-crossfade-out', false);
  toggleMobileElementClass(mobileCover, 'mobile-cover-crossfade-in', false);
  toggleMobileElementClass(mobileCover, 'mobile-cover-crossfade-visible', false);
  toggleMobileElementClass(savedTripList, 'mobile-saved-trip-list-crossfade-in', false);
  toggleMobileElementClass(savedTripList, 'mobile-saved-trip-list-crossfade-visible', false);
  toggleMobileElementClass(savedTripList, 'mobile-saved-trip-list-crossfade-out', false);
}

function nextMobileFrame(callback) {
  if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(callback);
  else window.setTimeout(callback, 0);
}

function showMobileCover(snapshot, {preservePreviewShiftLatch = false} = {}) {
  const title = mobileTripTitle(snapshot);
  const range = mobileDateRange(snapshot);
  if (!title || !range) throw new Error();
  const destination = mobileCoverDestinationText(snapshot);
  const savedAt = mobileSnapshotSavedAt(snapshot);
  mobileCoverTitle.textContent = title;
  mobileCoverDates.textContent = range;
  mobileCoverDestination.textContent = destination || '';
  mobileCoverDestination.hidden = !destination;
  mobileCoverSavedAt.textContent = savedAt || '';
  mobileCoverSavedAt.hidden = !savedAt;
  clearMobileCoverSettleTimer();
  clearSavedTripCrossfade();
  mobileCoverPointer = null;
  mobileItineraryDaySwipe = null;
  if (!preservePreviewShiftLatch) resetMobilePreviewShiftLatch();
  mobileCoverLeaving = false;
  mobileCover.style.transform = '';
  mobileCover.style.transition = '';
  mobileCover.hidden = false;
  mobileTripContent.hidden = true;
  savedTripList.hidden = true;
  document.body.classList.remove('mobile-itinerary-active');
  document.body.classList.remove('mobile-saved-trip-list-active');
  document.body.classList.add('mobile-cover-active');
}

function hideMobileCover() {
  clearMobileCoverSettleTimer();
  mobileCoverPointer = null;
  mobileCoverLeaving = false;
  mobileCover.style.transform = '';
  mobileCover.style.transition = '';
  mobileCover.hidden = true;
  document.body.classList.remove('mobile-cover-active');
  document.body.classList.remove('mobile-itinerary-active');
}

function crossfadeCoverToSavedTripList() {
  clearSavedTripCrossfade();
  mobileTripContent.hidden = true;
  savedTripList.hidden = false;
  document.body.classList.remove('mobile-cover-active');
  document.body.classList.remove('mobile-itinerary-active');
  document.body.classList.add('mobile-saved-trip-list-active');
  toggleMobileElementClass(savedTripList, 'mobile-saved-trip-list-crossfade-in', true);
  toggleMobileElementClass(mobileCover, 'mobile-cover-crossfade-out', true);
  nextMobileFrame(() => toggleMobileElementClass(savedTripList, 'mobile-saved-trip-list-crossfade-visible', true));
  savedTripCrossfadeTimer = window.setTimeout(() => {
    savedTripCrossfadeTimer = null;
    mobileCover.hidden = true;
    clearSavedTripCrossfade();
  }, MOBILE_SAVED_TRIP_CROSSFADE_MS);
}

function crossfadeSavedTripListToCover() {
  clearSavedTripCrossfade();
  savedTripList.hidden = false;
  mobileTripContent.hidden = true;
  document.body.classList.remove('mobile-cover-active');
  document.body.classList.remove('mobile-itinerary-active');
  document.body.classList.add('mobile-saved-trip-list-active');
  toggleMobileElementClass(mobileCover, 'mobile-cover-crossfade-in', true);
  toggleMobileElementClass(savedTripList, 'mobile-saved-trip-list-crossfade-out', true);
  nextMobileFrame(() => toggleMobileElementClass(mobileCover, 'mobile-cover-crossfade-visible', true));
  savedTripCrossfadeTimer = window.setTimeout(() => {
    savedTripCrossfadeTimer = null;
    savedTripList.hidden = true;
    clearSavedTripCrossfade();
    document.body.classList.remove('mobile-saved-trip-list-active');
    document.body.classList.add('mobile-cover-active');
  }, MOBILE_SAVED_TRIP_CROSSFADE_MS);
}

function showSnapshot(snapshot) {
  const title = mobileTripTitle(snapshot);
  const range = mobileDateRange(snapshot);
  if (!title || !range) throw new Error();
  if (currentMobileSnapshot
      && globalThis.MobileSnapshotStore.tripKey(currentMobileSnapshot) !== globalThis.MobileSnapshotStore.tripKey(snapshot)) {
    selectedMobileDayKey = null;
  }
  currentMobileSnapshot = snapshot;
  selectedMobileMemoPageKey = null;
  resetMobileTabScrollPositions();
  setMobileActiveTab('itinerary');
  homeTitle.textContent = title;
  homeDates.textContent = range;
  homeDates.hidden = false;
  homeMessage.textContent = '保存した旅のしおりを読み込みました。';
  savedTripsShow.disabled = false;
  savedTripsShow.setAttribute('aria-disabled', 'false');
  renderMobileItinerary(snapshot);
  showMobileCover(snapshot);
}

function clearCurrentMobileTrip() {
  currentMobileSnapshot = null;
  selectedMobileDayKey = null;
  selectedMobileMemoPageKey = null;
  resetMobileTabScrollPositions();
  setMobileActiveTab('itinerary');
  mobileItinerary.hidden = true;
  mobileItineraryDateNav.replaceChildren();
  mobileItineraryDays.replaceChildren();
}

installMobileCoverSwipe();
installMobileItineraryDaySwipe();
installMobilePreviewWheelShortcut();
mobileItineraryTabInfo.addEventListener('click', () => selectMobileTab('info'));
mobileItineraryTabItinerary.addEventListener('click', () => selectMobileTab('itinerary'));
mobileItineraryTabMemo.addEventListener('click', () => selectMobileTab('memo'));

function renderSavedTripList(snapshots) {
  savedTripListItems.replaceChildren();
  if (!snapshots.length) {
    savedTripListStatus.textContent = 'まだ旅行が保存されていません。';
    return;
  }
  savedTripListStatus.textContent = '';
  for (const snapshot of snapshots) {
    const row = document.createElement('div');
    row.className = 'mobile-saved-trip-list-row';
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'mobile-saved-trip-list-item';
    if (currentMobileSnapshot
        && globalThis.MobileSnapshotStore.tripKey(currentMobileSnapshot) === globalThis.MobileSnapshotStore.tripKey(snapshot)) {
      item.setAttribute('aria-current', 'page');
    }
    const title = document.createElement('span');
    title.className = 'mobile-saved-trip-list-title';
    title.textContent = mobileTripTitle(snapshot);
    const separator = document.createElement('span');
    separator.className = 'mobile-saved-trip-list-separator';
    separator.setAttribute('aria-hidden', 'true');
    separator.textContent = '｜';
    const departure = document.createElement('span');
    departure.className = 'mobile-saved-trip-list-date';
    departure.textContent = mobileDepartureDate(snapshot);
    item.append(title, separator, departure);
    item.addEventListener('click', () => {
      showSnapshot(snapshot);
      crossfadeSavedTripListToCover();
    });

    row.append(item);
    if (!mobilePreview.enabled) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'mobile-saved-trip-delete';
      remove.textContent = '…';
      remove.setAttribute('aria-label', mobileTripTitle(snapshot) + 'をこのiPhoneから削除');
      remove.addEventListener('click', (event) => { void removeSavedTrip(snapshot, event); });
      row.append(remove);
    }
    savedTripListItems.append(row);
  }
}

async function removeSavedTrip(snapshot, event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const key = globalThis.MobileSnapshotStore.tripKey(snapshot);
  if (!key || !window.confirm('「' + mobileTripTitle(snapshot) + '」をこのiPhoneから削除しますか？')) return;
  try {
    await globalThis.MobileSnapshotStore.remove(key);
    const snapshots = orderedSnapshots(await globalThis.MobileSnapshotStore.list());
    if (currentMobileSnapshot && globalThis.MobileSnapshotStore.tripKey(currentMobileSnapshot) === key) {
      clearCurrentMobileTrip();
    }
    renderSavedTripList(snapshots);
  } catch (_) {
    savedTripListStatus.textContent = '保存済みの旅行を削除できません。ブラウザのデータ保存設定を確認してください。';
  }
}

async function showSavedTrips() {
  savedTripsShow.disabled = true;
  try {
    const snapshots = mobilePreview.enabled
      ? (currentMobileSnapshot ? [currentMobileSnapshot] : [])
      : orderedSnapshots(await globalThis.MobileSnapshotStore.list());
    renderSavedTripList(snapshots);
    crossfadeCoverToSavedTripList();
  } catch (_) {
    homeMessage.textContent = '保存済みの旅行を読み込めません。ブラウザのデータ保存設定を確認してください。';
  } finally {
    savedTripsShow.disabled = false;
  }
}

function showEmptySavedTrips() {
  clearCurrentMobileTrip();
  clearSavedTripCrossfade();
  hideMobileCover();
  mobileTripContent.hidden = true;
  renderSavedTripList([]);
  savedTripList.hidden = false;
  document.body.classList.add('mobile-saved-trip-list-active');
}

function stopMobileQrScanner({hide = false} = {}) {
  const session = mobileQrScannerSession;
  mobileQrScannerSession = null;
  if (session?.frameKind === 'animation' && typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(session.frameRequest);
  } else if (session?.frameKind === 'timeout') {
    window.clearTimeout(session.frameRequest);
  }
  session?.stream?.getTracks?.().forEach((track) => track.stop?.());
  if (savedTripQrScannerVideo) savedTripQrScannerVideo.srcObject = null;
  if (hide && savedTripQrScanner) savedTripQrScanner.hidden = true;
}

function scheduleMobileQrScannerFrame(session) {
  if (mobileQrScannerSession !== session || session.handled) return;
  if (typeof window.requestAnimationFrame === 'function') {
    session.frameKind = 'animation';
    session.frameRequest = window.requestAnimationFrame(() => { void scanMobileQrScannerFrame(session); });
  } else {
    session.frameKind = 'timeout';
    session.frameRequest = window.setTimeout(() => { void scanMobileQrScannerFrame(session); }, 100);
  }
}

async function scanMobileQrScannerFrame(session) {
  if (mobileQrScannerSession !== session || session.handled) return;
  try {
    const width = Number(savedTripQrScannerVideo.videoWidth);
    const height = Number(savedTripQrScannerVideo.videoHeight);
    if (width > 0 && height > 0) {
      savedTripQrScannerCanvas.width = width;
      savedTripQrScannerCanvas.height = height;
      const context = savedTripQrScannerCanvas.getContext('2d', {willReadFrequently: true});
      if (!context) throw new Error('CANVAS_UNAVAILABLE');
      context.drawImage(savedTripQrScannerVideo, 0, 0, width, height);
      const image = context.getImageData(0, 0, width, height);
      const value = session.decoder(image.data, width, height, {inversionAttempts: 'dontInvert'})?.data;
      if (typeof value === 'string' && value) {
        session.handled = true;
        const match = TOURISTS_TRANSFER_PAYLOAD.exec(value);
        stopMobileQrScanner({hide: true});
        if (!match) {
          savedTripListStatus.textContent = '旅行受取用QRではありません。PCで「スマホに保存」を実行して表示されたQRを読み取ってください。';
          return;
        }
        await receiveTouristsTemporaryTransfer(match[1]);
        return;
      }
    }
  } catch (_) {
    if (mobileQrScannerSession === session && !session.handled) {
      stopMobileQrScanner();
      savedTripQrScannerStatus.textContent = 'QR読み取り機能を準備できません。';
      return;
    }
  }
  scheduleMobileQrScannerFrame(session);
}

async function showSavedTripReceiveScanner() {
  if (mobilePreview.enabled) return;
  stopMobileQrScanner();
  savedTripQrScanner.hidden = false;
  savedTripQrScannerStatus.textContent = '';
  const decoder = globalThis.jsQR;
  if (typeof decoder !== 'function') {
    savedTripQrScannerStatus.textContent = 'QR読み取り機能を準備できません。';
    return;
  }
  const getUserMedia = navigator.mediaDevices?.getUserMedia;
  if (typeof getUserMedia !== 'function') {
    savedTripQrScannerStatus.textContent = 'この端末ではカメラを利用できません';
    return;
  }
  const session = {decoder, stream: null, frameKind: null, frameRequest: null, handled: false};
  mobileQrScannerSession = session;
  savedTripQrScannerStatus.textContent = 'PCの「スマホに保存」で表示されたQRコードを読み取ってください。';
  try {
    const stream = await getUserMedia.call(navigator.mediaDevices, {
      video: {facingMode: {ideal: 'environment'}}, audio: false,
    });
    if (mobileQrScannerSession !== session) {
      stream.getTracks?.().forEach((track) => track.stop?.());
      return;
    }
    session.stream = stream;
    savedTripQrScannerVideo.srcObject = stream;
    await savedTripQrScannerVideo.play?.();
    scheduleMobileQrScannerFrame(session);
  } catch (error) {
    if (mobileQrScannerSession !== session) return;
    stopMobileQrScanner();
    savedTripQrScannerStatus.textContent = error?.name === 'NotAllowedError'
      ? 'カメラの利用が許可されていません。端末の設定を確認してください。'
      : 'カメラを開始できません。もう一度お試しください。';
  }
}

function closeSavedTripReceiveScanner() {
  stopMobileQrScanner({hide: true});
  savedTripQrScannerStatus.textContent = '';
}

function touristsTransferConfig(value) {
  if (!value || typeof value !== 'object'
      || typeof value.supabase_url !== 'string'
      || typeof value.publishable_key !== 'string'
      || !value.publishable_key.startsWith('sb_publishable_')) return null;
  try {
    const url = new URL(value.supabase_url);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return {url: url.origin, key: value.publishable_key};
  } catch (_) {
    return null;
  }
}

async function fetchTouristsTemporaryTransfer(token) {
  // GitHub Pagesでも同じ受取経路を使う。公開可能なURL/keyだけを静的configから読む。
  const config = touristsTransferConfig(globalThis.TouristsPublicConfig);
  if (!config) return null;
  const response = await fetch(config.url + '/rest/v1/rpc/receive_tourists_temporary_transfer', {
    method: 'POST',
    credentials: 'omit',
    cache: 'no-store',
    headers: {'apikey': config.key, 'Content-Type': 'application/json'},
    body: JSON.stringify({p_token: token}),
  });
  if (!response.ok) return null;
  const snapshot = await response.json();
  return snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot : null;
}

async function receiveTouristsTemporaryTransfer(token) {
  savedTripListStatus.textContent = '旅行を受け取っています…';
  savedTripReceiveShow.disabled = true;
  try {
    const snapshot = await fetchTouristsTemporaryTransfer(token);
    if (!snapshot || !await globalThis.MobileIncomingSnapshot?.validSnapshot(snapshot)) throw new Error('RECEIVE_FAILED');
    await globalThis.MobileSnapshotStore.save(snapshot);
    showSnapshot(snapshot);
    homeMessage.textContent = '✓ ' + mobileTripTitle(snapshot) + 'をこのiPhoneに保存しました。';
  } catch (_) {
    // RPCはexpired、invalid、nonexistentを同じNULLにする。画面側も差を表示しない。
    savedTripListStatus.textContent = '旅行を受け取れませんでした。PCで表示されたQRを10分以内にもう一度読み取ってください。';
  } finally {
    savedTripReceiveShow.disabled = false;
  }
}

async function loadMobileHome() {
  if (!globalThis.MobileSnapshotStore) throw new Error();
  const snapshot = latestSnapshot(await globalThis.MobileSnapshotStore.list());
  if (!snapshot) {
    showEmptySavedTrips();
    return;
  }
  showSnapshot(snapshot);
}

async function initializeMobileHome() {
  await restoreMobileFontSize();
  await loadMobileHome();
}

function prepareMobilePreview() {
  if (mobilePreview.enabled) homeTitle.textContent = 'TOURISTS';
  savedTripsShow.disabled = false;
  savedTripsShow.setAttribute('aria-disabled', 'false');
  savedTripReceiveShow.hidden = true;
  savedTripList.hidden = true;
  pwaDiagnosticsSection.hidden = true;
}

async function loadMobilePreview(tripId) {
  prepareMobilePreview();
  if (!tripId) {
    mobileItinerary.hidden = true;
    homeMessage.textContent = 'スマホ表示プレビューを読み込めません。保存済み旅行を確認してください。';
    return;
  }
  try {
    const response = await fetch('/api/mobile-snapshot-preview?trip_id=' + encodeURIComponent(tripId), {
      credentials: 'same-origin', cache: 'no-store',
    });
    const snapshot = response.ok ? await response.json() : null;
    if (!globalThis.MobileSnapshotStore.validSnapshot(snapshot)) throw new Error();
    showSnapshot(snapshot);
  } catch (_) {
    mobileItinerary.hidden = true;
    homeMessage.textContent = 'スマホ表示プレビューを読み込めません。ログイン状態と保存済み旅行を確認してください。';
  }
}

async function inspectWorker(worker) {
  if (!worker || typeof MessageChannel !== 'function') return null;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => {
      channel.port1.close();
      resolve(null);
    }, 500);
    channel.port1.onmessage = (event) => {
      window.clearTimeout(timeout);
      channel.port1.close();
      const data = event.data;
      resolve(data && typeof data.shellVersion === 'string' && typeof data.cacheName === 'string' ? data : null);
    };
    try {
      worker.postMessage({type: 'travel-shiori-pwa-diagnostic'}, [channel.port2]);
    } catch (_) {
      window.clearTimeout(timeout);
      channel.port1.close();
      resolve(null);
    }
  });
}

function diagnosticWorkerLabel(worker, response) {
  if (!worker) return 'なし';
  return response?.shellVersion === PWA_SHELL_VERSION && response?.cacheName === PWA_CACHE_NAME
    ? 'あり（v83）' : 'あり（v83確認不可）';
}

async function showPwaDiagnostics() {
  pwaDiagnosticsShow.disabled = true;
  try {
    const registration = 'serviceWorker' in navigator
      ? await navigator.serviceWorker.getRegistration() : null;
    const controller = navigator.serviceWorker?.controller || null;
    const active = registration?.active || null;
    const activeResponse = await inspectWorker(active);
    const controllerResponse = controller === active ? activeResponse : await inspectWorker(controller);
    const cacheNames = 'caches' in window ? await caches.keys() : [];
    const hasPwaCache = cacheNames.includes(PWA_CACHE_NAME);
    let assetLines = PWA_SHELL_ASSETS.map((asset) => '  ? ' + asset);
    if (hasPwaCache) {
      const cache = await caches.open(PWA_CACHE_NAME);
      assetLines = (await Promise.all(PWA_SHELL_ASSETS.map(async (asset) => {
        const response = await cache.match(asset, {ignoreSearch: false});
        return '  ' + (response ? '✓' : '×') + ' ' + asset;
      })));
    }
    pwaDiagnosticsResult.textContent = [
      'Service Worker controller: ' + diagnosticWorkerLabel(controller, controllerResponse),
      'active registration: ' + diagnosticWorkerLabel(active, activeResponse),
      'Cache Storage ' + PWA_CACHE_NAME + ': ' + (hasPwaCache ? 'あり' : 'なし'),
      'shell assets:',
      ...assetLines,
    ].join('\n');
  } catch (_) {
    pwaDiagnosticsResult.textContent = 'PWA診断を読み込めません。';
  } finally {
    pwaDiagnosticsResult.hidden = false;
    pwaDiagnosticsShow.disabled = false;
  }
}

async function registerMobileServiceWorker() {
  if (!window.isSecureContext || !('serviceWorker' in navigator)) return;
  // iOS standaloneでは機内モードでもnavigator.onLineがtrueになり得るため、
  // onLineを通信抑止の判定に使わない。既存registrationがあれば起動を待たずに
  // 更新確認だけを行い、失敗時も現在のcache-first shellをそのまま利用する。
  try {
    const scopeUrl = new URL('./', window.location.href).href;
    const existing = await navigator.serviceWorker.getRegistration(scopeUrl);
    if (existing?.scope === scopeUrl) {
      void existing.update().catch(() => {});
      return;
    }
    // 旧root scopeのworkerが残るLAN originでも、TOURISTS自身の狭いscopeを登録する。
    // これにより旧workerのupdateだけで止まらず、移設後のshellを受け取れる。
    await navigator.serviceWorker.register('./service-worker.js', {scope: './', updateViaCache: 'none'});
  } catch (_) {
    // 初回登録または更新確認の失敗で、通常のsnapshot表示を妨げない。
  }
}

savedTripsShow.addEventListener('click', () => { void showSavedTrips(); });

if (mobilePreview.enabled) {
  applyMobileFontSize(MOBILE_FONT_SIZE_DEFAULT);
  void loadMobilePreview(mobilePreview.tripId);
} else {
  void initializeMobileHome().catch(() => {
    homeMessage.textContent = '保存した旅のしおりを読み込めません。ブラウザのデータ保存設定を確認してください。';
  });
  savedTripReceiveShow.addEventListener('click', () => { void showSavedTripReceiveScanner(); });
  savedTripQrScannerClose.addEventListener('click', closeSavedTripReceiveScanner);
  pwaDiagnosticsShow.addEventListener('click', () => { void showPwaDiagnostics(); });
  void registerMobileServiceWorker();
}

window.addEventListener('pagehide', () => stopMobileQrScanner());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') stopMobileQrScanner();
});
window.addEventListener('resize', scheduleMobileMemoScrollability);
