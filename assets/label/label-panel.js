const _panelCls = '.label-panel > .notes', _labelPanel = $(_panelCls),
    _spanForCmpCls = '.txt-cmp-mode > .notes p>span',
    _cmpTxtCls = '.txt-cmp-mode > .txt-rows > p',
    _label = {}, _labelMap = {},
    options = window.options || {};
const reHans = /[\u2E80-\u2FD5\u3190-\u319f\u3400-\u4DBF\u4E00-\u9Fef\uF900-\uFAAD]/,
    rePu = /[，、；：。！？‘’“”·…《》（）「」『』—()〔〕]/;

/**
 * 开始合并注解到原文
 * @param {Array[]} notes 每个注解元素为一个数组，其元素个数为三的整数倍，依次为注解ID、原文、注解内容
 * @param {string} tag 单字的标签
 * @param {string} cellClass 正文栏的选择器
 * @param {string} [desc] 注解来源
 * @param {string} [cmpTxt] 注解来源
 */
function initNotes(notes, tag, cellClass, desc, cmpTxt) {
  _label.tag = tag;
  _label.cellClass = cellClass;
  _label.$cells = $(cellClass);
  _label.desc = desc || '[' + tag + ']';
  _label.notes = notes;
  _label.rawMode = false;

  // 切换导航条的标记高亮状态
  $('.init-notes-btn').parent().removeClass('active');
  $(`.init-notes-btn[data-tag='${tag.replace(/[\[\]]/g, '')}']`).parent().addClass('active');
  _label.$cells.find('note').removeAttr('cur-tag');
  _labelPanel.toggleClass('txt-cmp-mode', !!(/^[A-Z]\d+[a-z]? /.test(_label.desc) && cmpTxt));

  // 设置标注面板的内容
  const makeText = t => t.length < 25 ? t : t.substr(0, 12) + '…' + t.substr(t.length - 15);
  _labelPanel.html(notes.map(note => {
    const $tag = _label.$cells.find(`[data-nid=${note[0]}]`),
        linked = $tag.length || note[2][0] === '-',
        titles = [], content = [], lines = [];

    _label.rawMode = _label.rawMode || /^\d{4}/.test(note[1]);
    for (let i = 0; i + 2 < note.length; i += 3) {
      const m = /\d{4}\w*$/.exec(note[i + 2]),
          line = m && m[0] || _label.rawMode && note[1] || '',
          text = note[i + 2].replace(/\d{4}\w*$/, '');
      if (line) {
        lines.push(line);
      }
      titles.push(note[i + 1].replace(/^[!-]/, ''));
      content.push(i > 0 && !_labelPanel.hasClass('txt-cmp-mode') ?
          `<span class='p' data-line-no='${line}'>${text}</span>` : note[i + 2]);
    }

    _label.$cells.find(`note[data-nid='${note[0]}']`).attr('cur-tag', true);
    _labelMap['' + note[0]] = note;
    if (_label.rawMode) {
      return `<p data-note-id='${note[0]}' class='raw-note${linked ? " linked" : ""}' ` +
          `data-line-no='${note[1]}'>${content.join('')}</p>`;
    } else {
      const title = titles.join('\n'),
          titleS = title.indexOf('\n') > 0 || title.length > 20 ? title : '',
          spans = [];

      if (_labelPanel.hasClass('txt-cmp-mode')) {
        content.forEach(c => c.replace(/\d{4}\w*$/, '').split('\n').forEach(s => {
          spans.push(`<br/><span class='content'>${s}</span>`);
        }));
      } else {
        spans.push(`<br/><span class='content'>${content.map(c => c.replace(/\d{4}\w*$/, '')).join('')}</span>`);
      }

      return `<p data-note-id='${note[0]}' data-line-no='${lines[0] || ''}' ` +
          `class='${linked ? "linked" : ""}' data-title='${titles[0]}'>${note[0]}: ` +
          `<span title='${titleS}' abbr='${makeText(note[1])}'></span>${spans.join('')}</p>`;
    }
  }).join('\n').replace(/ (data-line-no|title)=''/g, ''));

  $('.tip-3-pair').toggle(!_label.rawMode);
  $('.tip-3-raw').toggle(_label.rawMode);

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
      title.push(note[i + 1].replace(/^[!-]/, ''));
    }
    $tag.attr('title', title.join('\n'));
  });

  if (_labelPanel.hasClass('txt-cmp-mode')) {
    _pageTxtLoaded(cmpTxt.split('\n'));
  }

  _selectForCurrent();
}

