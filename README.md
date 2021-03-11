# Charisi

> Charisi is rich text editor for the web, built for speed and stability.

*   7kb gzipped and minified.
*   Vanilla JavaScript, no dependencies.
*   Supports all international languages and virtual keyboards.
*   Supports all native input, gestures, shortcuts, selection, and navigation.
*   Fast, no internal document model, no virtual DOM.
*   Works with IE11+, Edge, Safari 8+, Chrome 30+, FireFox 24+, and Android/iOS equivalents.

## How is Charisi different?

Most rich-text editors for the web are _broken by design_. These editors intercept input, update an internal model, and render each change. The problem is _browsers do not send events for all input_, and reconstructing every input is incredibly complex. Editors using this approach have many input-related bugs, particularly on mobile devices with virtual keyboards. [Draft.js](https://github.com/facebook/draft-js/issues/2087), [Quill](https://github.com/quilljs/quill/issues/3036), [Trix](https://github.com/basecamp/trix/issues/689), [Slate](https://github.com/ianstormtaylor/slate/issues/2062), and [ProseMirror](https://github.com/ProseMirror/prosemirror/issues/982) all have various bugs stemming from the futile complexity of reconstructing native input.

Charisi lets the browser handle input, and normalizes DOM changes. This approach preserves native input functionality and accessibility, and has excellent performance. Charisi also provides a small API to format text, insert images, and respond to input.

## Who is Charisi for?

Charisi is intended for simple, rich text input for web applications. It is not an API for building novel or complex editors, such as IDEs or spreadsheets.

## Using Charisi

### `charisi(editorNode)`

Initialize the editor for a container element.

### `editorNode.insertImage(src[, range])`

Insert an image at the current selection, or specified range.

### `editorNode.insertEmbed(html[, range])`

Insert HTML embed (Tweets, YouTube videos, etc.) at the current selection, or specified range.

### `editorNode.insertHorizontalRule(src[, range])`

Insert a horizontal rule at the current selection, or specified range.

### `editorNode.format(formatName[, value[, ranges]])`

Apply the format to the current selected ranges, or specified ranges.

*   `bold`
*   `italic`
*   `underline`
*   `strikethrough`
*   `superscript`
*   `subscript`
*   `link`: with URL value
*   `header`: with value `H1`, `H2`, etc.
*   `blockquote`
*   `list`: with value `ordered` or `unordered`
*   `code`
*   `direction`: with value `rtl` or `ltr`

### `editorNode.removeFormat(formatName[, ranges])`

Remove the format at the current selected range, or specified ranges.

### `editorNode.getFormats()`

Returns an object of format names and their values at the current selection focus.

### `editorNode.getTextRanges()`

Returns an array of text ranges if the selection intersects the editor. A text range is an object with `commonAncestorBlock`, `range`, `start`, `end`, and `formats` properties. `start` and `end` represent the current text selection as text offsets starting from the `commonAncestorBlock`. `formats` is an array of objects with the format `name`, format `value`, `start`, and `end` text offsets.

### `editorNode.getHTML()`

Return the editor contents.

## License

Charisi is free for non-commercial use. Commercial licenses are available upon request. Email [alex@alexmingoia.com](mailto:alex@alexmingoia.com) to obtain a commercial license.
