const _panelCls = '.label-panel > .notes', _labelPanel = $(_panelCls),
  _label = {}, _labelMap = {};

/**
 * 开始合并注解到原文
 * @param {Array[]} notes 每个注解元素为一个数组，其元素个数为三的整数倍，依次为注解ID、原文、注解内容
 * @param {string} noteTag 单字的标签
 * @param {string} cellClass 正文栏的选择器
 * @param {string} [desc] 注解来源
 */
function initNotes(notes, noteTag, cellClass, desc) {
  _label.noteTag = noteTag;
  _label.cellClass = cellClass;
  _label.$cells = $(cellClass);
  _label.desc = desc || '[' + noteTag + ']';

  // 切换导航条的标记高亮状态
  $('.init-notes-btn').parent().removeClass('active');
  $(`.init-notes-btn[data-tag="${noteTag.replace(/[\[\]]/g, '')}"]`).parent().addClass('active');
  _label.$cells.find('note').removeAttr('cur-tag');

  // 设置标注面板的内容
  const makeText = t => t.length < 25 ? t : t.substr(0, 14) + '…' + t.substr(t.length - 10);
  _labelPanel.html(notes.map(note => {
    const $tag = _label.$cells.find(`[data-nid=${note[0]}]`),
        titles = [];
    for (let i = 0; i + 2 < note.length; i += 3) {
      titles.push(note[i + 1]);
    }
    const title = titles.join('\n');

    _labelMap['' + note[0]] = note;
    _label.$cells.find(`note[data-nid="${note[0]}"]`).attr('cur-tag', true);

    return `<p data-note-id="${note[0]}" class="${($tag.length ? 'linked' : '')}" data-title="${titles[0]}">${note[0]}: ` +
        `<span title="${ title.indexOf('\n') > 0 || title.length > 20 ? title : ''}">${makeText(note[1])}</span><br/>${note[2]}</p>`;
  }).join('\n'));

  // 为正文中已标记处设置title属性为注解对应的原文
  _label.$cells.find('.note-tag').each(function() {
    const $tag = $(this),
        id = parseInt($tag.attr('data-nid')),
        note = notes.filter(item => item[0] === id)[0],
        title = [];

    if (!note) {
      return;
    }
    for (let i = 0; i + 2 < note.length; i += 3) {
      title.push(note[i + 1]);
    }
    $tag.attr('title', title.join('\n'));
  });

  _selectForCurrent();
}

// 在正文中选中第一条注解对应的文本
function _selectForCurrent() {
  const sign = /[\s.,:;!?{}()[\]，。、：；！？．【】（）《》「」『』‘’“”]+/g,
      endSign = /[:;!?})\]。：；！？】）》」』’”]+/g,
      $lp = $(_panelCls + ' p:not(.linked)'),
      title = ($lp.attr('data-title') || '').replace(sign, '');

  let t = 0;
  const check = (text, title, pos) => {
    const i = pos.length - 1;
    let idx = text.indexOf(title[i], pos[i]);
    if (idx < 0) {
      return false;
    }
    pos = pos.slice();
    while (1) {
      pos[i] = idx;
      if (pos.length === title.length) {
        const res = text.substring(pos[0], pos[i] + 1);
        if (res.replace(sign, '') !== title) {
          if (++t > 10) {
            throw [];
          }
          // console.log('skip ' + res);
          idx = text.indexOf(title[i], idx + 1);
          if (idx < 0) {
            return false;
          }
          continue;
        }
        while (endSign.test(text[ pos[i] + 1])) {
          pos[i]++;
        }
        throw pos;
      }
      pos.push(idx + 1);
      check(text, title, pos);
      pos.pop();
      idx = text.indexOf(title[i], idx + 1);
      if (idx < 0) {
        return false;
      }
    }

    return false;
  };

  window.getSelection().removeAllRanges();
  if (title) {
    _label.$cells.find('p,.lg-row>div').each((i, p) => {
      const text = p.innerText, index = text.replace(sign, '').indexOf(title);
      if (index >= 0) {
        try {
          const pos = [index];
          check(text, title, pos);
        } catch (pos) {
          if (pos.length) {
            selectInParagraph(p, pos[0], pos[pos.length - 1] + 1);
          }
        }
      }
    });
  }
}

// 在正文选中指定范围的文本
function selectInParagraph(el, startOffset, endOffset) {
  const selection = window.getSelection(),
      range = document.createRange(),
      start = findNodeOffset(el, startOffset),
      end = findNodeOffset(el, endOffset);

  selection.removeAllRanges();
  if (start && end) {
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    selection.addRange(range);
  }
}

/**
 * 在元素中查找指定偏移处的文本节点及节点内的偏移字符数
 * @param {Node} element: 元素
 * @param {Number} offset: 从此元素开始处的偏移量、字符数
 * @returns {{node: Node, offset: number}|null}
 */