// 在正文中选中第一条注解对应的文本
function _selectForCurrent(expand) {
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

  if (expand && !$lp.hasClass('raw-note')) {
    wrapNoteP($lp.first());
  }

  window.getSelection().removeAllRanges();
  if (title) {
    const found = [];
    _label.$cells.find('p[id^=p],.lg-row>div').each((i, p) => {
      const text = p.innerText, index = text.replace(sign, '').indexOf(title);
      if (index >= 0) {
        try {
          const pos = [index];
          check(text, title, pos);
        } catch (pos) {
          if (pos.length) {
            const rect = selectInParagraph(p, pos[0], pos[pos.length - 1] + 1);
            if (rect) {
              found.push({p: p, start: pos[0], end: pos[pos.length - 1] + 1, rect: rect})
            }
          }
        }
      }
    });

    if (found.length > 1) {
      const rect = _label.lastTag && _label.lastTag.getBoundingClientRect();
      if (rect && rect.height) {
        let minDist = 1e5, best;
        found.forEach(r => {
          const dist = Math.abs(rect.top - r.rect.top);
          if (minDist > dist) {
            minDist = dist;
            best = r;
          }
        });
        if (best) {
          selectInParagraph(best.p, best.start, best.end);
        }
      }
    }
  }
}

/**
 * 在正文选中指定范围的文本
 * @param {HTMLElement} el 段落元素
 * @param {number} startOffset 起始字符偏移量
 * @param {number} endOffset 终止字符偏移量
 * @return {DOMRect|undefined} 选择范围的视窗坐标，相对于视口的位置
 */
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
    return range.getBoundingClientRect();
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
    const $p = $(_panelCls + ' p:first-child'),
      cmpMode = $p.closest('.txt-cmp-mode').length;

    if (first || (cmpMode ? $p.find('.merged').length && $p.next().find('.merged').length : $p.hasClass('linked'))) {
      _label.lastTag = _label.$cells.find(`.note-tag[data-nid=${$p.attr('data-note-id')}]`)[0];
      scrollToVisible(_label.lastTag);
      $p.fadeOut(Math.max(ms -= 5, 5), function() {
        if (cmpMode) {
          $p.find('span').each((_, span) => {
            const text = _getSpanTextForCmp($(span)), row = _findBestTxtRow(text, 0.2);
            $(row).remove();
          });
        }
        $p.remove();
        remove();
      });
    } else {
      _selectForCurrent(true);
    }
  }
  remove(true);
});

// 在标注面板点击注解行，高亮显示正文有此引用处
$(document).on('click', _panelCls + ' p.linked', function (e) {
  const $p = $(e.target).closest('p'),
      id = $p.attr('data-note-id') || '-',
      $tag = _label.$cells.find(`.note-tag[data-nid=${id}]`),
      $note = $(`note[data-nid=${id}]`),
      expanded = !$note.hasClass('note-expanded');

  if ($tag.length) {
    _label.lastTag = $tag[0];
    scrollToVisible(_label.lastTag);
    $('note').removeClass('note-expanded');
    $note.toggleClass('note-expanded', expanded);

    const $kePan = $tag.closest('[ke-pan]');
    highlightKePan($kePan.attr('ke-pan'), $kePan[0]);
  }
});

