const rowPairs = window.rowPairs = window.rowPairs || [];

/**
 * 初始化段落分组
 * @param {string} pairs
 */
function initGroupRows(pairs) {
  toggleLineNo();
  toggleParaBox();
  showRowPairs(pairs);

  const warn = rowPairs.map(movePairs), $content = $('#content');
  setTimeout(() => verifyParaOrders(warn.join('')), 100);
  if ($content.text().trim()) {
    setTimeout(() => window.scrollTo(0, $content.offset().top - 200), 200);
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
  $('#row-pairs-area').text(rowPairs.join('\n'));
}

// 在原始段落上单击，切换是否属于当前组，按Shift点击标记移动原文（编号末尾加星号）
$(document).on('click', '#content p, #content .lg-row', function (e) {
  let $this = $(this),
      id = $this.attr('id'),
      colIndex = parseInt($this.closest('.original').attr('id').replace('body', '')),
      $curIds = $('.current-row .row-ids-' + colIndex);

  $this.toggleClass('in-cur-row');  // 切换亮显
  if ($curIds.find('#cur-' + id).length) {
    $curIds.find('#cur-' + id).remove();
  } else {
    $curIds.append($('<span id="cur-' + id + '">' + id + (e.shiftKey ? '*' : '') + '</span>'));
  }
});

// 将当前组的段落移到上面的合并区
$('#move-row').click(function () {
  const $ids = $('.current-row .row-ids'),
      ids = $ids.map((i, d) => $('span', d).map((i, s) => $(s).text()).get().join(' ') || ' ').get();

  $('.in-cur-row').removeClass('in-cur-row');
  $ids.html('');

  if (ids.join('').length) {
    movePairs(ids.join(' | '));
    window.rowPairs.push(ids.join(' | '));
    showRowPairs();
    saveRowPairs();
    verifyParaOrders();
  }
});

$.contextMenu({
  selector: '#content [id^=p],#merged [id^=p]',
  items: {
    splitP: {
      name: '拆分段落',
      callback: function() { splitParagraph(this); },
    }
  },
  events: {
    show: function () {
      this.addClass('in-cur-row-sel');
    },
    hide: function (e) {
      this.removeClass('in-cur-row-sel');
    },
  },
});

/**
 * 显示段落拆分对话框
 * @param {jQuery} $p
 */
function splitParagraph($p) {
  const text0 = $p.text(), saveData = {id: $p.attr('id'), result: [], merged: $p.closest('#merged').length};
  swal({
    title: `拆分段落 #${ $p.attr('id') }`,
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
    result = document.querySelector('.swal-content__textarea').value.replace(/[@\n]+/g, '@')
    if (result.replace(/@/g, '') !== text0) {
      return showError('拆分段落', '只能插入@，不能改动内容。');
    }
    if (result.indexOf('@') > 0) {
      let $last = $p, id, id0 = $p.attr('id').replace(/[a-z]$/, '');
      result.split('@').forEach((text, i) => {
        if (i === 0) {
          saveData.text = text;
          $p.text(text.trim());
          saveData.result.push({text: text.trim()});
        } else if (text.trim()) {
          for (let j = 0; j < 26; j++) {
            id = id0 + String.fromCharCode('a'.charCodeAt(0) + j);
            if ($('#' + id).length < 1) {
              break;
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
 * 自动校验合并区内的段落顺序
 * @param {string} [extra] 额外的警告文本
 */
function verifyParaOrders(extra) {
  const colCount = parseInt($('body').attr('data-col-count') || 1),
    message = [], paraIds = window.paraIds || [];

  for (let i = 0; i < colCount; i++) {
    const cells = $(`.cell-${i} [id]:visible`).map((_, p) => ({p, y: p.getBoundingClientRect().top})).get();
    cells.sort((a, b) => a.y - b.y);
    const colIds = cells.map(c => c.p && c.p.getAttribute('id')),
      orgIds = paraIds.filter(d => colIds.indexOf(d) >= 0);
    const indexes = [];

    cells.filter(c => c[0] && c[0].closest('#merged')).forEach(c => {
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
        message.push(`<div><span data-id="${id}"><b>${id}</b> 应先于 ${paraIds[endIndex]}</span><div>${text}</div></div>`);
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
 * 在编号成组文本区域中高亮选中落号
 * @param {string} id
 */
function selectInPairsArea(id) {
  const area = id && document.getElementById('row-pairs-area'),
    start0 = (area && area.value || '').search('[^\s|]' + id + '[|\s$*-]'),
    start = (area && area.value || '').indexOf(id, start0);

  if (start >= 0) {
    setTimeout(() => {
      area.focus();
      area.selectionStart = start;
      area.selectionEnd = start + id.length;
    }, 50);
  }
}

// 在合并区点击段落，自动在编号成组文本区域中高亮选中此段落号
$(document).on('click', '#merged [id]', function (e) {
  selectInPairsArea(e.target.closest('[id]').getAttribute('id'));
});

// 在校验出错行上点击编号项，高亮显示编号文本和段落
$(document).on('click', '#verify-errors span[data-id]', function (e) {
  const id = e.target.closest('[data-id]').getAttribute('data-id'), $p = $('#' + id);

  selectInPairsArea(id);
  scrollToVisible($p[0]);
  $p.addClass('highlight');
  setTimeout(() => $p.removeClass('highlight'), 800);
});
