# Lesson screens

The target look of every lesson page, one screen per page and state. They come
from Bastian's lesson prototype ([bastian-schnitzler/lesson_prototype](https://github.com/bastian-schnitzler/lesson_prototype),
SPEC 0.82, commit `2fdcc66`), rendered from the running prototype by its
`make screens`.

Each screen is two files:

- the **PNG** shows the look;
- the **HTML** snapshot is the rendered page (DOM and inlined CSS, no scripts):
  read it for the exact structure, order and copy.

Build our pages to look like these, with our components and Tailwind tokens,
not the snapshot's CSS. The prototype's own top bar (Mother tongue, Interface
language, Autoplay, "Lesson prototype", "Lesson overview") is not ours: our
pages keep the app header and frame.

## Which issue builds what

| Folder | Lesson | Issue |
|---|---|---|
| [grammar/](grammar/) | the lesson page, the player, the exam, the results, and the grammar exercises | #146 |
| [vocabulary/](vocabulary/) | the vocabulary lesson | #147 |
| [reading/](reading/) | the reading lesson | #148 |
| [functions/](functions/) | the functions lesson | #149 |

The start, exam and results pages are shared by every kind: #146 builds them
once, and the other folders show how each kind fills them.

## When a screen and an issue disagree

The issue wins. Each issue's **Design** section maps its pages to these
screens and lists every difference, for example: no Previous button (the
lesson only goes forward), no listening exercises in vocabulary, and the
labels from the issue's label table.

## Updating

These are copies, pinned to the commit above. When the prototype's screens
change, copy the four lesson folders again from its `docs/mockups/`
(`03-vocabulary-lesson`, `04-grammar-lesson`, `05-function-lesson`,
`06-reading-lesson`), and update the commit here.