// 在标注面板双击第一条注解行，在正文中选中文本；点击注解行切换内容展开
$(document).on('dblclick', _panelCls + ' p:not(.raw-note):first-child:not(.linked)', () => _selectForCurrent());
$(document).on('click', _panelCls + ' p:not(.raw-note)', e => wrapNoteP($(e.target).closest('p')));

function wrapNoteP($p) {
  if (!$p.hasClass('wrap')) {
    $('p.wrap').removeClass('wrap');
    $p.addClass('wrap');
  }
  $('footer > p').text($p.attr('data-title'));
}

// 在标注面板单击普通注解行，切换选中状态
$(document).on('click', _panelCls + ' p.raw-note', e => {
  $(e.target).closest('p').toggleClass('selected');
  _updateSelCount();
});
function _updateSelCount() {
  const n = $(_panelCls + ' p.selected').length;
  $('#sel-p-count').text(`取消选中(${n})`).toggleClass('hidden', !n);
}

// 点击注解行选中数量按钮，取消标注面板的选中状态
$('#sel-p-count').click(function() {
  $(_panelCls + ' p.selected').removeClass('selected');
  $(this).addClass('hidden');
});

function _inCell(node) {
  if (node) {
    node = node.nodeType !== Node.ELEMENT_NODE ? node.parentNode : node;
    return node.closest(_label.cellClass)
  }
}

function _addNote(nid, useNote) {
  const selection = window.getSelection(),
      range = selection.rangeCount === 1 && selection.getRangeAt(0);

  if (range && _inCell(selection.anchorNode) && _inCell(selection.focusNode)) {
    const testDiv = document.createElement('div');
    let el = document.createElement('note');

    testDiv.appendChild(range.cloneContents());
    if (/<(p|div|td)[ >]/i.test(testDiv.innerHTML)) { // 跨段落选择
      el = null;
      $('.no-select,.note-p', testDiv).remove();
      $('p[id^=p],.lg-cell', testDiv).each((i, p) => {
        const id = p.getAttribute('id'),
            outerEl = document.getElementById(id),
            html = p.innerHTML.replace(/^(<note [^>]+>)+|(<\/note>)+$/g, ''),
            pos = outerEl && (i ? outerEl.innerHTML.indexOf(html) : outerEl.innerHTML.lastIndexOf(html));

        if (outerEl && pos >= 0) {
          const span = `<note tmp data-nid='${nid}' cur-tag='true'>${html}</note>`;
          outerEl.innerHTML = outerEl.innerHTML.substring(0, pos) + span + outerEl.innerHTML.substring(pos + html.length);
          el = outerEl.querySelector('note[tmp]');
          if (el) {
            el.removeAttribute('tmp');
          }
        }
      });
      if (!el) {
        return showError('标记失败', '未能在多个段落中标记文本。')
      }
    } else {
      // 将选中文本移入 note 节点
      el.appendChild(range.extractContents());
      el.setAttribute('data-nid', nid);
      el.toggleAttribute('cur-tag', true);
      range.insertNode(el);
    }

    const note = useNote(), title = [], rows = [];
    getNoteContent(note, title, rows, _label.rawMode, _label.desc, _label.tag);

    // 在 note 节点后插入注解锚点标记，允许一个注解有多个注解锚点标记
    const tagEl = document.createElement('sup');
    tagEl.classList.add('note-tag');
    tagEl.setAttribute('data-tag', '[' + _label.tag + ']');
    tagEl.setAttribute('data-nid', nid);
    tagEl.setAttribute('title', title[0]);
    _label.lastTag = tagEl;

    // 在 note 节点后插入注解锚点标记，跳过已有的标记
    let ref = el;
    for (let pa = !el.nextElementSibling && el.parentElement;
         pa && pa.tagName === 'NOTE' && pa.innerText.length === el.innerText.length; pa = pa.parentElement) {
      ref = pa;
    }
    for (let nx = ref.nextElementSibling; nx && nx.hasAttribute('data-tag'); nx = nx.nextElementSibling) {
      ref = nx;
    }
    $(tagEl).insertAfter(ref);

    // 在 note 节点所在段落后插入注解段落，自动移到靠下的位置
    const $exist = $(`.note-p[data-nid="${nid}"]`);
    if ($exist.length && $exist.offset().top < $(el).offset().top) {
      $exist.remove();
      $exist.length = 0;
    }
    if (!$exist.length) {
      $(`<p class="note-p" data-nid="${nid}">${rows.join('')}</p>`)
          .insertAfter(el.closest('p,.lg')[0]);
    }

    return el;
  } else {
    showError('获取选择', '应在注解对应的正文栏中选择文本。');
  }
}

