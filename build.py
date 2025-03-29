from typing import LiteralString


import os

SRC_DIR = 'src'
DIST_DIR = 'dist'
OUTPUT_FILE: LiteralString = os.path.join(DIST_DIR, 'csfd-compare.user.js')

files_order: list[str] = [
    'config.js',
    'utils.js',
    'storage.js',
    'api.js',
    'csfd.js',
    'globals.js',
    'main.js'
]

tampermonkey_header = """// ==UserScript==
// @name         ČSFD Compare
// @version      0.6.0.3
// @namespace    csfd.cz
// @description  Show your own ratings on other users ratings list
// @author
// @license      GNU GPLv3
// @match        http*://www.csfd.cz/*
// @match        http*://www.csfd.sk/*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_listValues
// @icon         http://img.csfd.cz/assets/b1733/images/apple_touch_icon.png
// @require      https://code.jquery.com/jquery-3.7.1.min.js
// @run-at       document-start
// ==/UserScript==

"""

def main() -> None:
    if not os.path.exists(DIST_DIR):
        os.makedirs(DIST_DIR)

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as outfile:
        outfile.write(tampermonkey_header)
        outfile.write("\n\n")
        for filename in files_order:
            filepath = os.path.join(SRC_DIR, filename)
            with open(file=filepath, mode='r', encoding='utf-8') as infile:
                content = infile.read()
                outfile.write(f"// --- {filename} ---\n")
                outfile.write(content)
                outfile.write("\n\n")
    print(f"Build complete: {OUTPUT_FILE}")

if __name__ == '__main__':
    main()
