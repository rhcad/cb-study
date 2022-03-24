/**
 * 段落分组设置，每行的格式为“ id id... | id...”，或行首是“:ke ”的科判条目
 * @type {string[]}
 */
const rowPairs = window.rowPairs = window.rowPairs || [];

/**
 * 初始化段落分组
 * @param {string} pairs
 */
function initGroupRows(pairs) {
  toggleLineNo();
  toggleParaBox();
  showRowPairs(pairs);

  const warn = rowPairs.map(movePairs);
  setTimeout(() => verifyParaOrders(warn.join('')), 100);
  if (!$('#content').text().trim()) {
    $('.current-row > .row,#move-row').hide();
  }
}

/**
 * 显示段落分组的编号内容
 * @param {string} [pairs]
 */
function showRowPairs(pairs) {
  if (pairs) {
    rowPairs.length = 0;
    pairs.split('||').filter(s => s).forEach(p => rowPairs.push(p));
  }
  $('#row-pairs-area').text(rowPairs.join('\n\n'));
}

// 在原始段落上单击，切换是否属于当前组，按Shift点击标记移动原文（编号末尾加星号）
$(document).on('click', '#content p, #content .lg-row', function (e) {
  let $p = $(this),
      id = $p.attr('id'),
      colIndex = parseInt($p.closest('.original').attr('id').replace('body', '')),
      $curIds = $('.current-row .row-ids-' + colIndex);

  if ($curIds.length) {
    $p.toggleClass('in-cur-row');  // 切换亮显
    if ($curIds.find('#cur-' + id).length) {
      $curIds.find('#cur-' + id).remove();
    } else {
      $curIds.append($('<span id="cur-' + id + '">' + id + (e.shiftKey ? '*' : '') + '</span>'));
    }
  }
});

// 将当前组的段落移到上面的合并区
$('#move-row').click(function () {
  const $ids = $('.current-row .row-ids'),
      ids = $ids.map((i, d) => $('span', d).map((i, s) => $(s).text()).get().join(' ') || '-').get();

  if (!$ids.text().trim()) {
    return;
  }
  $('.in-cur-row').removeClass('in-cur-row');
  $ids.html('');

  if (ids.join('').length) {
    movePairs(ids.join('|'));
    rowPairs.push(ids.join('|'));
    showRowPairs();
    saveRowPairs();
    verifyParaOrders();
  }
});

// 段落的鼠标右键菜单
$.contextMenu({
  selector: '#content [id^=p],#merged [id^=p]',
  items: {
    splitP: {
      name: '拆分段落...',
      callback: function() { _splitParagraph(this); },
    },
    mergeUp: {
      name: '与上段合并',
      callback: function() { _mergeUp(this, false); },
      disabled: function() { return !_mergeUp(this, true)},
    },
    sep1: {name: '--'},
    moveUp: {
      name: '上移',
      callback: function() { _moveP(this, true, false); },
      disabled: function() { return !this.closest('#merged').length || !_moveP(this, true, true)},
    },
    moveDown: {
      name: '下移',
      callback: function() { _moveP(this, false, false); },
      disabled: function() { return !this.closest('#merged').length || !_moveP(this, false, true)},
    },
    extractRow: {
      name: '分离为新行...',
      callback: function() { _extractRow(this, false); },
      disabled: function() { return !this.closest('#merged').length || !_extractRow(this, true)},
    },
    sep2: {name: '--'},
    addKePan: {
      name: '前加科判条目...',
      callback: function() { _setKePanText(this, this.closest('.row')); },
      disabled: function() { return !this.closest('#merged').length &&
          $('.label-panel .current-row').length; },
    },
    appendKePan: {
      name: '后加科判条目...',
      callback: function() { _setKePanText(this, this.closest('.row'), true); },
      disabled: function() { return !this.closest('#merged').length &&
          $('.label-panel .current-row').length; },
    },
  },
});
$.contextMenu({
  selector: '.lg-row',
  items: {
    extractRow: {
      name: '分离为新行...',
      callback: function() { _extractRow(this, false); },
      disabled: function() { return !this.closest('#merged').length || !_extractRow(this, true)},
    },
    sep2: {name: '--'},
    addKePan: {
      name: '前加科判条目...',
      callback: function() { _setKePanText(this, this.closest('.row')); },
      disabled: function() { return !this.closest('#merged').length &&
          $('.label-panel .current-row').length; },
    },
    appendKePan: {
      name: '后加科判条目...',
      callback: function() { _setKePanText(this, this.closest('.row'), true); },
      disabled: function() { return !this.closest('#merged').length &&
          $('.label-panel .current-row').length; },
    },
  },
});

