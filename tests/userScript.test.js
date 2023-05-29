if (typeof TextEncoder === "undefined") {
    const { TextEncoder } = require('util');
    global.TextEncoder = TextEncoder;
}

if (typeof TextDecoder === "undefined") {
    const { TextDecoder } = require('util');
    global.TextDecoder = TextDecoder;
}

const { JSDOM } = require("jsdom");
const chai = require("chai");
const expect = chai.expect;
const Csfd = require("../csfd-compare.js");

beforeAll(() => {
    const fs = require("fs");
    const path = require("path");
    const htmlContent = fs.readFileSync(path.resolve(__dirname, "mainPage.html"), "utf8");
    const csfd = new Csfd(htmlContent);
    return csfd;
});

describe("csfd.getParentNameFromUrl method", () => {

    // Load htmlContent variable from file: 'mainPage.html'
    // const fs = require("fs");
    // const path = require("path");
    // const htmlContent = fs.readFileSync(path.resolve(__dirname, "mainPage.html"), "utf8");

    const csfd = new Csfd("");

    const cases = [
        ["/film/12345-nejaky-film/prehled/", ""],
        ["/film/12345-parent/321-child/prehled/", "12345-parent"],
        ["https://www.csfd.cs/film/12345-parent/321-child/prehled/", "12345-parent"],
        ["https://www.csfd.cs/film/12345-parent/prehled", ""],
        ["https://www.csfd.cs/film/12345-parent/", ""],
        ["https://www.csfd.cs/film/12345-parent", ""],
        ["/film/12345-parent", ""],
    ];

    // test("getParentNameFromUrl function", async () => {
    //     const url = "/film/12345-nejaky-film/prehled/";
    //     const expected = "";
    //     const result = await csfd.getParentNameFromUrl(url);
    //     expect(result).to.equal(expected);
    // });

    // test("getParentNameFromUrl function", async () => {
    //     const url = "/film/12345-parent/321-child/prehled/";
    //     const expected = "12345-parent";
    //     const result = await csfd.getParentNameFromUrl(url);
    //     expect(result).to.equal(expected);
    // });

    test.each(cases)(
        "Url: %p --> %p",
        async (url, expectedResult) => {
            const result = await csfd.getParentNameFromUrl(url);
            expect(result).to.equal(expectedResult);
        }
    );
});

describe("csfd.getMovieIdFromHref method", () => {
    const csfd = new Csfd("");

    const cases = [
        ["", null],
        ["/774319-zhoubne-zlo/prehled/", 774319],
        ["/film/1058697-devadesatky/1121972-epizoda-6/", 1121972],
        ["/film/774319-zhoubne-zlo/", 774319],
        ["/film/774319-zhoubne-zlo/prehled", 774319],
        ["/film/774319-zhoubne-zlo/prehled/", 774319],
        ["1058697-devadesatky", 1058697],
        ["774319-zhoubne-zlo/", 774319],
        ["774319-zhoubne-zlo/prehled/", 774319],
        ["ssdd-zhoubne-zlo/prehled/", null],
        [null, null],
    ];

    test.each(cases)(
        "Url: %p --> %p",
        async (url, expectedResult) => {
            const result = await csfd.getMovieIdFromHref(url);
            expect(result).to.equal(expectedResult);
        }
    );
});

describe("csfd.getMovieIdParentIdFromUrl method", () => {
    const csfd = new Csfd("");

    const cases = [
        ["/film/", [NaN, NaN]],
        ["/film/697624-love-death-robots", [697624, NaN]],
        ["/film/697624-love-death-robots/800484-zakazane-ovoce/", [800484, 697624]],
        ["/uzivatel/78145-songokussj/prehled/", [NaN, NaN]],
    ];

    test.each(cases)(
        "Url: %p --> %p",
        async (url, expectedResult) => {
            const result = await csfd.getMovieIdParentIdFromUrl(url);
            expect(result).to.deep.equal(expectedResult);
        }
    );
});

describe("csfd.getFilmNameFromHref method", () => {
    const csfd = new Csfd("");

    const cases = [
        ["https://www.csfd.cz/film/1032817-naomi/1032819-don-t-believe-everything-you-think/recenze/", "/film/1032817-naomi/"],
        ["https://www.csfd.cz/film/1032817-naomi/recenze/", "/film/1032817-naomi/"],
        ["https://www.csfd.cz/film/1032817-naomi/", "/film/1032817-naomi/"],
        // ["/film/1032817-naomi/1032819-don-t-believe-everything-you-think/recenze/", "/film/1032817-naomi/"],
        // ["/film/1032817-naomi/recenze/", "/film/1032817-naomi/"],
        // ["/film/1032817-naomi/", "/film/1032817-naomi/"],
    ];

    test.each(cases)(
        "Url: %p --> %p",
        async (url, expectedResult) => {
            const result = await csfd.getFilmNameFromHref(url);
            expect(result).to.equal(expectedResult);
        }
    );
});