function addNote(autoSwitch) {
  const $p = $(_panelCls + (_label.rawMode ? ' p.selected' : ' p:first-child')),
      id = $p.attr('data-note-id'),
      note = (!$p.hasClass('linked') || !autoSwitch) && _labelMap[id],
      removeIds = [];
  const useNote = () => {
    if (note && $p.length > 1) { // 选择了多个普通内容的注解段落，就合并到第一个注解段落中
      for (let i = 1; i < $p.length; i++) {
        const $n = $($p[i]), nid = parseInt($n.attr('data-note-id')), note2 = _labelMap['' + nid];
        $p[0].innerHTML = $p[0].innerHTML + `<span class="p">${$n.html()}</span>`;
        $n.remove();
        removeIds.push(nid);
        note.push.apply(note, note2);
        _label.notes = _label.notes.filter(t => t[0] !== nid);
      }
    }
    return note;
  };

  if (note && _addNote(id, useNote)) {
    const ended = () => {
      window.getSelection().removeAllRanges();
      $p.addClass('linked').removeClass('wrap');
      if (autoSwitch) {
        if (_label.rawMode) {
          $p.removeClass('selected');
        } else {
          $p.remove();
          _selectForCurrent(true);
        }
      }
      _updateSelCount();
    };
    $.post('/cb/page/note/' + pageId, {
      tag: _label.tag, nid: id,
      remove: removeIds.join(',')
    }, r => r.nid && saveHtml(ended)).error(ajaxError('保存注解失败'));
  }
  else if (window.getSelection().rangeCount) {
    showError('未插入注解', '要将一个注解插入到多个段落，请按Shift或Ctrl键然后回车。');
  }
}

// 按回车插入注解，未按Shift、Ctrl时自动切换到下一条注解
$(document).on('keyup', function (e) {
  if (!/TEXTAREA|BUTTON/.test(document.activeElement.tagName) && $('.swal-overlay--show-modal').length < 1) {
    if (e.key === 'Enter') {
      addNote(!e.ctrlKey && !e.shiftKey);
    }
  }
});

// 标注面板的注解上鼠标移入时，在状态栏显示原文
$(document).on('mouseenter', _panelCls + ' p', function (e) {
  const p = $(e.target), title = p.attr('data-title');
  $('footer > p').text(title);
});

// 注解段落的鼠标右键菜单
$.contextMenu({
  selector: _panelCls + ' p.raw-note',
  items: {
    splitP: {
      name: '拆分段落...',
      callback: function() { _splitNote(this); },
    },
    ignoreP: {
      name: '忽略段落',
      disabled: function () {
        return _label.$cells.find(`[data-nid=${this.attr('data-note-id')}]`).length > 0;
      },
      checked: function () { return this.hasClass('linked'); },
      callback: function () {
        const $sel = $(_panelCls + ` p.selected,p[data-note-id="${this.attr('data-note-id')}"]`);
        $.post('/cb/page/note/' + pageId, {
          tag: _label.tag,
          ignore: $sel.map((_, p) => p.getAttribute('data-note-id')).get().join(',')
        }, () => $sel.toggleClass('linked').removeClass('selected') && _updateSelCount())
            .error(ajaxError('保存注解失败'));
      },
    },
  },
});