/**
 * 显示段落拆分对话框
 * @param {jQuery} $p
 * @private
 */
function _splitParagraph($p) {
  const text0 = $p.text(), $curCol = $p.closest('.cell'),
      saveData = {
        id: $p.attr('id'), result: [],
        merged: $p.closest('#merged').length
      };

  swal({
    title: `拆分段落 #${$p.attr('id')}`,
    text: '在要拆分处插入分隔符“@”或回车换行。',
    content: {
      element: 'textarea',
      attributes: {
        rows: 8,
        value: text0,
      }
    },
    buttons: ['取消', '拆分'],
  }).then(result => {
    if (!result || /-/.test(saveData.id)) {
      return;
    }
    result = document.querySelector('.swal-content__textarea').value.replace(/[@\n]+/g, '@');
    if (result.replace(/@/g, '') !== text0) {
      return showError('拆分段落', '只能插入@，不能改动内容。');
    }
    if (result.indexOf('@') > 0) {
      let $last = $p, id, id0 = $p.attr('id').replace(/[a-z]\d*$/, '');
      result.split('@').forEach((text, i) => {
        if (i === 0) {
          saveData.text = text;
          $p.text(text.trim());
          saveData.result.push({text: text.trim()});
        } else if (text.trim()) {
          let x, j = 26;
          for (x = 0; j === 26; x++) {
            for (j = 0; j < 26; j++) {
              id = id0 + String.fromCharCode('a'.charCodeAt(0) + j) + (x ? '' + x : '');
              if ($('#' + id).length < 1) {
                break;
              }
            }
          }
          const $new = $(`<p id="${id}" data-line-no="[${id}]">${text.trim()}</p>`);
          $new.insertAfter($last);
          $last = $new;
          saveData.text += '@' + text;
          saveData.result.push({id: id, text: text.trim()});
        }
      });
    }
    if (saveData.result.length) {
      saveSplitParagraph(saveData);
    }
  });
}

/**
 * 与上段合并
 * @param {jQuery} $p
 * @param {boolean} test 是否只是检测可用性
 * @private
 */
function _mergeUp($p, test) {
  const id = $p.attr('id'), // 段落号
      merged = $p.closest('#merged').length,
      $curCol_ = $p.closest('.cell'), // 当前单元格
      $curCol = $curCol_.length ? $curCol_ : $p.parent(), // 单列就取为上一级元素
      rows = $curCol.children().get(), // 所在单元格的所有段落
      lineNo = rows.indexOf($p[0]), // 在所在单元格中的行号
      rowIndex = findRowIndexInPairs(id), // 行块的序号
      cell_m = /cell-(\d+)/.exec($curCol[0].className),
      colIndex = parseInt(cell_m ? cell_m[1] : 0), // 列序号
      cols = rowIndex < 0 ? [] : rowPairs[rowIndex].split('|'), // 当前行块的每列的段落号
      ids = (cols[colIndex] || '').trim().split(/\s+/g), // 当前单元格的每个段落号
      pid = (ids[lineNo] || '').replace(/[a-z]\d*[*-]?$/, ''); // 未拆分段落时的原始段落号

  if (!/^p\d/.test(id) || lineNo < 1) {
  }
  else if (!merged) {
    if (!test) {
      const $prev = $(rows[lineNo - 1]);

      saveSplitParagraph({id: $prev.attr('id'), id2: id, col: colIndex, merged: merged});
      $prev.html($prev.html() + $p.html());
      $p.hide(200, $p.remove());
    }
    return true;
  } else if (pid === ids[lineNo - 1].replace(/[a-z][*-]*$/, '')) {
    if (!test) {
      const prevId = ids[lineNo - 1].replace(/[*-]*$/, ''),
          $prev = $curCol.find('#' + prevId);

      saveSplitParagraph({id: prevId, id2: id, col: colIndex, merged: merged});
      $prev.html($prev.html() + $p.html());
      $p.hide(200, $p.remove());
    }
    return true;
  }
}

/**
 * 将段落移动一位
 * @param {jQuery} $p
 * @param {boolean} up 是否上移
 * @param {boolean} test 是否只是检测可用性
 * @private
 */
