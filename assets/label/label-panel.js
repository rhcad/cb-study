const _panelCls = '.label-panel > .notes', _labelPanel = $(_panelCls),
    _label = {}, _labelMap = {},
    options = window.options || {};

/**
 * 开始合并注解到原文
 * @param {Array[]} notes 每个注解元素为一个数组，其元素个数为三的整数倍，依次为注解ID、原文、注解内容
 * @param {string} tag 单字的标签
 * @param {string} cellClass 正文栏的选择器
 * @param {string} [desc] 注解来源
 */
function initNotes(notes, tag, cellClass, desc) {
  _label.tag = tag;
  _label.cellClass = cellClass;
  _label.$cells = $(cellClass);
  _label.desc = desc || '[' + tag + ']';
  _label.notes = notes;
  _label.rawMode = false;

  // 切换导航条的标记高亮状态
  $('.init-notes-btn').parent().removeClass('active');
  $(`.init-notes-btn[data-tag="${tag.replace(/[\[\]]/g, '')}"]`).parent().addClass('active');
  _label.$cells.find('note').removeAttr('cur-tag');

  // 设置标注面板的内容
  const makeText = t => t.length < 25 ? t : t.substr(0, 14) + '…' + t.substr(t.length - 10);
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
      titles.push(note[i + 1]);
      content.push(i > 0 ? `<span class="p" data-line-no="${line}">${text}</span>` : note[i + 2]);
    }

    _label.$cells.find(`note[data-nid="${note[0]}"]`).attr('cur-tag', true);
    _labelMap['' + note[0]] = note;
    if (_label.rawMode) {
      return `<p data-note-id="${note[0]}" class="raw-note${linked ? ' linked' : ''}" ` +
          `data-line-no="${note[1]}">${content.join('')}</p>`;
    } else {
      const title = titles.join('\n'),
          titleS = title.indexOf('\n') > 0 || title.length > 20 ? title : '',
          content_ = content.join('').replace(/\d{4}\w*$/, '');
      return `<p data-note-id="${note[0]}" data-line-no="${lines[0] || ''}" ` +
          `class="${linked ? 'linked' : ''}" data-title="${titles[0]}">${note[0]}: ` +
          `<span title="${titleS}" abbr="${makeText(note[1])}"></span><br/><span class="content">${content_}</span></p>`;
    }
  }).join('\n').replace(/ (data-line-no|title)=""/g, ''));

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
      title.push(note[i + 1]);
    }
    $tag.attr('title', title.join('\n'));
  });

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
    const $p = $(_panelCls + ' p:first-child');
    if (first || $p.hasClass('linked')) {
      _label.lastTag = _label.$cells.find(`.note-tag[data-nid=${$p.attr('data-note-id')}]`)[0];
      scrollToVisible(_label.lastTag);
      $p.fadeOut(Math.max(ms -= 5, 5), function() {
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

function _addNote(nid) {
  const selection = window.getSelection(),
      range = selection.rangeCount === 1 && selection.getRangeAt(0),
      note = _labelMap[nid];

  if (range && _inCell(selection.anchorNode) && _inCell(selection.focusNode)) {
    const testDiv = document.createElement('div'),
        title = [], rows = [];
    let el = document.createElement('note');

    getNoteContent(note, title, rows, _label.rawMode, _label.desc);

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
      $(`<p class="note-p" data-nid="${nid}">${rows.join('<br>')}</p>`)
          .insertAfter(el.closest('p,.lg'));
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

  if (note && $p.length > 1) {
    for (let i = 1; i < $p.length; i++) {
      const $n = $($p[i]), nid = parseInt($n.attr('data-note-id')), note2 = _labelMap['' + nid];
      $p[0].innerHTML = $p[0].innerHTML + `<span class="p">${$n.html()}</span>`;
      $n.remove();
      removeIds.push(nid);
      note.push.apply(note, note2);
      _label.notes = _label.notes.filter(t => t[0] !== nid);
    }
  }
  if (note && _addNote(id)) {
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
    if (result.replace(/@/g, '') !== text0) {
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

$.contextMenu({
  selector: '.note-tag',
  items: {
    remove: {
      name: '删除注解',
      callback: function () {
        const id = this.attr('data-nid');
        $(`note[data-nid="${id}"]`).each((i, p) => $(p).replaceWith(p.innerHTML));
        $(`.note-tag[data-nid="${id}"],.note-p[data-nid="${id}"]`).remove();
        saveHtml();
      },
    },
  },
});