// 显示注解段落拆分对话框
function _splitNote($p) {
  const text0 = $p.text(), id = $p.attr('data-note-id'),
      saveData = {id: id, result: []};

  swal({
    title: `拆分段落 ${$p.attr('data-line-no')}`,
    text: '在要拆分处回车换行。',
    content: {
      element: 'textarea',
      attributes: {
        rows: 8,
        value: text0,
      }
    },
    buttons: ['取消', '拆分'],
  }).then(result => {
    result = result && document.querySelector('.swal-content__textarea').value.replace(/[@\n]+/g, '@');
    if (!result || result.indexOf('@') < 1) {
      return;
    }
    if (result.replace(/@/g, '') !== text0.replace(/\n/g, '')) {
      return showError('拆分段落', '不能改动内容。');
    }
    $.post('/cb/page/note/' + pageId, {
      tag: _label.tag, nid: id, split: result
    }, r => {
      let ids = r.ids.split(','), line = $p.attr('data-line-no'), $last;
      result.split('@').forEach((text, i) => {
        if (i === 0) {
          $last = $p.text(text);
        } else {
          $last = $(`<p data-note-id="${ids[i-1]}" class="raw-note" data-line-no="${line}">${text}</p>`).insertAfter($last);
        }
      });
      _label.notes = r.raw;
      _label.notes.forEach(note => {
        _labelMap['' + note[0]] = note;
      })
    }).error(ajaxError('拆分失败'));
  });
}

// 注解锚点标记的右键菜单
const _undoData = {};
const _noteTagMenu = {
  selector: '.note-tag',
  items: {
    remove: {
      name: '移除注解',
      callback: function () {
        const id = this.attr('data-nid');
        $(`note[data-nid="${id}"]`).each((i, p) => $(p).replaceWith(p.innerHTML));
        $(`.note-tag[data-nid="${id}"],.note-p[data-nid="${id}"]`).remove();
        saveHtml();
      },
    },
    sep1: {name: '----'},
    moveLeft: {
      name: '左移标记',
      callback: function () {
        _undoData.beforeMove = getHtml();
        this.insertBefore(this.prev());
        saveHtml();
      },
      disabled: function () { return !this.prev().hasClass('note-tag'); },
    },
    moveRight: {
      name: '右移标记',
      callback: function () {
        _undoData.beforeMove = getHtml();
        let target = this;
        while (!target.next()[0]) {
          if (target[0].nextSibling) {
            break
          }
          target = target.parent();
        }
        if (target.next()[0]) {
          this.insertAfter(target.next());
        } else {
          target.parent().append(this);
        }
        saveHtml();
      },
    },
    moveRightMost: {
      name: '移到最右',
      callback: function () {
        let $n = this;
        while ($n.next().hasClass('note-tag')) {
          $n = $n.next();
        }
        _undoData.beforeMove = getHtml();
        this.insertAfter($n);
        saveHtml();
      },
      disabled: function () { return !this.next().hasClass('note-tag'); },
    },
    sep2: {name: '----'},
    undoMove: {
      name: '撤销移动',
      callback: function () {
        saveHtml(reload, _undoData.beforeMove);
      },
      disabled: function () { return !_undoData.beforeMove; },
    },
  },
};
$.contextMenu(_noteTagMenu);

// 从TXT文件合并注解行的标点
function _pageTxtLoaded(rows) {
  const $rows = $('<div/>').addClass('txt-rows')
      .html(rows.map(r => `<p contentEditable="false">${r}</p>`).join(''));

  $('.label-panel').addClass('txt-cmp-mode').append($rows);
  _label.txtRows = _getTxtRows();

  $(_spanForCmpCls).each((i, span) => {
    const $span = $(span), text = _getSpanTextForCmp($span);

    if (/[，、：；！？“]|　　/.test(text)) {
      $span.addClass('merged');
      $(_findBestTxtRow(text, 0.5)).addClass('merged');
    }
  });
}

// 得到注解span的文本
function _getSpanTextForCmp($span) {
  return $span.attr('title') || $span.attr('abbr') || $span.text() || '';
}

