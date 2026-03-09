const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

const chai = require('chai');
const expect = chai.expect;

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

let parseRatingsFromDocument;
let normalizeType;
let parseRatingRow;
let hasRecordChanged;
let evaluateShouldStopEarly;
let buildStorageRecordId;

beforeAll(async () => {
  const ratingsLoader = await import(pathToFileURL(path.resolve(__dirname, '../src/ratings-loader.js')).href);
  parseRatingsFromDocument = ratingsLoader.parseRatingsFromDocument;
  normalizeType = ratingsLoader.normalizeType;
  parseRatingRow = ratingsLoader.parseRatingRow;
  hasRecordChanged = ratingsLoader.hasRecordChanged;
  evaluateShouldStopEarly = ratingsLoader.evaluateShouldStopEarly;
  buildStorageRecordId = ratingsLoader.buildStorageRecordId;
});

describe('ratings-loader helpers', () => {
  it('normalizeType should map Czech words correctly', () => {
    expect(normalizeType('epizoda')).to.equal('episode');
    expect(normalizeType('seriál')).to.equal('serial');
    expect(normalizeType('série')).to.equal('series');
    expect(normalizeType('film')).to.equal('movie');
    expect(normalizeType('')).to.equal('movie');
  });

  it('parseRatingsFromDocument should capture series tokens', () => {
    const html = `
      <table>
        <tr>
          <td class="name">
            <h3 class="film-title-inline">
              <a class="film-title-name" href="/film/1-show/2-episode/">Show - Pilot</a>
              <span class="film-title-info">
                <span class="info">2024</span>
                <span class="info">epizoda</span>
                <span class="info">(S01E03)</span>
              </span>
            </h3>
          </td>
          <td class="star-rating-only"><span class="star-rating"><span class="stars stars-4"></span></span></td>
          <td class="date-only">03.03.2024</td>
        </tr>
      </table>
    `;
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const rows = parseRatingsFromDocument(doc, 'https://www.csfd.cz');
    expect(rows.length).to.be.greaterThan(0);
    const tokenRow = rows.find((r) => r.seriesToken && r.seriesToken.startsWith('S01'));
    expect(tokenRow).to.be.an('object');
    expect(tokenRow.seriesToken).to.match(/^S01E0[1-4]$/);
    expect(tokenRow.type).to.equal('episode');
  });

  it('parseRatingRow should include seriesToken when present', () => {
    const html = `<table><tr><td class="name"><h3 class="film-title-inline"><a class="film-title-name" href="/film/1/">Name</a><span class="film-title-info"><span class="info">2022</span><span class="info">epizoda</span><span class="info">(S02E05)</span></span></h3></td><td class="star-rating-only"><span class="star-rating"><span class="stars stars-3"></span></span></td><td class="date-only">01.01.2022</td></tr></table>`;
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const row = doc.querySelector('tr');
    const rec = parseRatingRow(row, 'https://example.org');
    expect(rec.seriesToken).to.equal('S02E05');
    expect(rec.type).to.equal('episode');
  });

  it('parseRatingRow should derive token from name when not in info', () => {
    const html = `<table><tr><td class="name"><h3 class="film-title-inline"><a class="film-title-name" href="/film/1/">Andor - Episode 5</a><span class="film-title-info"><span class="info">2022</span><span class="info">epizoda</span></span></h3></td><td class="star-rating-only"><span class="star-rating"><span class="stars stars-4"></span></span></td><td class="date-only">02.02.2022</td></tr></table>`;
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const row = doc.querySelector('tr');
    const rec = parseRatingRow(row, 'https://example.org');
    expect(rec.seriesToken).to.equal('E05');
  });

  it('parseRatingRow should derive season token from name', () => {
    const html = `<table><tr><td class="name"><h3 class="film-title-inline"><a class="film-title-name" href="/film/1/">Show - Season 2</a><span class="film-title-info"><span class="info">2023</span><span class="info">seriál</span></span></h3></td><td class="star-rating-only"><span class="star-rating"><span class="stars stars-5"></span></span></td><td class="date-only">03.03.2023</td></tr></table>`;
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const row = doc.querySelector('tr');
    const rec = parseRatingRow(row, 'https://example.org');
    expect(rec.seriesToken).to.equal('S02');
  });

  it('hasRecordChanged treats seriesToken change as a modification', () => {
    const base = {
      rating: 3,
      date: '01.01.2022',
      computed: false,
      computedCount: NaN,
      computedFromText: '',
      seriesToken: '',
    };
    const same = { ...base };
    const altered = { ...base, seriesToken: 'S01E01' };
    expect(hasRecordChanged(base, same)).to.be.false;
    expect(hasRecordChanged(base, altered)).to.be.true;
  });

  it('evaluateShouldStopEarly respects incremental flag', () => {
    const args = { page: 5, totalRatings: 10, directRatingsCount: 10, consecutiveStablePages: 1 };
    expect(evaluateShouldStopEarly({ incremental: true, ...args })).to.be.false;
    expect(evaluateShouldStopEarly({ incremental: false, ...args })).to.be.true;
  });

  it('buildStorageRecordId uses stable user and movie ids', () => {
    expect(buildStorageRecordId('78145-songokussj', 1000064)).to.equal('78145-songokussj:1000064');
  });
});