function findNodeOffset(element, offset) {
  let charIndex = 0,
    nodeStack = [element],
    node, nextCharIndex, end = null

  while ((node = nodeStack.pop()) !== undefined) {
    if (node.nodeType === Node.TEXT_NODE) {
      nextCharIndex = charIndex + node.length
      if (offset < charIndex) {
        return {node, offset: 0}
      }
      if (offset <= nextCharIndex) {
        return {node, offset: offset - charIndex}
      }
      end = {node, offset: node.length}
      charIndex = nextCharIndex
    } else {
      let cn = node.childNodes,
        i = cn.length

      while (--i >= 0) {
        nodeStack.push(cn[i])
      }
      if (!cn.length) {
        end = end || {node, offset: offset}
      }
    }
  }

  return end
}

// 放弃第一条注解
$('#skip-top').click(function() {
  let ms = 100;
  function remove(first) {
    const $p = $(_panelCls + ' p:first-child');
    if (first || $p.hasClass('linked')) {
      scrollToVisible(_label.$cells.find(`.note-tag[data-nid=${$p.attr('data-note-id')}]`)[0]);
      $p.fadeOut(Math.max(ms -= 5, 5), function() {
        $p.remove();
        remove();
      });
    } else {
      _selectForCurrent();
    }
  }
  remove(true);
});

// 在标注面板点击注解行，高亮显示正文有此引用处
$(document).on('click', _panelCls + ' p.linked', function (e) {
  const id = $(e.target).closest('p').attr('data-note-id') || '-',
      $tag = _label.$cells.find(`.note-tag[data-nid=${id}]`);

  if ($tag.length) {
    scrollToVisible($tag[0]);
    $('note').removeClass('note-expanded');
    $(`note[data-nid=${id}]`).addClass('note-expanded');

    const $kePan = $tag.closest('[ke-pan]');
    highlightKePan($kePan.attr('ke-pan'), $kePan[0]);
  }
});

// 在标注面板双击第一条注解行，在正文中选中文本
$(document).on('dblclick', _panelCls + ' p:first-child:not(.linked)', _selectForCurrent);

function _inCell(node) {
  if (node) {
    node = node.nodeType !== Node.ELEMENT_NODE ? node.parentNode : node;
    return node.closest(_label.cellClass)
  }
}

function _addNote(id) {
  const selection = window.getSelection(),
      range = selection.rangeCount === 1 && selection.getRangeAt(0),
      note = _labelMap[id];

  if (range && _inCell(selection.anchorNode) && _inCell(selection.focusNode)) {
    const testDiv = document.createElement('div'),
        el = document.createElement('note');

    testDiv.appendChild(range.cloneContents());
    if (/<(p|div|td)[ >]/i.test(testDiv.innerHTML)) { // 跨段落选择
      return showError('获取选择', '不能跨段落选择。');
    }

    // 将选中文本移入 note 节点
    el.appendChild(range.extractContents());
    el.setAttribute('data-nid', id);
    el.toggleAttribute('cur-tag', true);
    range.insertNode(el);

    // 在 note 节点后插入注解锚点标记，允许一个注解有多个注解锚点标记
    const tagEl = document.createElement('sup');
    tagEl.classList.add('note-tag');
    tagEl.setAttribute('data-tag', '[' + _label.noteTag + ']');
    tagEl.setAttribute('data-nid', id);
    tagEl.setAttribute('title', note[1]);
    $(tagEl).insertAfter(el);

    // 在 note 节点所在段落后插入注解段落，自动移到靠下的位置
    const $exist = $(`.note-p[data-nid="${id}"]`);
    if ($exist.length && $exist.offset().top < $(el).offset().top) {
      $exist.remove();
      $exist.length = 0;
    }
    if (!$exist.length) {
      $(`<p class="note-p" data-nid="${id}"><span class="org-text">${note[1]}</span> ` +
        `<span class="note-text">${note[2]}</span> <span class="note-from">${_label.desc}</span></p>`)
        .insertAfter(el.closest('p,.lg'));
    }

    return el;
  } else {
    showError('获取选择', '选择范围不对。');
  }
}

function addNote(autoSwitch) {
  const $p = $(_panelCls + ' p:first-child:not(.linked)'),
      id = $p.attr('data-note-id');

  if (id && _addNote(id)) {
    window.getSelection().removeAllRanges();
    if (autoSwitch) {
      $p.remove();
      _selectForCurrent();
    }
  }
}

// 按回车插入注解，未按Shift、Ctrl时自动切换到下一条注解
$(document).on('keyup', function (e) {
  if (e.keyCode === 13) {
    addNote(!e.ctrlKey && !e.shiftKey);
  }
});

$(document).on('mouseenter', _panelCls + ' p', function (e) {
  const p = $(e.target), title = p.attr('data-title');
  $('footer > p').text(title);
});