// 为了查找最佳匹配标点段落，提取标点段落的数据
function _getTxtRows() {
  return $(_cmpTxtCls).map((i, p) => {
    const chars = p.innerText.split('').filter(c => reHans.test(c)).map(c => s2t(c));
    if (chars.length === p.innerText.length ||
        chars.length === p.innerText.length - 1 && rePu.test(p.innerText[p.innerText.length - 1])) {
      p.classList.add('merged');
    }
    return {chars, i, p};
  }).get();
}

// 查找最佳匹配标点段落
function _findBestTxtRow(text, notFitRatio, excludeMerged) {
  let maxCount = 0, notFitCount, found;

  _label.txtRows.forEach(r => {
    const fit = {}, notFit = {};
    r.chars.forEach(c => ( (text.indexOf(c) < 0 ? notFit : fit)[c] = 1));

    const count = Object.keys(fit).length,
        count_ = count - Object.keys(notFit).length / 3;

    if ((!maxCount || (maxCount - notFitCount / 3) < count_) &&
        (!excludeMerged || !r.p.classList.contains('merged'))) {
      maxCount = count;
      found = r.p;
      notFitCount = Object.keys(notFit).length;
      // console.log(maxCount, notFitCount, r.p.innerText);
    }
  });

  if (found && maxCount > 5 && notFitCount > maxCount * (notFitRatio || 0.5)) {
    found = null;
  }

  return found;
}

// 单击注解段落，切换激活状态
$(document).on('click', _cmpTxtCls, e => {
  $(_cmpTxtCls).removeClass('active');
  e.target.closest('p').classList.add('active');
});

// 在合并标点对话框中，单击差异文本，切换如何取舍差异
$(document).on('click', '.cmp-modal span:not(.same)', e => {
  const base = e.target.getAttribute('data-base'), alt0 = '。，、：；！？（）〔〕「」';

  if (e.target.classList.contains('add-pu') || e.target.classList.contains('change-pu')) {
    if (e.altKey) {
      e.target.classList.toggle('reject');
      if (e.target.classList.contains('change-pu')) {
        e.target.innerText = e.target.classList.contains('reject') ? base
          : e.target.getAttribute('title').split(' ')[1];
      }
    } else {
      if (e.target.classList.contains('reject')) {
        e.target.classList.remove('reject');
        e.target.innerText = base;
      } else {
        const alt = base + alt0.replace(base, '');
        e.target.innerText = alt[alt.indexOf(e.target.innerText) + 1] || '';
        if (!e.target.innerText) {
          e.target.innerText = base;
          e.target.classList.add('reject');
        }
      }
    }
  } else if (e.target.classList.contains('change-txt')) {
    e.target.innerText = e.target.innerText === base
        ? e.target.getAttribute('title').split(' ')[1] : base;
  } else {
    e.target.classList.toggle('reject');
  }
});

// 单击注解span，高亮最佳匹配标点段落，按下Alt则不切换当前高亮
$(document).on('click', _spanForCmpCls, e => {
  const $span = $(e.target), text = _getSpanTextForCmp($span);

  $(_spanForCmpCls).removeClass('active');
  $span.addClass('active');
  if (!e.altKey && !$span.hasClass('merged')) {
    $(_cmpTxtCls).removeClass('active');
    $(_findBestTxtRow(text, 0.5, true)).click();
  }
});

