const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

const chai = require("chai");
const expect = chai.expect;

const { Csfd } = require("../csfd-compare.js");

const fs = require("fs");
const path = require("path");

const $ = require('jquery');
global.$ = global.jQuery = $;

let csfd;
beforeAll(() => {
    const htmlContent = fs.readFileSync(path.resolve(__dirname, "pages/movieRated.html"), "utf8");
    csfd = new Csfd(htmlContent);
});

describe("csfd.parseMoviePage method", () => {
    test("parseMoviePage (movie rated)", async () => {
        const htmlContent = fs.readFileSync(path.resolve(__dirname, "pages/movieRated.html"), "utf8");
        const parser = new DOMParser();
        const content = parser.parseFromString(htmlContent, "text/html");
        const jqueryContent = $(content);

        jest.spyOn(csfd, 'getCurrentDateTime').mockImplementation(() => {
            return '31.5.2023 0:17:49';
        });

        const result = await csfd.parseMoviePage(jqueryContent);
        const expected = {
            computed: false,
            computedCount: NaN,
            computedFromText: "",
            date: "27.06.2016",
            fullUrl: "https://www.csfd.cz/film/233328-warcraft-prvni-stret/recenze/",
            id: 233328,
            lastUpdate: "31.5.2023 0:17:49",
            parentId: NaN,
            parentName: "",
            rating: 4,
            type: "movie",
            url: "233328-warcraft-prvni-stret",
            year: 2016,
            // genres: ["Drama", "Thriller"],
            // countries: ["USA"],
            // directors: ["David Fincher"],
        };

        expect(result).to.be.an("object");

        expect(result).to.have.property("computed");
        expect(result).to.have.property("computedCount");
        expect(result).to.have.property("computedFromText");
        expect(result).to.have.property("date");
        expect(result).to.have.property("fullUrl");
        expect(result).to.have.property("id");
        expect(result).to.have.property("lastUpdate");
        expect(result).to.have.property("parentId");
        expect(result).to.have.property("parentName");
        expect(result).to.have.property("rating");
        expect(result).to.have.property("type");
        expect(result).to.have.property("url");
        expect(result).to.have.property("year");

        expect(result.computed).to.equal(expected.computed);
        expect(result.computedCount).to.deep.equal(expected.computedCount);
        expect(result.computedFromText).to.equal(expected.computedFromText);
        expect(result.date).to.equal(expected.date);
        expect(result.fullUrl).to.equal(expected.fullUrl);
        expect(result.id).to.equal(expected.id);
        expect(result.lastUpdate).to.equal(expected.lastUpdate);
        expect(result.parentId).to.deep.equal(expected.parentId);
        expect(result.parentName).to.equal(expected.parentName);
        expect(result.rating).to.equal(expected.rating);
        expect(result.type).to.equal(expected.type);
        expect(result.url).to.equal(expected.url);
        expect(result.year).to.equal(expected.year);

        // Restore the original getCurrentDateTime function after the test
        csfd.getCurrentDateTime.mockRestore();
    });

    test("parseMoviePage (TV movie rated)", async () => {
        const htmlContent = fs.readFileSync(path.resolve(__dirname, "pages/tvMovieRated.html"), "utf8");
        const parser = new DOMParser();
        const content = parser.parseFromString(htmlContent, "text/html");

        jest.spyOn(csfd, 'getCurrentDateTime').mockImplementation(() => {
            return '31.5.2023 23:24:56';
        });

        const result = await csfd.parseMoviePage(content);
        const expected = {
            computed: false,
            computedCount: NaN,
            computedFromText: "",
            date: "28.12.2022",
            fullUrl: "https://www.csfd.cz/film/33317-jak-vytrhnout-velrybe-stolicku/recenze/",
            id: 33317,
            lastUpdate: "31.5.2023 23:24:56",
            parentId: NaN,
            parentName: "",
            rating: 4,
            type: "tv movie",
            url: "33317-jak-vytrhnout-velrybe-stolicku",
            year: 1977,
            // genres: ["Drama", "Thriller"],
            // countries: ["USA"],
            // directors: ["David Fincher"],
        };

        expect(result).to.be.an("object");

        expect(result).to.have.property("computed");
        expect(result).to.have.property("computedCount");
        expect(result).to.have.property("computedFromText");
        expect(result).to.have.property("date");
        expect(result).to.have.property("fullUrl");
        expect(result).to.have.property("id");
        expect(result).to.have.property("lastUpdate");
        expect(result).to.have.property("parentId");
        expect(result).to.have.property("parentName");
        expect(result).to.have.property("rating");
        expect(result).to.have.property("type");
        expect(result).to.have.property("url");
        expect(result).to.have.property("year");

        expect(result.computed).to.equal(expected.computed);
        expect(result.computedCount).to.deep.equal(expected.computedCount);
        expect(result.computedFromText).to.equal(expected.computedFromText);
        expect(result.date).to.equal(expected.date);
        expect(result.fullUrl).to.equal(expected.fullUrl);
        expect(result.id).to.equal(expected.id);
        expect(result.lastUpdate).to.equal(expected.lastUpdate);
        expect(result.parentId).to.deep.equal(expected.parentId);
        expect(result.parentName).to.equal(expected.parentName);
        expect(result.rating).to.equal(expected.rating);
        expect(result.type).to.equal(expected.type);
        expect(result.url).to.equal(expected.url);
        expect(result.year).to.equal(expected.year);

        // Restore the original getCurrentDateTime function after the test
        csfd.getCurrentDateTime.mockRestore();
    });

    test("parseMoviePage (episode rated)", async () => {
        const htmlContent = fs.readFileSync(path.resolve(__dirname, "pages/episodeRated.html"), "utf8");
        const parser = new DOMParser();
        const content = parser.parseFromString(htmlContent, "text/html");

        jest.spyOn(csfd, 'getCurrentDateTime').mockImplementation(() => {
            return '29.5.2023 1:29:40';
        });

        const result = await csfd.parseMoviePage(content);
        const expected = {
            computed: false,
            computedCount: NaN,
            computedFromText: "",
            date: "04.10.2022",
            fullUrl: "https://www.csfd.cz/film/687415-andor/953803-kassa/recenze/",
            id: 953803,
            lastUpdate: "29.5.2023 1:29:40",
            parentId: 687415,
            parentName: "687415-andor",
            rating: 4,
            type: "episode",
            // url: "/film/687415-andor/953803-kassa/",
            url: "953803-kassa",
            year: 2022,
        };

        expect(result).to.be.an("object");

        expect(result).to.have.property("computed");
        expect(result).to.have.property("computedCount");
        expect(result).to.have.property("computedFromText");
        expect(result).to.have.property("date");
        expect(result).to.have.property("fullUrl");
        expect(result).to.have.property("id");
        expect(result).to.have.property("lastUpdate");
        expect(result).to.have.property("parentId");
        expect(result).to.have.property("parentName");
        expect(result).to.have.property("rating");
        expect(result).to.have.property("type");
        expect(result).to.have.property("url");
        expect(result).to.have.property("year");

        expect(result.computed).to.equal(expected.computed);
        expect(result.computedCount).to.deep.equal(expected.computedCount);
        expect(result.computedFromText).to.equal(expected.computedFromText);
        expect(result.date).to.equal(expected.date);
        expect(result.fullUrl).to.equal(expected.fullUrl);
        expect(result.id).to.equal(expected.id);
        expect(result.lastUpdate).to.equal(expected.lastUpdate);
        expect(result.parentId).to.deep.equal(expected.parentId);
        expect(result.parentName).to.equal(expected.parentName);
        expect(result.rating).to.equal(expected.rating);
        expect(result.type).to.equal(expected.type);
        expect(result.url).to.equal(expected.url);
        expect(result.year).to.equal(expected.year);

        csfd.getCurrentDateTime.mockRestore();
    });

    test("parseMoviePage (series rated)", async () => {
        const htmlContent = fs.readFileSync(path.resolve(__dirname, "pages/seriesRated.html"), "utf8");
        const parser = new DOMParser();
        const content = parser.parseFromString(htmlContent, "text/html");

        jest.spyOn(csfd, 'getCurrentDateTime').mockImplementation(() => {
            return '29.5.2023 1:29:40';
        });

        const result = await csfd.parseMoviePage(content);
        const expected = {
            computed: false,
            computedCount: NaN,
            computedFromText: "",
            date: "13.10.2015",
            fullUrl: "https://www.csfd.cz/film/31212-minority-report/recenze/",
            id: 31212,
            lastUpdate: "29.5.2023 1:29:40",
            parentId: NaN,
            parentName: "",
            rating: 1,
            type: "series",
            // url: "/film/687415-andor/953803-kassa/",
            url: "31212-minority-report",
            year: 2015,
        };

        expect(result).to.be.an("object");

        expect(result).to.have.property("computed");
        expect(result).to.have.property("computedCount");
        expect(result).to.have.property("computedFromText");
        expect(result).to.have.property("date");
        expect(result).to.have.property("fullUrl");
        expect(result).to.have.property("id");
        expect(result).to.have.property("lastUpdate");
        expect(result).to.have.property("parentId");
        expect(result).to.have.property("parentName");
        expect(result).to.have.property("rating");
        expect(result).to.have.property("type");
        expect(result).to.have.property("url");
        expect(result).to.have.property("year");

        expect(result.computed).to.equal(expected.computed);
        expect(result.computedCount).to.deep.equal(expected.computedCount);
        expect(result.computedFromText).to.equal(expected.computedFromText);
        expect(result.date).to.equal(expected.date);
        expect(result.fullUrl).to.equal(expected.fullUrl);
        expect(result.id).to.equal(expected.id);
        expect(result.lastUpdate).to.equal(expected.lastUpdate);
        expect(result.parentId).to.deep.equal(expected.parentId);
        expect(result.parentName).to.equal(expected.parentName);
        expect(result.rating).to.equal(expected.rating);
        expect(result.type).to.equal(expected.type);
        expect(result.url).to.equal(expected.url);
        expect(result.year).to.equal(expected.year);

        csfd.getCurrentDateTime.mockRestore();
    });

    test("parseMoviePage (series computed)", async () => {
        const htmlContent = fs.readFileSync(path.resolve(__dirname, "pages/seriesComputed.html"), "utf8");
        const parser = new DOMParser();
        const content = parser.parseFromString(htmlContent, "text/html");

        jest.spyOn(csfd, 'getCurrentDateTime').mockImplementation(() => {
            return '31.5.2023 22:48:34';
        });

        const result = await csfd.parseMoviePage(content);
        const expected = {
            computed: true,
            computedCount: 1,
            computedFromText: "spočteno ze sérií: 1",
            date: "",
            fullUrl: "https://www.csfd.cz/film/687415-andor/recenze/",
            id: 687415,
            lastUpdate: "31.5.2023 22:48:34",
            parentId: NaN,
            parentName: "",
            rating: 5,
            type: "series",
            // url: "/film/687415-andor/953803-kassa/",
            url: "687415-andor",
            year: 2022,
        };

        expect(result).to.be.an("object");

        expect(result).to.have.property("computed");
        expect(result).to.have.property("computedCount");
        expect(result).to.have.property("computedFromText");
        expect(result).to.have.property("date");
        expect(result).to.have.property("fullUrl");
        expect(result).to.have.property("id");
        expect(result).to.have.property("lastUpdate");
        expect(result).to.have.property("parentId");
        expect(result).to.have.property("parentName");
        expect(result).to.have.property("rating");
        expect(result).to.have.property("type");
        expect(result).to.have.property("url");
        expect(result).to.have.property("year");

        expect(result.computed).to.equal(expected.computed);
        expect(result.computedCount).to.deep.equal(expected.computedCount);
        expect(result.computedFromText).to.equal(expected.computedFromText);
        expect(result.date).to.equal(expected.date);
        expect(result.fullUrl).to.equal(expected.fullUrl);
        expect(result.id).to.equal(expected.id);
        expect(result.lastUpdate).to.equal(expected.lastUpdate);
        expect(result.parentId).to.deep.equal(expected.parentId);
        expect(result.parentName).to.equal(expected.parentName);
        expect(result.rating).to.equal(expected.rating);
        expect(result.type).to.equal(expected.type);
        expect(result.url).to.equal(expected.url);
        expect(result.year).to.equal(expected.year);

        csfd.getCurrentDateTime.mockRestore();
    });

    test("parseMoviePage (season rated)", async () => {
        const htmlContent = fs.readFileSync(path.resolve(__dirname, "pages/seasonRated.html"), "utf8");
        const parser = new DOMParser();
        const content = parser.parseFromString(htmlContent, "text/html");

        jest.spyOn(csfd, 'getCurrentDateTime').mockImplementation(() => {
            return '31.5.2023 22:53:28';
        });

        const result = await csfd.parseMoviePage(content);
        const expected = {
            computed: false,
            computedCount: NaN,
            computedFromText: "",
            date: "24.11.2022",
            fullUrl: "https://www.csfd.cz/film/687415-andor/953802-season-1/recenze/",
            id: 953802,
            lastUpdate: "31.5.2023 22:53:28",
            parentId: 687415,
            parentName: "687415-andor",
            rating: 5,
            type: "season",
            // url: "/film/687415-andor/953803-kassa/",
            url: "953802-season-1",
            year: 2022,
        };

        expect(result).to.be.an("object");

        expect(result).to.have.property("computed");
        expect(result).to.have.property("computedCount");
        expect(result).to.have.property("computedFromText");
        expect(result).to.have.property("date");
        expect(result).to.have.property("fullUrl");
        expect(result).to.have.property("id");
        expect(result).to.have.property("lastUpdate");
        expect(result).to.have.property("parentId");
        expect(result).to.have.property("parentName");
        expect(result).to.have.property("rating");
        expect(result).to.have.property("type");
        expect(result).to.have.property("url");
        expect(result).to.have.property("year");

        expect(result.computed).to.equal(expected.computed);
        expect(result.computedCount).to.deep.equal(expected.computedCount);
        expect(result.computedFromText).to.equal(expected.computedFromText);
        expect(result.date).to.equal(expected.date);
        expect(result.fullUrl).to.equal(expected.fullUrl);
        expect(result.id).to.equal(expected.id);
        expect(result.lastUpdate).to.equal(expected.lastUpdate);
        expect(result.parentId).to.deep.equal(expected.parentId);
        expect(result.parentName).to.equal(expected.parentName);
        expect(result.rating).to.equal(expected.rating);
        expect(result.type).to.equal(expected.type);
        expect(result.url).to.equal(expected.url);
        expect(result.year).to.equal(expected.year);

        csfd.getCurrentDateTime.mockRestore();
    });

    test("parseMoviePage (season unrated)", async () => {
        const htmlContent = fs.readFileSync(path.resolve(__dirname, "pages/seasonUnrated.html"), "utf8");
        const parser = new DOMParser();
        const content = parser.parseFromString(htmlContent, "text/html");

        jest.spyOn(csfd, 'getCurrentDateTime').mockImplementation(() => {
            return '';
        });

        const result = await csfd.parseMoviePage(content);
        const expected = {
            computed: false,
            computedCount: NaN,
            computedFromText: "",
            date: "",
            fullUrl: "https://www.csfd.cz/film/70701-buffy-premozitelka-upiru/541194-serie-1/recenze/",
            id: 541194,
            lastUpdate: "",
            parentId: 70701,
            parentName: "70701-buffy-premozitelka-upiru",
            rating: NaN,
            type: "season",
            // url: "/film/687415-andor/953803-kassa/",
            url: "541194-serie-1",
            year: 1997,
        };

        expect(result).to.be.an("object");

        expect(result).to.have.property("computed");
        expect(result).to.have.property("computedCount");
        expect(result).to.have.property("computedFromText");
        expect(result).to.have.property("date");
        expect(result).to.have.property("fullUrl");
        expect(result).to.have.property("id");
        expect(result).to.have.property("lastUpdate");
        expect(result).to.have.property("parentId");
        expect(result).to.have.property("parentName");
        expect(result).to.have.property("rating");
        expect(result).to.have.property("type");
        expect(result).to.have.property("url");
        expect(result).to.have.property("year");

        expect(result.computed).to.equal(expected.computed);
        expect(result.computedCount).to.deep.equal(expected.computedCount);
        expect(result.computedFromText).to.equal(expected.computedFromText);
        expect(result.date).to.equal(expected.date);
        expect(result.fullUrl).to.equal(expected.fullUrl);
        expect(result.id).to.equal(expected.id);
        expect(result.lastUpdate).to.equal(expected.lastUpdate);
        expect(result.parentId).to.deep.equal(expected.parentId);
        expect(result.parentName).to.equal(expected.parentName);
        expect(result.rating).to.deep.equal(expected.rating);
        expect(result.type).to.equal(expected.type);
        expect(result.url).to.equal(expected.url);
        expect(result.year).to.equal(expected.year);

        csfd.getCurrentDateTime.mockRestore();
    });

});