function _moveP($p, up, test) {
  const id = $p.attr('id'), // 段落号
      $curCol = $p.closest('.cell'), // 当前单元格
      rows = $curCol.children().get(), // 所在单元格的所有段落
      lineNo = rows.indexOf($p[0]), // 在所在单元格中的行号
      rowIndex = findRowIndexInPairs(id), // 行块的序号
      colIndex = parseInt(/cell-(\d+)/.exec($curCol[0].className)[1]); // 列序号

  // 上移要求是单元格的第一段、上面有行块，下移要求是单元格的最后一段、下面有行块
  if (up ? lineNo === 0 && rowIndex > 0 : lineNo === rows.length - 1 && rowIndex < rowPairs.length - 1) {
    if (!test) {
      let cols = rowPairs[rowIndex].split('|'); // 当前行块的各列的段落号
      let ids = cols[colIndex].trim().split(/\s+/g); // 当前单元格的段落号
      cols[colIndex] = ids.filter(s => s !== id).join(' ') || '-'; // 当前单元格去掉此id
      rowPairs[rowIndex] = cols.join('|'); // 改动到当前行块

      let index2 = up ? rowIndex - 1 : rowIndex + 1
      if (up) {
        while (index2 >= 0 && rowPairs[index2].startsWith(':')) index2--;
        cols = rowPairs[index2].split('|'); // 上一行块的各列的段落号
        ids = cols[colIndex].trim().replace(/^-$/, '').split(/\s+/g);
        ids.push(id); // 末尾加上此id
        cols[colIndex] = ids.join(' ');
        rowPairs[index2] = cols.join('|');
      } else {
        while (index2 < rowPairs.length && rowPairs[index2].startsWith(':')) index2++;
        cols = rowPairs[index2].split('|'); // 下一行块的各列的段落号
        ids = cols[colIndex].trim().replace(/^-$/, '').split(/\s+/g);
        ids.unshift(id);
        cols[colIndex] = ids.join(' ');
        rowPairs[index2] = cols.join('|');
      }
      showRowPairs();
      applyRowPairs();
    }
    return true;
  }
}

/**
 * 分离为单独的一行
 * @param {jQuery} $p
 * @param {boolean} test 是否只是检测可用性
 * @private
 */
function _extractRow($p, test) {
  const id = $p.attr('id'), // 段落号
      $row = $p.closest('.row'), // 行块，有多列，每列有多行的单元格
      $curCol = $p.closest('.cell'), // 当前单元格
      rows = $curCol.find('p[id^=p],.lg-row').get(), // 所在单元格的所有段落
      lineNo = rows.indexOf($p[0]), // 在所在单元格中的行号
      cols = $row.children('.cell').map((i, c) => [$(c).find('p[id^=p],.lg-row').get().slice(0, lineNo + 1)]).get(),
      colIds = cols.map(c => c.map(p => p.getAttribute('id')).join(' ') || '-'),
      colIndex = parseInt(/cell-(\d+)/.exec($curCol[0].className)[1]); // 列序号

  // 当前单元格下面还有单元格、新行块的有段落的单元格超过一个
  if (lineNo >= 0 && lineNo < rows.length - 1 && colIds.filter(c => c.length > 1).length > 1) {
    const newRow = colIds.join('|'), // 新行块，列间用|分隔，相邻段落号用空格隔开，没有段落的列用减号表示
        rest = $row.children('.cell').map((i, c) => [$(c).find('p[id^=p],.lg-row').get().slice(lineNo + 1)]).get()
            .map(c => c.map(p => p.getAttribute('id')).join(' ') || '-').join('|'),
        newRowSpan = colIds.map((s, i) => i === colIndex ? '<b>' + s + '</b>' : s).join(' | ');

    if (!test) {
      swal({
        title: '分离为新行',
        content: {
          element: 'span',
          attributes: {innerHTML: newRowSpan + '<br/><br/>下一行：<br/>' + rest.replace(/\|/g, ' | ')}
        },
        buttons: ['取消', '分离'],
      }).then(result => {
        if (result) {
          const rowIndex = findRowIndexInPairs(id);
          rowPairs[rowIndex] = newRow;
          rowPairs.splice(rowIndex + 1, 0, rest);
          showRowPairs();
          applyRowPairs();
        }
      });
    }
    return true;
  }
}

/**
 * 自动校验合并区内的段落顺序
 * @param {string} [extra] 额外的警告文本
 */
