/**
 * Copyright 2021 Alexander Charles Mingoia (alex@alexmingoia.com)
 *
 * Creative Commons Attribution-NonCommercial-NoDerivatives 4.0
 * International Public License
 *
 * https://creativecommons.org/licenses/by-nc-nd/4.0/
 */
(function() {
  window.charisi = charisi;

  // Initialize a new editor for the given container node.
  function charisi(editorNode, onChange) {
    if (!(typeof editorNode === 'object' && editorNode.nodeType === Node.ELEMENT_NODE)) {
      throw new Error('editorNode must be an HTML element.');
    }

    editorNode.setAttribute('contenteditable', 'true');
    editorNode.setAttribute('aria-textarea', 'true');

    // Legacy execCommand options.
    if (typeof document.execCommand === 'function') {
      document.execCommand('autolink', false, false);
      document.execCommand('defaultParagraphSeparator', false, 'DIV');
      document.execCommand('insertBrOnReturn', false, false);
      // Disable position/resize controls.
      document.execCommand('enableAbsolutePositionEditor', false, false);
      document.execCommand('enableObjectResizing', false, false);
      // Disable element styles inserted by browser.
      document.execCommand('useCSS', false, true);
      document.execCommand('styleWithCSS', false, false);
    }

    editorNode.insertImage = insertImage;
    editorNode.insertEmbed = insertEmbed;
    editorNode.insertHorizontalRule = insertHorizontalRule;
    editorNode.format = format;
    editorNode.removeFormat = formatRemove;
    editorNode.getFormats = getFormats;
    editorNode.getTextRanges = getTextRanges;
    editorNode.getHTML = getEditorHTML;
    editorNode.setHTML = setEditorHTML;

    editorNode.addEventListener('beforeinput', onBeforeInput);
    editorNode.addEventListener('keydown', onKeydown);
    editorNode.addEventListener('drop', onDrop);
    editorNode.addEventListener('paste', onPaste);
    editorNode.addEventListener('mouseup', onMouseup);
    editorNode.addEventListener('mousedown', onMousedown);
    editorNode.addEventListener('focus', onFocus);
    editorNode.addEventListener('blur', onBlur);

    // Sanitize initial editor HTML.
    if (!isEmptyBlock(editorNode)) {
      editorNode.setHTML(editorNode.innerHTML);
    }

    normalizeDOM(editorNode, []);
    updateEditorEmptyState(editorNode);
    insertHistoryState(editorNode);

    (new window.MutationObserver(function(mutations, o) {
      var records = mutations.concat(o.takeRecords());
      normalizeDOM(editorNode, records);
      updateEditorEmptyState(editorNode);
      insertHistoryState(editorNode);
      onChange(editorNode);
    })).observe(editorNode, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: false
    });

    return editorNode;
  }

  function onBeforeInput(e) {
    var ranges = e.getTargetRanges();
    var handled = handleInput(e.currentTarget, e.inputType, e.data, e.dataTransfer, ranges);
    if (handled !== false) {
      e.preventDefault();
    }
  }

  function onPaste(e) {
    e.preventDefault();
    e.stopPropagation();
    var targetRanges = getEditorStaticRanges(e.currentTarget);
    insertFromDataTransfer(e.clipboardData, targetRanges);
  }

  // If invalid drop target or non-plaintext, then set selection to be valid
  // and insert drop content. Otherwise, let the browser handle drop.
  function onDrop(e) {
    if (
      !isPasteable(e.target)
      || e.dataTransfer.types.length > 1
      || e.dataTransfer.types.indexOf('text/plain') === -1
    ) {
      e.preventDefault();
      e.stopPropagation();
      var block = getParentBlock(e.target);
      if (block) {
        setFocusBlockEnd(block);
        var targetRanges = getEditorStaticRanges(e.currentTarget);
        insertFromDataTransfer(e.dataTransfer, targetRanges);
      }
    }
  }

  function onKeydown(e) {
    var editorNode = e.currentTarget;
    var block;
    if (history.length === 1) {
      var sel = window.getSelection();
      if (sel.rangeCount) {
        history[0].textRanges = [
          getTextRange(staticRange(sel.getRangeAt(0)), e.currentTarget)
        ];
      }
    }
    if (e.keyCode === 90 && (e.ctrlKey || e.metaKey)) {
      // CTRL+Z and CTRL+SHIFT+Z
      e.preventDefault();
      if (e.shiftKey) {
        historyRedo(e.currentTarget);
      } else {
        historyUndo(e.currentTarget);
      }
    } else if (
      (e.keyCode === 40 || e.keyCode === 39)
      && (block = isFocusBlockEnd())
      && block.nextSibling && block.nextSibling.tagName === 'FIGURE'
    ) {
      // DOWN or RIGHT ARROW
      e.preventDefault();
      block.nextSibling.childNodes[2].focus();
      selectFigure(block.nextSibling);
    } else if (
      (e.keyCode === 38 || e.keyCode === 37)
      && (block = isFocusBlockStart())
      && block.previousSibling
      && block.previousSibling.tagName === 'FIGURE'
    ) {
      // UP or LEFT ARROW
      e.preventDefault();
      block.previousSibling.childNodes[2].focus();
      selectFigure(block.previousSibling);
    } else if (
      (e.keyCode === 8 || e.keyCode === 46)
      && (block = isFocusBlockStart())
      && block.previousSibling
      && block.previousSibling.tagName === 'FIGURE'
    ) {
      // DELETE
      e.preventDefault();
      insertEmptyParagraph(editorNode, block.previousSibling);
      editorNode.selectedFigure = null;
    } else if (editorNode.selectedFigure) {
      if (e.keyCode === 229 && (block = isFocusBlockStart())) {
        e.preventDefault();
        insertEmptyParagraph(editorNode, block.previousSibling);
        editorNode.selectedFigure = null;
      } else {
        unselectFigure(editorNode.selectedFigure);
      }
    }
  }

  function onMousedown(e) {
    var editorNode = e.currentTarget;
    var figureNode;
    if (e.target.tagName === 'IMG') {
      e.preventDefault();
      figureNode = e.target.parentNode;
    }
    if (e.target.tagName === 'FIGCAPTION') {
      e.preventDefault();
      figureNode = e.target.parentNode;
    }
    if (e.target.tagName === 'FIGURE') {
      e.preventDefault();
      figureNode = e.target;
    }
    if (figureNode) {
      setTimeout(function() {
        selectFigure(figureNode);
      }, 0);
      if (figureNode.nextSibling) {
        setFocusBlockStart(figureNode.nextSibling);
      }
    } else if (editorNode.selectedFigure) {
      unselectFigure(editorNode.selectedFigure);
    }
  }

  function onMouseup(e) {
    var editorNode = e.currentTarget;
    if (history.length === 1) {
      var sel = window.getSelection();
      if (sel.rangeCount) {
        history[0].textRanges = [
          getTextRange(staticRange(sel.getRangeAt(0)), editorNode)
        ];
      }
    }
  }

  function onFocus(e) {
    e.currentTarget.focused = true;
  }

  function onBlur(e) {
    e.currentTarget.focused = false;
  }

  function updateEditorEmptyState(editorNode) {
    editorNode.empty =
      editorNode.childNodes.length === 1
      && editorNode.firstChild.tagName === 'P'
      && isEmptyBlock(editorNode.firstChild);
  }

  function format(formatName, data, targetRanges) {
    var editorNode = this;
    var inputType = 'format' + capitalize(formatName);
    var selectionRanges = getEditorStaticRanges(editorNode);
    var editorTargetRanges = [];
    var restoreRange;
    if (formatName) {
      if (!targetRanges) {
        targetRanges = [];
        for (var i = 0, l = selectionRanges.length; i < l; i++) {
          targetRanges.push(selectionRanges[i]);
        }
      }
      for (var i = 0, l = targetRanges.length; i < l; i++) {
        if (isInEditor(editorNode, targetRanges[i].startContainer)) {
          editorTargetRanges.push(targetRanges[i]);
        }
      }
      if (selectionRanges[0] && !equalRanges(editorTargetRanges[0], selectionRanges[0])) {
        restoreRange = getTextRange(selectionRanges[0]);
      }
      handleInput(editorNode, inputType, data || null, null, editorTargetRanges);
      if (restoreRange) {
        setSelectionFromTextRange(selectionRanges[0]);
      }
      insertHistoryState(editorNode, true);
    }
  }

  function formatRemove(formatName, targetRanges) {
    var editorNode = this;
    var selectionRanges = getEditorStaticRanges(editorNode);
    var editorTargetRanges = [];
    var restoreRange;
    if (formatName) {
      if (!targetRanges) {
        targetRanges = [];
        for (var i = 0, l = selectionRanges.length; i < l; i++) {
          targetRanges.push(selectionRanges[i]);
        }
      }
      for (var i = 0, l = targetRanges.length; i < l; i++) {
        if (isInEditor(editorNode, targetRanges[i].startContainer)) {
          editorTargetRanges.push(targetRanges[i]);
        }
      }
      if (selectionRanges[0] && !equalRanges(editorTargetRanges[0], selectionRanges[0])) {
        restoreRange = getTextRange(selectionRanges[0]);
      }
      handleInput(editorNode, 'formatRemove', formatName, null, editorTargetRanges);
      if (restoreRange) {
        setSelectionFromTextRange(restoreRange);
      }
      insertHistoryState(editorNode, true);
    }
  }

  function handleInput(editorNode, inputType, data, dataTransfer, targetRanges) {
    switch (inputType) {
      case 'historyUndo':
        return historyUndo(editorNode);
      case 'historyRedo':
        return historyRedo(editorNode);
      case 'insertFromDrop':
      case 'insertFromPaste':
      case 'insertFromPasteAsQuotation':
        return insertFromDataTransfer(dataTransfer, targetRanges);
      case 'formatImage':
      case 'insertImage':
        return insertImage(data, targetRanges);
      case 'insertLink':
      case 'formatLink':
        return targetRanges.forEach(function(targetRange) {
          insertLink(data, targetRange);
        });
      case 'formatEmbed':
      case 'insertEmbed':
        return insertEmbed(data, targetRanges);
      case 'formatHorizontalRule':
      case 'insertHorizontalRule':
        return insertHorizontalRule(targetRanges);
      case 'formatHeader':
        return formatHeader(data || 'H1', targetRanges[0]);
      case 'formatBlockquote':
        return formatBlockquote(targetRanges[0]);
      case 'insertOrderedList':
        return formatList(true, targetRanges[0]);
      case 'insertUnorderedList':
      case 'formatList':
        return formatList(data === 'ordered', targetRanges[0]);
      case 'formatCodeBlock':
        return formatCode(targetRanges);
      case 'formatCode':
        if (targetRanges[0] && targetRanges[0].collapsed) {
          return formatCode(targetRanges);
        } else {
          return formatInline('code', true, targetRanges[0]);
        }
      case 'formatSetBlockTextDirection':
        return targetRanges.forEach(function(targetRange) {
          formatBlockTextDirection(data, targetRange);
        });
      case 'formatSetInlineTextDirection':
        return targetRanges.forEach(function(targetRange) {
          formatInline('direction', data, targetRange);
        });
      case 'formatDirection':
        if (targetRanges[0] && targetRanges[0].collapsed) {
          return formatBlockTextDirection(data, targetRanges[0]);
        } else {
          return formatInline('direction', data, targetRanges[0]);
        }
      case 'formatBold':
      case 'formatItalic':
      case 'formatStrikethrough':
      case 'formatUnderline':
      case 'formatSuperscript':
      case 'formatSubscript':
        var formatName = inputType.slice(6).toLowerCase(); 
        return targetRanges.forEach(function(targetRange) {
          formatInline(formatName, data, targetRange);
        });
      case 'formatRemove':
        return targetRanges.forEach(function(targetRange) {
          switch (data) {
            case 'header':
              return formatRemoveHeader(targetRange);
            case 'blockquote':
              return formatRemoveBlockquote(targetRange);
            case 'list':
              return formatRemoveList(targetRange);
            case 'code':
              if (
                (targetRange && targetRange.collapsed)
                || (
                  getParentByTagNames(targetRange.startContainer, ['PRE'])
                  && getParentByTagNames(targetRange.endContainer, ['PRE'])
                )) {
                return formatRemoveCode(targetRange);
              } else {
                return formatRemoveInline('code', targetRange);
              }
            case 'direction':
              if (targetRange && targetRange.collapsed) {
                return formatBlockTextDirection(null, targetRange);
              } else {
                return formatRemoveInline('direction', targetRange);
              }
            case 'bold':
            case 'italic':
            case 'strikethrough':
            case 'underline':
            case 'superscript':
            case 'subscript':
            case 'link':
              return formatRemoveInline(data, targetRange);
            default:
              return formatRemoveAll(targetRange);
          }
        });
      default:
        return false;
    }
  }

  // Normalize editor DOM changes. Converts <div> to <p>, etc.
  function normalizeDOM(editorNode, mutations) {
    var selection = window.getSelection();
    var emptyInlineNode = false;
    var editorNodeAdded = false;
    var breakBlockquote = false;
    var breakPre = false;
    var addedSpans = [];

    // Always maintain an editable paragraph.
    if (!editorNode.firstChild) {
      insertEmptyParagraph(editorNode);
    // If last block is embed, add empty paragraph after, otherwise embed is
    // not deletable in some browsers.
    } else if (editorNode.lastChild.getAttribute('contenteditable') === 'false') {
      insertEmptyParagraph(editorNode);
    }

    // Keep selection inside block.
    if (selection.focusNode === editorNode) {
      var focusOffset = Math.min(selection.focusOffset, editorNode.childNodes.length - 1);
      setFocusBlockStart(editorNode.childNodes[focusOffset]);
    }

    // Keep selection in correct position (Firefox bug after deleting elements).
    if (
      selection.focusNode
      && selection.focusNode.nodeType === Node.ELEMENT_NODE
      && selection.focusOffset === 1
      && isEmptyBlock(selection.focusNode)
    ) {
      setSelection(selection.focusNode, 0);
    }

    for (var i = 0, l = mutations.length; i < l; i++) {
      var mutation = mutations[i];
      var addedNode = mutation.addedNodes[0];
      var removedNode = mutation.removedNodes[0];
      if (mutation.type === 'childList') {
        if (addedNode && addedNode.tagName === 'SPAN') {
          addedSpans.push(addedNode);
        }
        if (mutation.target.tagName === 'BLOCKQUOTE') {
          var blockquote = mutation.target;
          var blockquoteLength = blockquote.childNodes.length;
          if (
            blockquoteLength > 1
            && isEmptyBlock(blockquote.childNodes[blockquoteLength - 1])
            && isEmptyBlock(blockquote.childNodes[blockquoteLength - 2])
          ) {
            breakBlockquote = blockquote;
          }
        } else if (mutation.target === editorNode) {
          if (addedNode) {
            if (addedNode.tagName === 'BR' || addedNode.tagName === 'DIV') {
              if (addedNode.getAttribute('contenteditable') !== 'false') {
                editorNodeAdded = addedNode;
              }
            } else if (addedNode.tagName === 'PRE') {
              if (addedNode.previousSibling && addedNode.previousSibling.tagName === 'PRE') {
                if (isEmptyBlock(addedNode) && isEmptyBlock(addedNode.previousSibling)) {
                  breakPre = addedNode;
                }
              }
            } else if (addedNode.nodeType === Node.TEXT_NODE) {
              editorNodeAdded = addedNode;
            }
          }
          if (removedNode && editorNode.selectedFigure === removedNode) {
            editorNode.selectedFigure = null;
          }
        } else if (
          mutation.target.childNodes.length === 0
          && mutation.target.isConnected
          && isInline(mutation.target)
        ) {
          emptyInlineNode = mutation.target;
        }
      }
    }

    // If <br>, <div>, or text node added to editor change to <p>
    if (editorNodeAdded) {
      var p = document.createElement('P');
      if (isEmptyBlock(editorNodeAdded)) {
        p.appendChild(document.createElement('BR'));
      } else if (editorNodeAdded.nodeType === Node.TEXT_NODE) {
        p.appendChild(editorNodeAdded.cloneNode());
      } else {
        while (editorNodeAdded.firstChild) {
          p.appendChild(editorNodeAdded.firstChild);
        }
      }
      editorNodeAdded.parentNode.replaceChild(p, editorNodeAdded);
      setSelection(p, 0);
    }

    // If two empty paragraphs in <blockquote>, break out of <blockquote>
    if (breakBlockquote) {
      for (var i = 2; i > 0; i--) {
        breakBlockquote.removeChild(breakBlockquote.lastChild);
      }
      var p = document.createElement('P');
      p.appendChild(document.createElement('BR'));
      if (breakBlockquote.nextSibling) {
        breakBlockquote.parentNode.insertBefore(p, breakBlockquote.nextSibling);
      } else {
        breakBlockquote.parentNode.appendChild(p);
      }
      setSelection(p, 0);
    }

    if (breakPre) {
      insertEmptyParagraph(editorNode, breakPre);
    }

    // Remove empty inline format nodes, which Firefox seems to leave around.
    if (emptyInlineNode) {
      emptyInlineNode.parentNode.removeChild(emptyInlineNode);
    }

    // Browsers sometimes wrap nodes in <span> when merging blocks, so remove
    // their styles. We don't unwrap the node because that interferes with
    // browser undo stack.
    if (addedSpans.length !== 0) {
      for (var i = addedSpans.length - 1; i >= 0; i--) {
        if (addedSpans[i].isConnected) {
          removeAllStyles(addedSpans[i]);
        }
      }
    }
  }

  function getEditorHTML() {
    var editorNode = this;
    var html = [];
    for (var i = 0, l = editorNode.childNodes.length; i < l; i++) {
      if (editorNode.childNodes[i].tagName === 'FIGURE') {
        html.push('<figure>');
        html.push(editorNode.childNodes[i].childNodes[0].outerHTML);
        html.push(editorNode.childNodes[i].childNodes[1].outerHTML);
        html.push('</figure>');
      } else {
        html.push(editorNode.childNodes[i].outerHTML);
      }
    }
    return html.join('');
  }

  function setEditorHTML(html) {
    var editorNode = this;
    while (editorNode.firstChild) {
      editorNode.removeChild(editorNode.firstChild);
    }
    setSelection(editorNode, 0);
    insertHtml(html, getEditorStaticRanges(editorNode)[0]);
  }

  var historySize = 100;
  var historyLastInserted = 0;
  var historyInterval = 5000;
  var history = [];
  var historyIndex = -1;

  function historyUndo(editorNode) {
    var historyState = history[historyIndex - 1];
    if (historyState) {
      historyIndex--;
      editorNode.innerHTML = '';
      editorNode.appendChild(historyState.html.cloneNode(true));
      if (historyState.textRanges[0]) {
        setSelectionFromTextRange(historyState.textRanges[0]);
      }
    }
  }

  function historyRedo(editorNode) {
    var historyState = history[historyIndex + 1];
    if (historyState) {
      historyIndex++;
      editorNode.innerHTML = '';
      editorNode.appendChild(historyState.html.cloneNode(true));
      if (historyState.textRanges[0]) {
        setSelectionFromTextRange(historyState.textRanges[0]);
      }
    }
  }

  function insertHistoryState(editorNode, ignoreInterval) {
    var now = Date.now();
    if (
      ignoreInterval
      || historyIndex < 1
      || (now - historyLastInserted) > historyInterval
    ) {
      history.splice(historyIndex + 1);
      historyIndex = history.length;
      var fragment = document.createDocumentFragment();
      for (var i = 0, l = editorNode.childNodes.length; i < l; i++) {
        fragment.appendChild(editorNode.childNodes[i].cloneNode(true));
      }
      if (history.length > historySize) {
        history = history.slice(1, historySize);
      }
      history.push({
        html: fragment,
        textRanges: getTextRanges.call(editorNode, editorNode)
      });
      historyLastInserted = now;
    }
  }

  function insertFromDataTransfer(dataTransfer, targetRanges) {
    var html = dataTransfer.getData('text/html');
    var text = !html && dataTransfer.getData('text/plain');
    var targetRange = deleteStaticRanges(targetRanges);
    if (html) {
      insertHtml(html, targetRange);
    } else if (text) {
      insertText(text, targetRange);
    }
  }

  function insertText(text, targetRange) {
    var textNode = document.createTextNode(text);
    insertAtRange(textNode, targetRange);
    setSelection(textNode, textNode.length);
  }

  function insertHtml(html, targetRange) {
    var focusBlock = getRootBlockForRange(targetRange) || targetRange.startContainer;
    var sanitized = sanitizeHtml(html);

    if (hasBlockChildren(sanitized)) {
      var childNodesLength = sanitized.childNodes.length;
      for (var i = childNodesLength - 1; i >= 0; i--) {
        if (isEditable(focusBlock)) {
          if (focusBlock.firstChild) {
            focusBlock.insertBefore(sanitized.childNodes[i], focusBlock.firstChild);
          } else {
            focusBlock.appendChild(sanitized.childNodes[i]);
          }
        } else if (childNodesLength === 1 && focusBlock.tagName === sanitized.childNodes[i].tagName) {
          return insertHtml(sanitized.childNodes[i].innerHTML, targetRange);
        } else if (isEmptyBlock(focusBlock) && childNodesLength === 1) {
          focusBlock.parentNode.replaceChild(sanitized.childNodes[i], focusBlock);
        } else if (focusBlock.nextSibling) {
          focusBlock.parentNode.insertBefore(sanitized.childNodes[i], focusBlock.nextSibling);
        } else {
          focusBlock.parentNode.appendChild(sanitized.childNodes[i]);
        }
      }
    } else {
      var fragment = document.createDocumentFragment();
      while (sanitized.firstChild) {
        fragment.appendChild(sanitized.firstChild);
      }
      insertAtRange(fragment, targetRange);
    }
  }

  function sanitizeHtml(html) {
    var container = document.createElement('div');
    container.innerHTML = html;
    traverseNode(container, function(node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node === container) {
          for (var i = node.childNodes.length - 1; i >= 0; i--) {
            if (node.childNodes[i].nodeType !== Node.ELEMENT_NODE) {
              node.removeChild(node.childNodes[i]);
            }
          }
        } else if (isPasteable(node)) {
          if (isBlock(node)) {
            for (var i = node.childNodes.length - 1; i >= 0; i--) {
              if (node.childNodes[i].nodeType === Node.TEXT_NODE) {
                if (validChildTags[node.tagName].indexOf('TEXT') === -1) {
                  node.removeChild(node.childNodes[i]);
                }
              } else if (validChildTags[node.tagName].indexOf(node.childNodes[i].tagName) === -1) {
                node.removeChild(node.childNodes[i]);
              }
            }
            if (node.childNodes.length === 0) {
              node.parentNode.removeChild(node);
            }
          }
          removeAllStyles(node);
          removeAllAttributes(node);
          if (node.tagName === 'FIGCAPTION') {
            node.parentNode.appendChild(createCaptionInput(node.textContent));
          }
        } else {
          node.parentNode.removeChild(node);
        }
      }
    });
    return container;
  }

  // Returns an object with active formats and their values for the current
  // selection focus.
  function getFormats() {
    var editorNode = this;
    var selection = window.getSelection();
    var formats = {};
    if (isInEditor(editorNode, selection.focusNode)) {
        var node = selection.focusNode;
        while (node !== editorNode) {
          var format = tagFormats[node.tagName];
          if (format) {
            var dir = node.getAttribute('dir');
            if (dir && !formats.direction) {
              formats.direction = dir;
            }
            if (!formats[format.name]) {
              formats[format.name] = getNodeFormatValue(format.name, node);
            }
          }
          node = node.parentNode;
        }
      if (!selection.isCollaped) {
        var textRanges = editorNode.getTextRanges();
        for (var i = 0, l = textRanges.length; i < l; i++) {
          var textRange = textRanges[i];
          for (var formatName in textRange.formats) {
            var rangeFormats = textRange.formats[formatName];
            for (var j = 0, m = rangeFormats.length; j < m; j++) {
              var format = rangeFormats[j];
              if (
                !formats[formatName]
                && format.start === textRange.start
                && textRange.end === format.end
              ) {
                formats[formatName] = format.value;
              }
            }
          }
        }
      }
    }
    return formats;
  }

  // Returns an array of text ranges for the current selection.
  function getTextRanges(commonAncestorBlock) {
    var editorNode = this;
    var selection = window.getSelection();
    var textRanges = [];
    if (isInEditor(editorNode, selection.focusNode)) {
      for (var i = 0, l = selection.rangeCount; i < l; i++) {
        textRanges.push(
          getTextRange(selection.getRangeAt(i), commonAncestorBlock)
        );
      }
    }
    return textRanges;
  }

  function formatInline(formatName, value, targetRange) {
    if (targetRange && !targetRange.collapsed) {
      var textRange = getTextRange(targetRange);
      textRange.formats[formatName].push({
        name: formatName,
        value: value,
        start: textRange.start,
        end: textRange.end
      });
      renderTextRangeFormats(mergeTextRangeFormats(textRange));
    }
  }

  function getTextRange(range, commonAncestorBlock) {
    if (!commonAncestorBlock) {
      commonAncestorBlock = getParentBlock(range.commonAncestorContainer);
    }
    var formats = {};
    for (var name in inlineFormatTags) {
      formats[name] = [];
    }
    return reduceNode(commonAncestorBlock, getTextRangeForNode, {
      commonAncestorBlock: commonAncestorBlock,
      range: range,
      block: 0,
      start: 0,
      end: 0,
      offset: 0,
      formats: formats
    });
  }

  function getTextRangeForNode(textRange, node, index) {
    var range = textRange.range;
    var format =
      isInline(node)
      && tagFormats[node.tagName]
      && tagFormats[node.tagName].name;
    if (
      isRangeBoundary(node, index, range.startContainer, range.startOffset)
    ) {
      if (node.nodeType === Node.TEXT_NODE) {
        textRange.start = textRange.offset + range.startOffset;
      } else {
        textRange.start = textRange.offset;
      }
      var block = getRootBlock(range.startContainer);
      var editorNode = block.parentNode;
      for (var i = 0, l = editorNode.childNodes.length; i < l; i++) {
        if (editorNode.childNodes[i] === block) {
          textRange.block = i;
          break;
        }
      }
    }
    if (isRangeBoundary(node, index, range.endContainer, range.endOffset)) {
      if (node.nodeType === Node.TEXT_NODE) {
        textRange.end = textRange.offset + range.endOffset;
      } else {
        textRange.end = textRange.offset;
      }
    }
    if (node.nodeType === Node.TEXT_NODE) {
      textRange.offset += node.nodeValue.length;
    } else if (textRange.formats[format]) {
      textRange.formats[format].push({
        name: format,
        value: getNodeFormatValue(format, node),
        start: textRange.offset,
        end: textRange.offset + node.textContent.length
      });
    }
    return textRange;
  }

  function getNodeFormatValue(formatName, node) {
    switch (formatName) {
      case 'header':
        return node.tagName.toLowerCase();
      case 'list':
        return node.tagName === 'OL' ? 'ordered' : 'unordered';
      case 'link':
        return node.getAttribute('href');
      case 'image':
        return node.childNodes[0].getAttribute('src');
      case 'direction':
        return node.getAttribute('dir') || 'auto';
      default:
        return true;
    }
  }

  function setNodeFormatValue(formatName, value, node) {
    switch (formatName) {
      case 'link':
        return node.setAttribute('href', value);
      case 'image':
        return node.childNodes[0].setAttribute('src', value);
      case 'direction':
        if (!value || value === 'null') {
          return node.removeAttribute('dir');
        }
        return node.setAttribute('dir', value);
      default:
    }
  }

  function mergeTextRangeFormats(textRange) {
    var formats = textRange.formats;
    for (var name in formats) {
      var prev;
      var merged = [];
      formats[name].sort(sortFormatRange);
      for (var i = 0, l = formats[name].length; i < l; i++) {
        var format = formats[name][i];
        if (!merged.length) {
          prev = format;
          merged.push(format);
        } else if (format.start <= prev.end && prev.start <= format.end) {
          prev.end = Math.max(prev.end, format.end);
          prev.start = Math.min(prev.start, format.start);
          prev.value = format.value;
        } else {
          prev = format;
          merged.push(format);
        }
      }
      formats[name] = merged;
    }
    return textRange;
  }

  function sortFormatRange(a, b) {
    if (a.start > b.start) return 1;
    if (a.start < b.start) return -1;
    return 0;
  }

  function renderTextRangeFormats(textRange) {
    setSelectionFromTextRange(reduceNode(
      textRange.commonAncestorBlock,
      renderTextRangeFormatsForNode,
      assign(textRange, { offset: 0 })
    ));
  }

  function renderTextRangeFormatsForNode(textRange, node) {
    var formats = textRange.formats;
    var offset = textRange.offset;
    if (isBlock(node) && !isEmptyBlock(node) && !hasBlockChildren(node)) {
      var text = node.textContent;
      var endOffset = offset + text.length;
      node.innerHTML = '';
      node.appendChild(document.createTextNode(text));
      for (var name in textRange.formats) {
        var formats = textRange.formats[name];
        for (var i = 0, l = formats.length; i < l; i++) {
          var format = formats[i];
          if (format.start <= endOffset && offset <= format.end) {
            reduceNode(node, renderFormatForNode(format), offset);
          }
        }
      }
    } else if (node.nodeType === Node.TEXT_NODE) {
      textRange.offset = offset + node.nodeValue.length;
    }
    return textRange;
  }

  function renderFormatForNode(format) {
    return function (offset, node) {
      if (node.nodeType === Node.TEXT_NODE) {
        var text = node.nodeValue;
        var endOffset = offset + node.nodeValue.length;
        if (format.start < endOffset && offset < format.end) {
          var inline = document.createElement(inlineFormatTags[format.name].tag);
          setNodeFormatValue(format.name, format.value, inline);
          var textNode;
          if (format.start > offset) {
            textNode = document.createTextNode(
              text.slice(0, format.start - offset)
            );
            node.parentNode.insertBefore(textNode, node);
          }
          textNode = document.createTextNode(
            text.slice(
              Math.max(0, format.start - offset),
              Math.min(format.end, endOffset) - offset
            )
          );
          inline.appendChild(textNode);
          node.parentNode.insertBefore(inline, node);
          if (format.end < endOffset) {
            textNode = document.createTextNode(
              text.slice(format.end - offset)
            );
            node.parentNode.insertBefore(textNode, node);
          }
          node.parentNode.removeChild(node);
        }
        return endOffset;
      }
      return offset;
    }
  }

  function selectFigure(figureNode) {
    var editorNode = figureNode.parentNode;
    if (editorNode.selectedFigure !== figureNode) {
      if (editorNode.selectedFigure) {
        toggleClass(editorNode.selectedFigure, 'selected');
      }
      editorNode.selectedFigure = figureNode;
      toggleClass(figureNode, 'selected');
    }
  }

  function unselectFigure(figureNode) {
    var editorNode = figureNode.parentNode;
    if (editorNode.selectedFigure === figureNode) {
      editorNode.selectedFigure = null;
      toggleClass(figureNode, 'selected');
    }
  }

  function captionInputChange(e) {
    var textarea = e.currentTarget;
    var figcaption = textarea.previousSibling;
    var img = textarea.parentNode.firstChild;
    figcaption.textContent = textarea.value;
    img.setAttribute('alt', textarea.value);
  }

  function captionInputKeyup(e) {
    if (e.keyCode === 229) {
      var textarea = e.currentTarget;
      var figure = textarea.parentNode;
      var img = figure.firstChild;
      var figcaption = textarea.previousSibling;
      var hasNewline = textarea.value.match(/[\n\r]/);
      if (hasNewline) {
        textarea.value = textarea.value.replace(/[\n\r]/g, '');
        figcaption.textContent = textarea.value;
        img.setAttribute('alt', textarea.value);
        setFocusBlockStart(figure.nextSibling);
      }
    }
  }
  
  function captionInputKeydown(e) {
    var textarea = e.currentTarget;
    var figcaption = textarea.previousSibling;
    var figure = textarea.parentNode;
    var editorNode = figure.parentNode;
    if (e.keyCode === 13) {
      // ENTER
      e.preventDefault();
      textarea.blur();
      editorNode.focus();
      setFocusBlockStart(figure.nextSibling);
    } else if (e.keyCode === 9 || e.keyCode === 40) {
      // DOWN ARROW or TAB
      if (figure.nextSibling) {
        e.preventDefault();
        textarea.blur();
        editorNode.focus();
        setFocusBlockStart(figure.nextSibling);
      }
    } else if (e.keyCode === 38) {
      // UP ARROW
      if (figure.previousSibling) {
        e.preventDefault();
        textarea.blur();
        editorNode.focus();
        setFocusBlockEnd(figure.previousSibling);
      }
    }
  }

  function captionInputFocus(e) {
    selectFigure(e.currentTarget.parentNode);
  }

  function captionInputBlur(e) {
    unselectFigure(e.currentTarget.parentNode);
  }

  function insertImage(src, targetRanges) {
    if (!targetRanges) return format('image', src);
    var targetRange = targetRanges[0];
    if (targetRange && src) {
      if (!targetRange.collapsed) {
        targetRange = deleteStaticRanges(targetRanges);
      }
      var block = getRootBlockForRange(targetRange);
      var nextBlock = block.nextSibling;
      var editorNode = block.parentNode;
      var figure = document.createElement('FIGURE');
      var img = document.createElement('IMG');
      var figcaption = document.createElement('FIGCAPTION');
      var textarea = createCaptionInput();
      figure.setAttribute('contenteditable', 'false');
      img.setAttribute('src', src);
      figure.appendChild(img);
      figure.appendChild(figcaption);
      figure.appendChild(textarea);
      if (!nextBlock) {
        nextBlock = insertEmptyParagraph(editorNode);
      }
      if (block.tagName === 'P' && isEmptyBlock(block)) {
        editorNode.replaceChild(figure, block);
      } else {
        editorNode.insertBefore(figure, nextBlock);
      }
      setFocusBlockStart(nextBlock);
      nextBlock.scrollIntoView(false);
    }
  }

  function createCaptionInput(initValue) {
    var textarea = document.createElement('TEXTAREA');
    textarea.value = initValue || '';
    textarea.setAttribute('placeholder', 'Add a caption...');
    textarea.setAttribute('rows', '1');
    textarea.addEventListener('change', captionInputChange);
    textarea.addEventListener('keydown', captionInputKeydown);
    textarea.addEventListener('keyup', captionInputKeyup);
    textarea.addEventListener('focus', captionInputFocus);
    textarea.addEventListener('blur', captionInputBlur);
    return textarea;
  }

  // Insert non-editable embedded HTML, such as a YouTube video or Tweet.
  function insertEmbed(html, targetRanges) {
    if (!targetRanges) return format('embed', html);
    var targetRange = targetRanges[0];
    if (targetRange && html) {
      if (!targetRange.collapsed) {
        targetRange = deleteStaticRanges(targetRanges);
      }
      var block = getRootBlock(targetRange.startContainer);
      var editorNode = block.parentNode;
      var container = document.createElement('div');
      var nextBlock = block.nextSibling;
      container.setAttribute('contenteditable', 'false');
      container.className = 'embed';
      container.innerHTML = html;
      if (!nextBlock) {
        nextBlock = insertEmptyParagraph(editorNode);
      }
      if (block.tagName === 'P' && isEmptyBlock(block)) {
        editorNode.replaceChild(container, block);
      } else {
        editorNode.insertBefore(container, nextBlock);
      }
      setSelection(nextBlock, 0);
      nextBlock.scrollIntoView(false);
    }
  }

  function insertHorizontalRule(targetRanges) {
    if (!targetRanges) return format('horizontalRule');
    var targetRange = targetRanges[0];
    if (targetRange) {
      if (!targetRange.collapsed) {
        targetRange = deleteStaticRanges(targetRanges);
      }
      var block = getParentBlock(targetRange.startContainer);
      var editorNode = block.parentNode;
      var hr = document.createElement('HR');
      var nextBlock = block.nextSibling;
      if (!nextBlock) {
        nextBlock = insertEmptyParagraph(editorNode);
      }
      if (block.tagName === 'P' && isEmptyBlock(block)) {
        editorNode.replaceChild(hr, block);
      } else {
        editorNode.insertBefore(hr, nextBlock);
      }
      setSelection(nextBlock, 0);
      nextBlock.scrollIntoView(false);
    }
  }

  function insertLink(href, targetRange) {
    if (href) {
      if (targetRange.collapsed) {
        var a = document.createElement('A');
        var block = getParentBlock(targetRange.startContainer);
        a.setAttribute('href', href);
        a.appendChild(document.createTextNode(href));
        insertAtRange(a, targetRange);
      } else {
        formatInline('link', href, targetRange);
      }
    }
  }

  function formatCode(targetRanges) {
    var targetRange = targetRanges[0];
    if (targetRange) {
      if (!targetRange.collapsed) {
        targetRange = deleteStaticRanges(targetRanges);
      }
      var textRange = formatRemoveAll(targetRange);
      var block = textRange.commonAncestorBlock;
      var pre = getParentByTagNames(block, ['PRE']);
      if (!pre) {
        pre = document.createElement('PRE');
        textRange.commonAncestorBlock = pre;
        var preText = block.textContent;
        if (preText === '') {
          pre.appendChild(document.createElement('BR'));
        } else {
          pre.appendChild(document.createTextNode(preText));
        }
        block.parentNode.replaceChild(pre, block);
        setSelectionFromTextRange(textRange);
      }
    }
  }

  function formatRemoveCode(targetRange) {
    var block = getParentBlock(targetRange.startContainer);
    var pre = getParentByTagNames(block, ['PRE']);
    if (pre) {
      var p = document.createElement('P');
      if (targetRange.collapsed) {
        while (pre.firstChild) {
          p.appendChild(pre.firstChild);
        }
        pre.parentNode.replaceChild(p, pre);
      } else {
        var textRange = getTextRange(targetRange);
        var textContent = pre.textContent;
        p.appendChild(
          document.createTextNode(
            textContent.slice(textRange.start, textRange.end)
          )
        );
        if (textRange.start > 0 && textRange.end < textContent.length) {
          var prevPre = document.createElement('PRE');
          prevPre.textContent = textContent.slice(0, textRange.start);
          pre.parentNode.insertBefore(prevPre, pre);
          pre.textContent = textContent.slice(textRange.end);
          pre.parentNode.insertBefore(p, pre);
        } else if (textRange.start > 0) {
          pre.textContent = textContent.slice(0, textRange.start);
          if (pre.nextSibling) {
            pre.parentNode.insertBefore(p, pre.nextSibling);
          } else {
            pre.parentNode.appendChild(p);
          }
        } else if (textRange.end < textContent.length) {
          pre.textContent = textContent.slice(textRange.end);
          pre.parentNode.insertBefore(p, pre);
        } else {
          p.appendChild(document.createTextNode(textContent));
          pre.parentNode.replaceChild(p, pre);
        }
      }
      setSelectionFromRangeOrNode(targetRange, p);
    }
  }

  function formatList(isOrdered, targetRange) {
    var blocks = getRangeParentBlocks(targetRange);
    var list;
    for (var i = 0, l = blocks.length; i < l; i++) {
      var block = blocks[i];
      var li = document.createElement('LI');
      list = list || document.createElement(isOrdered ? 'OL' : 'UL');
      if (block.tagName === 'LI') {
        while (block.firstChild) {
          li.appendChild(block.firstChild);
        }
        block.appendChild(list);
      } else {
        var inlineChildren = getDeepInlineChildren(block);
        for (var j = 0, m = inlineChildren.length; j < m; j++) {
          li.appendChild(inlineChildren[j]);
        }
        block.parentNode.replaceChild(list, block);
      }
      list.appendChild(li);
      setSelectionFromRangeOrNode(targetRange, li);
    }
  }

  function formatRemoveList(targetRange) {
    var block = getParentBlock(targetRange.startContainer);
    var list = getParentByTagNames(block, ['OL', 'UL']);
    if (list) {
      while (list.firstChild) {
        if (list.firstChild.nodeType === Node.ELEMENT_NODE) {
          if (list.parentNode.tagName === 'LI') {
            list.parentNode.parentNode.insertBefore(list.firstChild, list.parentNode);
          } else {
            var p = document.createElement('P');
            var inlineChildren = getDeepInlineChildren(list.firstChild);
            for (var i = 0, l = inlineChildren.length; i < l; i++) {
              p.appendChild(inlineChildren[i]);
            }
            list.parentNode.insertBefore(p, list);
            list.removeChild(list.firstChild);
          }
        } else {
          list.removeChild(list.firstChild);
        }
      }
      if (list.parentNode.tagName === 'LI') {
        list.parentNode.parentNode.removeChild(list.parentNode);
      }
      setSelectionFromRangeOrNode(targetRange, list.parentNode);
      list.parentNode.removeChild(list);
    }
  }

  function formatHeader(tag, targetRange) {
    var blocks = getRangeParentBlocks(targetRange);
    for (var i = 0, l = blocks.length; i < l; i++) {
      var block = getParentBlock(blocks[i]);
      var editorNode = getRootBlock(block).parentNode;
      if (block.tagName !== 'P') {
        formatRemoveAll(targetRange);
        return format.call(editorNode, 'header', tag);
      }
      var header = getParentByTagNames(block, [tag.toUpperCase()]);
      if (!header) {
        header = document.createElement(tag.toUpperCase());
        var blockInlineChildren = getDeepInlineChildren(block);
        for (var j = 0, m = blockInlineChildren.length; j < m; j++) {
          header.appendChild(blockInlineChildren[j]);
        }
        block.parentNode.replaceChild(header, block);
        setSelectionFromRangeOrNode(targetRange, header);
      }
    }
  }

  function formatRemoveHeader(targetRange) {
    var blocks = getRangeParentBlocks(targetRange);
    for (var i = 0, l = blocks.length; i < l; i++) {
      var header = getParentByTagNames(
        blocks[i],
        ['H1', 'H2', 'H3', 'H4', 'H5', 'H6']
      );
      if (header) {
        var p = document.createElement('P');
        while (header.firstChild) {
          p.appendChild(header.firstChild);
        }
        header.parentNode.replaceChild(p, header);
        setSelectionFromRangeOrNode(targetRange, p);
      }
    }
  }

  function formatBlockquote(targetRange) {
    var blocks = getRangeParentBlocks(targetRange);
    var blockquote;
    for (var i = 0, l = blocks.length; i < l; i++) {
      var block = getRootBlock(blocks[i]);
      var existing = getParentByTagNames(block, ['BLOCKQUOTE']);
      if (!existing) {
        blockquote = blockquote || document.createElement('BLOCKQUOTE');
        block.parentNode.replaceChild(blockquote, block);
        blockquote.appendChild(block);
        setSelectionFromRangeOrNode(targetRange, blockquote);
      }
    }
  }

  function formatRemoveBlockquote(targetRange) {
    var block;
    var blocks;
    var blockquote = getParentByTagNames(targetRange.startContainer, ['BLOCKQUOTE']);
    if (blockquote) {
      blocks = Array.prototype.slice.call(blockquote.childNodes);
    } else {
      blocks = [];
    }
    for (var i = blocks.length - 1; i >= 0; i--) {
      block = blocks[i];
      blockquote = getParentByTagNames(block, ['BLOCKQUOTE']);
      if (blockquote) {
        if (blockquote.nextSibling) {
          blockquote.parentNode.insertBefore(block, blockquote.nextSibling);
        } else {
          blockquote.parentNode.appendChild(block);
        }
        if (blockquote.childNodes.length === 0) {
          blockquote.parentNode.removeChild(blockquote);
        }
        setSelectionFromRangeOrNode(targetRange, block);
      }
    }
  }

  function formatBlockTextDirection(dir, targetRange) {
    var blocks = getRangeParentBlocks(targetRange);
    for (var i = 0, l = blocks.length; i < l; i++) {
      var block = blocks[i];
      if (!dir || dir === 'null') {
        block.removeAttribute('dir');
      } else {
        block.setAttribute('dir', dir);
      }
    }
  }

  function formatRemoveAll(targetRange) {
    var textRange = getTextRange(targetRange);
    var rootBlock = getRootBlock(targetRange.startContainer);
    if (rootBlock.tagName === 'UL' || rootBlock.tagName === 'OL') {
      return formatRemoveList(targetRange);
    }
    var p = document.createElement('P');
    p.appendChild(document.createTextNode(rootBlock.textContent));
    rootBlock.parentNode.replaceChild(p, rootBlock);
    textRange.commonAncestorBlock = p;
    setSelectionFromTextRange(textRange);
    return textRange;
  }

  function formatRemoveInline(formatName, targetRange) {
    var textRange = getTextRange(targetRange);
    for (var i = textRange.formats[formatName].length - 1; i >= 0; i--) {
      var formatRange = textRange.formats[formatName][i];
      if (
        formatRange.start <= textRange.end
        && textRange.start <= formatRange.end
      ) {
        if (targetRange.collapsed) {
          textRange.formats[formatName].splice(i, 1);
        } else if (textRange.start > formatRange.start && textRange.end < formatRange.end) {
          textRange.formats[formatName].splice(i, 0, {
            name: formatName,
            value: formatRange.value,
            start: textRange.end,
            end: formatRange.end
          });
          formatRange.end = textRange.start;
        } else {
          if (formatRange.start >= textRange.start && formatRange.start < textRange.end) {
            formatRange.start = textRange.end;
          }
          if (formatRange.end > textRange.start && formatRange.end <= textRange.end) {
            formatRange.end = textRange.start;
          }
          if (formatRange.start >= formatRange.end) {
            textRange.formats[formatName].splice(i, 1);
          }
        }
      }
    }
    renderTextRangeFormats(textRange);
  }

  function insertEmptyParagraph(editorNode, replace) {
    var p = document.createElement('P');
    p.appendChild(document.createElement('BR'));
    if (replace) {
      editorNode.replaceChild(p, replace);
    } else {
      editorNode.appendChild(p);
    }
    setSelection(p, 0);
    return p;
  }

  function insertAtRange(node, range) {
    var container = range.startContainer;
    var offset = range.startOffset;
    if (container.nodeType === Node.TEXT_NODE) {
      if (offset === container.nodeValue.length) {
        if (container.nextSibling) {
          container.parentNode.insertBefore(node, container.nextSibling);
        } else {
          container.parentNode.appendChild(node);
        }
      } else if (offset > 0) {
        container.parentNode.insertBefore(
          document.createTextNode(container.nodeValue.slice(0, offset)),
          container
        );
        container.parentNode.insertBefore(node, container);
        container.nodeValue = container.nodeValue.slice(offset);
      } else {
        container.parentNode.insertBefore(node, container);
      }
    } else {
      offset = Math.min(container.childNodes.length - 1, offset);
      container.insertBefore(node, container.childNodes[offset]);
    }
  }

  function removeAllStyles(node) {
    for (var i = node.style.length; i--;) {
      node.style.removeProperty(node.style[i]);
    }
  }

  function removeAllAttributes(node) {
    for (var i = node.attributes.length; i--;) {
      if (validAttrs.indexOf(node.attributes[i].name) === -1) {
        node.removeAttribute(node.attributes[i].name);
      }
    }
  }

  var blockTags = ['P', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'PRE', 'H1', 'FIGURE', 'H2', 'H3', 'H4', 'H5', 'H6'];
  var inlineTags = ['BR', 'STRONG', 'EM', 'DEL', 'U', 'A', 'CODE', 'TEXT', 'SPAN'];
  var pasteableTags = blockTags.concat(inlineTags).concat(['IMG', 'FIGCAPTION']);
  var validAttrs = ['contenteditable', 'class', 'src', 'href', 'width', 'height', 'title', 'alt', 'dir'];

  var tagFormats = {
    P: { name: 'paragraph', value: true },
    A: { name: 'link', value: true },
    H1: { name: 'header', value: 'h1' },
    H2: { name: 'header', value: 'h2' },
    H3: { name: 'header', value: 'h3' },
    H4: { name: 'header', value: 'h4' },
    H5: { name: 'header', value: 'h5' },
    H6: { name: 'header', value: 'h6' },
    BLOCKQUOTE: { name: 'blockquote', value: true },
    PRE: { name: 'code', value: true },
    CODE: { name: 'code', value: true },
    OL: { name: 'list', value: 'ordered' },
    UL: { name: 'list', value: 'unordered' },
    STRONG: { name: 'bold', value: true },
    EM: { name: 'italic', value: true },
    DEL: { name: 'strikethrough', value: true },
    U: { name: 'underline', value: true },
    SUP: { name: 'superscript', value: true },
    SUB: { name: 'subscript', value: true },
    FIGURE: { name: 'image', value: true },
    SPAN: { name: 'direction', value: 'auto' }
  };

  var inlineFormatTags = {
    link: { tag: 'A' },
    code: { tag: 'CODE' },
    bold: { tag: 'STRONG' },
    italic: { tag: 'EM' },
    strikethrough: { tag: 'DEL' },
    underline: { tag: 'U' },
    superscript: { tag: 'SUP' },
    subscript: { tag: 'SUB' },
    direction: { tag: 'SPAN' }
  };

  var validChildTags = {
    FIGURE: ['IMG', 'FIGCAPTION'],
    FIGCAPTION: ['TEXT'],
    BLOCKQUOTE: ['P', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'],
    P: inlineTags,
    PRE: ['BR', 'TEXT'],
    UL: ['LI'],
    OL: ['LI'],
    LI: ['OL', 'UL'].concat(inlineTags),
    H1: inlineTags,
    H2: inlineTags,
    H3: inlineTags,
    H4: inlineTags,
    H5: inlineTags,
    H6: inlineTags
  };
    

  function isPasteable(node) {
    return pasteableTags.indexOf(node.tagName) !== -1
      || (
        node.tagName === 'DIV'
        && node.getAttribute('contenteditable') === 'false'
      );
  }

  function isBlock(node) {
    return blockTags.indexOf(node.tagName) !== -1;
  }

  function isInline(node) {
    return node.nodeType !== Node.ELEMENT_NODE
      || inlineTags.indexOf(node.tagName) !== -1;
  }

  function isEditable(node) {
    return node.nodeType === Node.ELEMENT_NODE
      && node.getAttribute('contenteditable') === 'true';
  }

  function isEmbed(node) {
    return node.nodeType === Node.ELEMENT_NODE
      && node.getAttribute('contenteditable') === 'false';
  }

  function isInEditor(editorNode, node) {
    while (node && node.parentNode) {
      if (isEmbed(node)) return false;
      if (node === editorNode) return true;
      node = node.parentNode; 
    }
    return false;
  }

  function isEmptyBlock(node) {
    return node.textContent.length === 0;
  }

  function hasBlockChildren(node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      for (var i = 0, l = node.childNodes.length; i < l; i++) {
        if (isBlock(node.childNodes[i])) return true;
      }
    }
    return false;
  }

  function getParentBlock(node) {
    while (!isBlock(node) && !isEditable(node)) {
      node = node.parentNode;
    }
    return node;
  }

  function getRangeParentBlocks(range) {
    var inRange = false;
    return reduceNode(range.commonAncestorContainer, function(blocks, node, index) {
      var block;
      if (isRangeBoundary(node, index, range.startContainer, range.startOffset)) {
        block = getParentBlock(node) || block;
        inRange = true;
      }
      else if (isRangeBoundary(node, index, range.endContainer, range.endOffset)) {
        block = getParentBlock(node) || block;
        inRange = false;
      } else if (inRange && node.parentNode === range.commonAncestorContainer && isBlock(node)) {
        block = node;
      }
      if (block && blocks[blocks.length - 1] !== block) {
        blocks.push(block);
      }
      return blocks;
    }, []);
  }

  function isFocusBlockStart() {
    var sel = window.getSelection();
    var node = sel.focusNode;
    if (sel.focusOffset === 0) {
      var block = getRootBlock(node);
      while (node.parentNode.firstChild === node && node !== block) {
        node = node.parentNode;
      }
      return node === block ? node : null;
    }
    return null;
  }

  function isFocusBlockEnd() {
    var sel = window.getSelection();
    var node = sel.focusNode;
    var isLast;
    if (sel.focusNode.nodeType === Node.TEXT_NODE) {
      isLast = sel.focusOffset === sel.focusNode.nodeValue.length;
    } else {
      isLast = sel.focusOffset === sel.focusNode.childNodes.length;
    }
    if (isLast) {
      var block = getRootBlock(node);
      while (node.parentNode.lastChild === node && node !== block) {
        node = node.parentNode;
      }
      return node === block ? node : null;
    }
    return null;
  }

  function getRootBlock(node) {
    var block = node;
    while (node) {
      if (isEditable(node)) return block;
      if (isBlock(node)) block = node;
      node = node.parentNode;
    }
    return block;
  }

  function getRootBlockForRange(range) {
    var node = range.startContainer;
    if (node.nodeType === Node.ELEMENT_NODE) {
      node = node.childNodes[Math.min(node.childNodes.length - 1, range.startOffset)];
    }
    return getRootBlock(node);
  }

  function getParentByTagNames(node, tags) {
    while (tags.indexOf(node.tagName) === -1) {
      if (isEditable(node)) return null;
      node = node.parentNode;
    }
    return node;
  }

  function getDeepInlineChildren(node) {
    var children = [];
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (isInline(node)) {
        children.push(node);
      } else {
        for (var i = 0, l = node.childNodes.length; i < l; i++ ) {
          children = children.concat(getDeepInlineChildren(node.childNodes[i]));
        }
      }
    } else {
      children.push(node);
    }
    return children;
  }

  function traverseNode(node, visitor) {
    visitor(node);
    if (node.nodeType === Node.ELEMENT_NODE) {
      var children = Array.prototype.slice.call(node.childNodes);
      for (var i = 0, l = children.length; i < l; i++) {
        if (children[i].nodeType === Node.ELEMENT_NODE && children[i].getAttribute('contenteditable') !== 'false') {
          traverseNode(children[i], visitor);
        }
      }
    }
  }

  function reduceNode(node, reduce, reduction, index) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.getAttribute('contenteditable') !== 'false') {
        reduction = reduce(reduction, node, index || 0);
        var children = Array.prototype.slice.call(node.childNodes);
        for (var i = 0, l = children.length; i < l; i++) {
          reduction = reduceNode(children[i], reduce, reduction, i);
        }
      }
    } else {
      reduction = reduce(reduction, node, index || 0);
    }
    return reduction;
  }

  function isRangeBoundary(node, index, container, offset) {
    return (
      container.nodeType === Node.ELEMENT_NODE
      && node.parentNode === container
      && index === offset
    ) || node === container;
  }

  var modernSelectionSupport =
    typeof window.getSelection().setbaseAndExtent === 'function'
    && typeof window.getSelection().extend === 'function';

  function getFirstChild(node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      for (var i = 0, l = node.childNodes.length; i < l; i++) {
        if (node.childNodes[i].nodeType === Node.TEXT_NODE || (node.childNodes[i].nodeType === Node.ELEMENT_NODE && node.childNodes[i].tagName !== 'BR')) {
          return node.childNodes[i];
        }
      }
    }
    return null;
  }

  function toggleClass(node, cls) {
    var classes = node.className ? node.className.split(' ') : [];
    var idx = classes.indexOf(cls);
    if (idx === -1) {
      classes.push(cls);
    } else {
      classes.splice(idx, 1);
    }
    node.className = classes.join(' ');
    return node;
  }

  function setFocusBlockStart(node) {
    var firstChild;
    if (node.nodeType === Node.ELEMENT_NODE) {
      node.scrollIntoView(true);
    }
    while (firstChild = getFirstChild(node)) {
      node = firstChild;
    }
    setSelection(node, 0);
  }

  function setFocusBlockEnd(node) {
    var lastChild;
    while (lastChild = node.lastChild) {
      node = lastChild;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.tagName === 'BR') {
        setSelection(node.parentNode, node.parentNode.childNodes.length - 1);
      } else {
        setSelection(node, node.childNodes.length);
      }
    } else {
      setSelection(node, node.nodeValue.length);
    }
  }
 
  function setSelectionFromRangeOrNode(range, node) {
    if (range && range.startContainer.isConnected) {
      if (range.endContainer.isConnected) {
        setSelection(range.startContainer, range.startOffset, range.endContainer, range.endOffset);
      } else {
        setSelection(range.startContainer, range.startOffset);
      }
    } else if (node) {
      setSelection(node, 0);
    }
  }

  function setSelection(anchorNode, anchorOffset, focusNode, focusOffset) {
    if (!focusNode) focusNode = anchorNode;
    if (!focusOffset) focusOffset = anchorOffset;
    var selection = window.getSelection();
    if (modernSelectionSupport) {
      selection.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset);
      selection.extend(focusNode, focusOffset);
    } else {
      var range = document.createRange();
      range.setStart(anchorNode, anchorOffset);
      range.setEnd(focusNode, focusOffset);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  function setSelectionFromTextRange(textRange) {
    var commonAncestorBlock = textRange.commonAncestorBlock;
    var startContainer = commonAncestorBlock;
    var startOffset = 0;
    var endContainer = commonAncestorBlock;
    var endOffset = 0;
    reduceNode(textRange.commonAncestorBlock, function(textRange, node) {
      var offset = textRange.offset;
      if (node.nodeType === Node.TEXT_NODE) {
        textRange.offset += node.nodeValue.length;
        if (startContainer === commonAncestorBlock && textRange.start >= offset && textRange.start <= textRange.offset) {
          startContainer = node;
          startOffset = textRange.start - offset;
        }
        if (endContainer === commonAncestorBlock && textRange.end >= offset && textRange.end <= textRange.offset) {
          endContainer = node;
          endOffset = textRange.end - offset;
        }
      }
      return textRange;
    }, assign(textRange, { offset: 0 }));
    setSelection(startContainer, startOffset, endContainer, endOffset);
  }

  function equalRanges(a, b) {
    return a.startContainer === b.startContainer
      && a.startOffset === b.startOffset
      && a.endContainer === b.endContainer
      && a.endOffset === b.endOffset;
  }

  function getEditorStaticRanges(editorNode) {
    var selection = window.getSelection();
    var staticRanges = [];
    for (var i = 0, l = selection.rangeCount; i < l; i++) {
      var range = selection.getRangeAt(i);
      if (isInEditor(editorNode, range.startContainer)) {
        staticRanges.push(staticRange(range));
      }
    }
    return staticRanges;
  };

  function staticRange(range) {
    return {
      startContainer: range.startContainer,
      startOffset: range.startOffset,
      endContainer: range.endContainer,
      endOffset: range.endOffset,
      collapsed: range.collapsed,
      commonAncestorContainer: range.commonAncestorContainer
    };
  }

  function deleteStaticRanges(staticRanges) {
    var collapsed = null;
    for (var i = 0, l = staticRanges.length; i < l; i++) {
      var range = document.createRange();
      range.setStart(staticRanges[i].startContainer, staticRanges[i].startOffset);
      range.setEnd(staticRanges[i].endContainer, staticRanges[i].endOffset);
      range.deleteContents();
      if (i === 0) {
        collapsed = staticRange(range);
      }
    }
    return collapsed;
  }

  function capitalize(text) {
    return text.slice(0, 1).toUpperCase() + text.slice(1);
  }

  function assign(target, source) {
    for (var key in source) {
      target[key] = source[key];
    }
    return target;
  }
})();