// 双击注解span，根据最佳匹配标点段落，显示合并标点对话框
$(document).on('dblclick', _spanForCmpCls, e => {
  const $span = $(e.target.closest('span')), $p = $(e.target.closest('p')),
      text0 = _getSpanTextForCmp($span), text = (text0 + ' ').split(''),
      $ref = $(_cmpTxtCls + '.active'), refText_ = $ref.text(), refText = refText_.split(''),
      getType = c => !c ? 0 : rePu.test(c) ? 'p' : reHans.test(c) ? 'h' : 'e',
      endChar = s => (/([^，。！；])[，。！；]?$/.exec(s) || '--')[1];
  let title = `合并标点 #${$p.attr('data-note-id')}`;

  console.log(text0);
  if (!refText.length) {
    return showError('合并标点', '没有匹配段落。');
  }
  if (!($span.attr('title') || $span.attr('abbr') || $span.hasClass('content'))) {
    return showError('合并标点', '不是要合并的注解片段。');
  }
  if (refText_[0] !== text0[0] || endChar(refText_) !== endChar(text0)) {
    console.warn(refText_.substr(0, 10), refText_.substr(refText_.length - 10));
    title += ' *';
  }

  if ($p.attr('data-note-id')) {
    if (refText.filter(c => reHans.test(c) && !rePu.test(c) && text.indexOf(c) >= 0).length < 1) {
      return showError('合并标点', '没有匹配的汉字。')
    }

    const segments = [];
    let j = 0, curType, base = '', cmp = '';
    const add = (c, type, title, cmp_) => {
      if (curType !== type || /-pu/.test(type)) {
        if (base) {
          segments.push(`<span class='${curType}'${cmp ? " title='" + cmp + "'" : ''} data-base='${base}'>${base}</span>`);
        }
        base = '';
        cmp = title ? title + ' ' : '';
        curType = type;
      }
      base += c;
      cmp += cmp_ || '';
    };

    for (let i = 0; i < text.length; i++, j++) {
      const rc = s2t(refText[j]), c = text[i], rt = getType(rc), t = getType(c);

      if (c === ' ' && rt === 'p') {
        add(rc, 'add-pu', '加标点');
      } else if (rc === c || !rc) {
        if (c !== ' ') {
          add(c, 'same');
        }
      } else if (t === 'h') {
        if (rt === 'p') {
          add(rc, 'add-pu', '加标点'); // 参考文有标点，则在原字前加标点
          i--;
        } else if (rt === 'h') {
          const rc2 = s2t(refText[j + 1]), c2 = text[i + 1];
          if (rc2 === c) {
            add(c, 'add-txt', '添加原字'); // 参考文的下一字与当前字相同，即参考文缺字，则添加原字
            j++;
          } else if (rc === c2) {
            add(c, 'add-txt2', '原文多字'); // 参考文与下一字相同，即原文多字，则添加原字
            j--;
          } else {
            add(c, 'change-txt', '改字', rc); // 改字
          }
        } else {
          add(c, 'same');
        }
      } else if (t === 'p') {
        if (rt === 'h') {
          add(c, 'add-pu reject', '删除标点'); // 参考文缺标点，则标记原文待删除标点
          j--;
        } else if (rt === 'p') {
          add(rc, 'change-pu', '改标点', c); // 改标点
        } else {
          add(c, 'same');
        }
      } else if (!/[ 　-]/.test(c)) {
        console.assert(false, `${i} ${c} in ${text.join('')}`);
      }
    }
    add(0, 0);

    swal({
      title,
      text: '点击差异切换文本，按下Alt点击蓝色文本切换取舍。',
      className: 'cmp-modal',
      content: {
        element: 'div',
        attributes: {
          innerHTML: segments.join(''),
        }
      },
      buttons: ['取消', '确定'],
    }).then(result => {
      const div = result && document.querySelector('.swal-content__div');
      if (div) {
        $('.reject', div).remove();
        $.post('/cb/page/note/' + pageId, {
          tag: _label.tag,
          nid: $p.attr('data-note-id'),
          merge: div.innerText,
          oldText: text0,
          isContent: $span.hasClass('content') && '1'
        }, r => {
          if ($span.attr('title')) {
            $span.attr('title', div.innerText);
          } else if ($span.attr('abbr')) {
            $span.attr('abbr', div.innerText);
          } else {
            $span.text(div.innerText);
          }
          $span.addClass('merged');
          $ref.remove();
        }).error(ajaxError('合并失败'));
      }
    });
  }
});