function verifyParaOrders(extra) {
  const colCount = parseInt($('body').attr('data-col-count') || 1),
      message = [], paraIds = window.paraIds || [];

  for (let i = 0; i < colCount; i++) {
    const cells = $(`.cell-${i} [id^=p]:visible,.cell-${i} [id^=g].lg-row:visible`).map((j, p) => {
      const c = p.closest('.cell'), yc = c.getBoundingClientRect().top, yp = p.getBoundingClientRect().top;
      return {p: p, y: yc + (yp - yc) / 10};
    }).get();

    cells.sort((a, b) => a.y - b.y);
    const colIds = cells.map(c => c.p && c.p.getAttribute('id')),
        orgIds = paraIds.filter(d => colIds.indexOf(d) >= 0);
    const indexes = [];

    cells.filter(c => c.p && c.p.closest('#merged')).forEach(c => {
      const p = c.p, text = p.innerText,
          id = p.getAttribute('id'),
          moved = /moved/.test(p.className),
          index = paraIds.indexOf(id),
          endIndex = indexes[indexes.length - 1];

      if (moved) {
        const orgIdx = orgIds.indexOf(id);
        message.push(`<div data-moved><span data-id="${id}"><b>${id}</b> 已标记移动位置</span><div>${text}</div>
            <div>原始位置：<span data-id="${orgIds[orgIdx + 1]}">${orgIds[orgIdx + 1] ? orgIds[orgIdx + 1] + '之前' : ''}</span>
                <span data-id="${orgIds[orgIdx - 1]}">${orgIdx > 0 ? orgIds[orgIdx - 1] + '之后' : ''}</span> </div></div>`);
      } else if (indexes.length && index < endIndex) {
        message.push(`<div><span data-id="${id}"><b>${id}</b></span> 应先于 
            <span data-id="${paraIds[endIndex]}">${paraIds[endIndex]}</span><div>${text}</div></div>`);
      }
      if (!moved) {
        indexes.push(index);
      }
    });
  }
  if (extra) {
    extra.split('\n').forEach(text => {
      const id = text.split(' ')[0], t = text.split(': ');
      message.push(`<div><span data-id="${id}">${t[0]}</span><div>${t[1] || ''}</div></div>`);
    });
  }
  $('#verify-errors').html(message.join(''));
}

/**
 * 得到所在行块的序号
 * @param {string} id
 * @return {number}
 */
function findRowIndexInPairs(id) {
  let i = rowPairs.length, pat = new RegExp('(^|[\\s|])' + id + '($|[\\s\\n|*-])');
  while (--i >= 0 && _findInPairs(id, rowPairs[i], pat) < 0) {
  }
  return i;
}

/**
 * 在段落分组文本里查找一个段落号对应的文本序号
 * @param {string} id 段落号
 * @param {string} text 段落分组文本
 * @param {RegExp} [pat] 为了避免重复正则表达式编译的已编译正则对象
 * @return {number} 文本序号
 * @private
 */
function _findInPairs(id, text, pat) {
  if (!/^[pg]\d/.test(id)) {
    return text.indexOf(id);
  }
  const start0 = text.search(pat || '(^|[\\s|])' + id + '($|[\\s\\n|*-])');
  return start0 < 0 ? -1 : text.indexOf(id, start0);
}

/**
 * 在编号成组文本区域中高亮选中落号
 * @param {string} id
 * @return {boolean} 是否已高亮选中
 */
function selectInPairsArea(id) {
  const area = id && document.getElementById('row-pairs-area'),
      start = _findInPairs(id, area && area.value || '');

  if (start >= 0) {
    setTimeout(() => {
      area.focus();
      area.selectionStart = start;
      area.selectionEnd = start + id.length;
    }, 50);
  }
  return start >= 0;
}

// 在合并区点击段落，自动在编号成组文本区域中高亮选中此段落号
$(document).on('click', '#merged [id]', function (e) {
  const id = e.target.closest('[id]').getAttribute('id');
  $('.p-nav input').val(id);
});

// 高亮显示编号文本和段落
function _highlightParagraph(id) {
  const $p = $('#' + (id || 'e'));
  if (!selectInPairsArea(id)) {
    selectInPairsArea($p.text());
  }
  scrollToVisible($p[0]);
  setTimeout(() => {
    $p.addClass('highlight');
    setTimeout(() => $p.removeClass('highlight'), 800);
  }, 200);
}

// 在校验出错行上点击编号项，高亮显示编号文本和段落
$(document).on('click', '#verify-errors span[data-id]', function (e) {
  const id = e.target.closest('[data-id]').getAttribute('data-id');
  _highlightParagraph(id);
  $('.p-nav input').val(id);
});

// 滚动到合并区下方的红线处，即未合并内容的上方
$('#to-original').click(() => {
  window.scrollTo(0, $('#content').offset().top - 200);
});

