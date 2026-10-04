# Architecture

## Code organization

- Code should be as small as possible, ideally a single function per logic.
- Don't needlessly over-engineer the code, but also don't let it become a mess. If you find yourself writing a long function, consider if it can be broken down into smaller functions.
- There was a legacy project in `./csfd-compare.js` which was old, using jquery and not well organized. This was refactored into multiple files in `./src` folder, using modern JS and no dependencies. When you're working on a feature, have the `./csfd-compare.js` as a reference for how the old code worked, but try to implement the new code in a more modular and clean way in `./src`.
- The `csfd-compare.js` selectors are not 100% accurate, because the old code was running on older version of the CSFD page. When implementing new code, make sure to use the current selectors from the current version of the CSFD page.
- Current html structure of few CSFD pages are to be found in `./pages/*.html` files, which were saved from the current version of the CSFD page. You can use these as a reference for the current structure and selectors.
- All code should be well documented but not excessively. If a function is doing something non-trivial, it should have a comment explaining what it does and why. If it's doing something straightforward, it should be self-explanatory and not need a comment.
- All configuration should be in one place only
- Priority after the userscript is loaded it to
    1) load config
    2) initialize UI (buttons, menu, etc.) so that user won't ideally see any delay after page is load
    3) if any, show the star-ratings added to t he page (if user has any ratings saved)
    4) render anything else that is hidden from user eyes by default (e.g. function to show actor picture on hover, etc.)
