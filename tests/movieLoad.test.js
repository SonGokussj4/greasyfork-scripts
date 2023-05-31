const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

const chai = require("chai");
const expect = chai.expect;

const { Csfd } = require("../csfd-compare.js");

const fs = require("fs");
const path = require("path");

let csfd;
beforeAll(() => {
    const htmlContent = fs.readFileSync(path.resolve(__dirname, "pages/movieRated.html"), "utf8");
    csfd = new Csfd(htmlContent);
});

describe("csfd.parseMoviePage method", () => {
    // const cases = [
    //     ["/film/12345-nejaky-film/prehled/", ""],
    //     ["/film/12345-parent/321-child/prehled/", "12345-parent"],
    //     ["https://www.csfd.cs/film/12345-parent/321-child/prehled/", "12345-parent"],
    //     ["https://www.csfd.cs/film/12345-parent/prehled", ""],
    //     ["https://www.csfd.cs/film/12345-parent/", ""],
    //     ["https://www.csfd.cs/film/12345-parent", ""],
    //     ["/film/12345-parent", ""],
    // ];

    // test.each(cases)(
    //     "Url: %p --> %p",
    //     async (url, expectedResult) => {
    //         const result = await csfd.getParentNameFromUrl(url);
    //         expect(result).to.equal(expectedResult);
    //     }
    // );

    test("parseMoviePage (rated)", async () => {
        const htmlContent = fs.readFileSync(path.resolve(__dirname, "pages/movieRated.html"), "utf8");

        const result = await csfd.parseMoviePage(htmlContent);
        const expected = {
            computed: false,
            computedCount: NaN,
            computedFromText: "",
            date: "27.06.2016",
            fullUrl: "https://www.csfd.cz/film/233328-warcraft-prvni-stret/prehled/",
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

        // expect(result).to.have.property("computed");
        // expect(result).to.have.property("computedCount");
        // expect(result).to.have.property("computedFromText");
        // expect(result).to.have.property("date");
        // expect(result).to.have.property("fullUrl");
        expect(result).to.have.property("id");
        // expect(result).to.have.property("lastUpdate");
        // expect(result).to.have.property("parentId");
        // expect(result).to.have.property("parentName");
        // expect(result).to.have.property("rating");
        // expect(result).to.have.property("type");
        expect(result).to.have.property("url");
        expect(result).to.have.property("year");

        // expect(result.computed).to.equal(expected.computed);
        // expect(result.computedCount).to.equal(expected.computedCount);
        // expect(result.computedFromText).to.equal(expected.computedFromText);
        // expect(result.date).to.equal(expected.date);
        // expect(result.fullUrl).to.equal(expected.fullUrl);
        expect(result.id).to.equal(expected.id);
        // expect(result.lastUpdate).to.equal(expected.lastUpdate);
        // expect(result.parentId).to.equal(expected.parentId);
        // expect(result.parentName).to.equal(expected.parentName);
        // expect(result.rating).to.equal(expected.rating);
        // expect(result.type).to.equal(expected.type);
        expect(result.url).to.equal(expected.url);
        expect(result.year).to.equal(expected.year);


    });

});