// 段落定位
$('.p-nav button').click(() => {
  _highlightParagraph($('.p-nav input').val());
});

// 科判条目上点击
$(document).on('click', '.ke-line', e => {
  selectInPairsArea(e.target.innerText);
});

// 科判条目的鼠标右键菜单
$.contextMenu({
  selector: '.ke-line',
  items: {
    setText: {
      name: '设置科判文本...',
      callback: function() { _setKePanText(this); },
    },
    addKePan: {
      name: '前加科判条目...',
      callback: function() { _setKePanText(this, this); },
    },
    appendKePan: {
      name: '后加科判条目...',
      callback: function() { _setKePanText(this, this, true); },
    },
  },
});

function _setKePanText($p, $row, after) {
  const hasGroupPanel = $('.label-panel .current-row').length,
      indent = $p.attr('data-indent'),
      textRaw = $p.text().replace(/^.+»/, ''),
      textKe = indent && (new Array(1 + parseInt(indent)).join('-') + textRaw),
      text = !$row && textKe || '';
  swal({
    title: $row ? '增加科判条目' : '设置科判文本',
    text: $row ? `在 ${ $p.attr('id') || '本条'} ${after ? '后' : '前'}加科判条目，文本前的减号数量表示科判层级。` :
        '文本前的减号数量表示科判层级，输入d表示删除科判条目。',
    content: {
      element: 'input',
      attributes: { value: text }
    },
    closeOnClickOutside: false,
    buttons: ['取消', '确定'],
  }).then(result => {
    result = result && result.trim();
    if (!result || !result.replace(/^-*/, '')) {
      return;
    }

    let idxKe = rowPairs.map((t, i) => t.indexOf(textKe) > 0 && i + 1).filter(i => i)[0],
        index = !$row && idxKe, ret = false;

    if (/^d/i.test(result)) { // 删除
      if (!hasGroupPanel) {
        return saveRowPairs(true, `:ke-del ${$p.attr('ke-pan')}`);
      } else if (!$row) {
        rowPairs.splice(index - 1, 1);
        ret = true;
      }
    } else if ($row) { // 增加
      if (!hasGroupPanel) { // 在单栏不需要合并的场合，在当前段落上方或下方加科判条目
        const cmd = `:ke-${after ? 'append' : 'add'} ${$p.attr('id') || $p.attr('ke-pan')} ${result}`;
        return saveRowPairs(true, cmd);
      } else {
        index = $p.attr('id') ? findRowIndexInPairs($p.attr('id')) : idxKe - 1;
        if (index >= 0) {
          rowPairs.splice(after ? index + 1 : index, 0,
              `:ke${cbOptions.kePanType || ''} ` + result);
          ret = true;
        }
      }
    } else if (text !== result) { // 修改
      if (!hasGroupPanel) {
        return saveRowPairs(true, `:ke-set ${$p.attr('ke-pan')} ${result}`);
      }
      rowPairs[index - 1] = rowPairs[index - 1].replace(text, result);
      ret = true;
    }

    if (ret) {
      saveRowPairs(true);
    }
  });
}

// 分组快捷键：回车移为一组
$(document).on('keyup', function (e) {
  if (!/TEXTAREA|BUTTON/.test(document.activeElement.tagName) && $('.swal-overlay--show-modal').length < 1) {
    if (e.key === 'Enter') {
      $('#move-row').click();
    }
  }
});

$('#set-ke-pan-type').click(() => {
  const showInput = text => {
    swal({
      title: '设置科判类型',
      text: '按“类型数字 科判类型名 科判说明”输入每种科判类型。',
      content: {
        element: 'textarea',
        attributes: {
          rows: 6,
          value: text,
        }
      },
      buttons: ['取消', '确定'],
    }).then(result => {
      result = result && document.querySelector('.swal-content__textarea').value;
      if (result) {
        let error = false;
        const rows = result.split('\n').filter(s => s).map(r => {
          if (!error && !/^\d [^\s]+/.test(r)) {
            showError('格式错误', r, () => showInput(result));
            error = true;
          }
          return `:ke-type ${r}||`;
        });

        if (!error) {
          showRowPairs(rows.join('') + rowPairs.filter(r => !/^:ke-type/.test(r)).join('||'));
          applyRowPairs();
        }
      }
    });
  };
  showInput(rowPairs.filter(r => /^:ke-type/.test(r)).map(r => r.replace(/^:ke-type\s+/, '')).join('\n'));
});
