/*
 * Gallery image format links — adds small "100 % / 1280 / 800 / …" links under
 * each gallery picture so the user can open the image in any available size.
 *
 * Extracted from csfd.js; the Csfd class delegates here.
 */
import { GALLERY_IMAGE_LINKS_ENABLED_KEY, getCsfdPathAliasPattern } from './config.js';
import { getFeatureState } from './utils.js';

const GALLERY_PAGE_REGEX = new RegExp(String.raw`/(?:${getCsfdPathAliasPattern('gallery')})/`, 'i');

export function isOnGalleryPage(pathname = location.pathname || '') {
  return GALLERY_PAGE_REGEX.test(pathname);
}

export function isGalleryImageLinksEnabled() {
  return getFeatureState(GALLERY_IMAGE_LINKS_ENABLED_KEY);
}

/** Remove all injected size links and unbind processed pictures. */
export function clearGalleryImageFormatLinks() {
  document.querySelectorAll('.cc-gallery-size-links').forEach((el) => el.remove());
  document.querySelectorAll('.cc-gallery-size-host').forEach((el) => el.classList.remove('cc-gallery-size-host'));
  document.querySelectorAll('.gallery-item picture[data-cc-gallery-links-bound="true"]').forEach((el) => {
    delete el.dataset.ccGalleryLinksBound;
  });
}

/**
 * Collect the available image sizes for one `<picture>` element.
 * Reads `srcset`s, the `<img>` src and the share-photo button, dedupes by
 * width and returns label/href pairs sorted from largest to smallest.
 * @returns {{label: string, href: string}[]}
 */
export function getGalleryImageFormatLinks(pictureEl) {
  const widthLinks = [];
  const seenHrefs = new Set();

  const addWidthCandidate = (rawUrl) => {
    if (!rawUrl) return;
    const widthMatch = rawUrl.match(/[/]w(\d+)(?:h\d+)?[/]/i);
    if (!widthMatch) return;

    const absoluteUrl = new URL(rawUrl, location.origin).toString();
    if (seenHrefs.has(absoluteUrl)) return;

    seenHrefs.add(absoluteUrl);
    widthLinks.push({ width: Number.parseInt(widthMatch[1], 10), href: absoluteUrl });
  };

  pictureEl.querySelectorAll('source').forEach((sourceEl) => {
    const candidates = (sourceEl.getAttribute('srcset') || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    candidates.forEach((candidate) => addWidthCandidate(candidate.split(/\s+/, 1)[0]));
  });

  const imgEl = pictureEl.querySelector('img');
  addWidthCandidate(imgEl?.getAttribute('src'));

  const imgSrcsetCandidates = (imgEl?.getAttribute('srcset') || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  imgSrcsetCandidates.forEach((candidate) => addWidthCandidate(candidate.split(/\s+/, 1)[0]));

  addWidthCandidate(pictureEl.closest('figure')?.querySelector('a.btn-photo-share')?.getAttribute('href'));

  const uniqueByWidth = [];
  const seenWidths = new Set();

  widthLinks
    .sort((a, b) => b.width - a.width)
    .forEach((link) => {
      if (!seenWidths.has(link.width)) {
        seenWidths.add(link.width);
        uniqueByWidth.push(link);
      }
    });

  if (!uniqueByWidth.length) return [];

  return [
    { label: '100 %', href: uniqueByWidth[0].href },
    ...uniqueByWidth.map((item) => ({ label: String(item.width), href: item.href })),
  ];
}

/** Inject size links under every unprocessed gallery picture on the current page. */
export async function addGalleryImageFormatLinks() {
  if (!isOnGalleryPage()) return;

  if (!isGalleryImageLinksEnabled()) {
    return clearGalleryImageFormatLinks();
  }

  document.querySelectorAll('.gallery-item picture').forEach((pictureEl) => {
    if (pictureEl.dataset.ccGalleryLinksBound === 'true') return;

    const links = getGalleryImageFormatLinks(pictureEl);
    if (!links.length || !pictureEl.parentElement) {
      pictureEl.dataset.ccGalleryLinksBound = 'true';
      return;
    }

    const host = pictureEl.parentElement;
    host.classList.add('cc-gallery-size-host');

    const linksWrapper = document.createElement('div');
    linksWrapper.className = 'cc-gallery-size-links';

    links.forEach((linkDef) => {
      const anchor = document.createElement('a');
      anchor.className = 'cc-gallery-size-link';
      anchor.href = linkDef.href;
      anchor.textContent = linkDef.label;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      linksWrapper.appendChild(anchor);
    });

    host.appendChild(linksWrapper);
    pictureEl.dataset.ccGalleryLinksBound = 'true';
  });
}
