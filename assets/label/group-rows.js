const rowPairs = window.rowPairs = window.rowPairs || [];

function initGroupRows(pairs) {
  toggleLineNo();
  toggleParaBox();

  rowPairs.length = 0;
  (pairs || '').split('||').filter(s => s).forEach(p => rowPairs.push(p));
  rowPairs.forEach(movePairs);
  showRowPairs();
  setTimeout(verifyParaOrders, 100);
}

function showRowPairs() {
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
      ids = $ids.map((i, d) => $('span', d).map((i, s) => $(s).text()).get().join(' ')).get();

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
  selector: '#content p[id]',
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

function splitParagraph($p) {
  const text0 = $p.text(), saveData = {id: $p.attr('id'), result: []};
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
    if (!result) {
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

function verifyParaOrders() {
  const colCount = parseInt($('body').attr('data-col-count') || 1),
    message = [], paraIds = window.paraIds || [];

  for (let i = 0; i < colCount; i++) {
    const indexes = [];
    const colIds = $(`.cell-${i} p[id]:visible`).map((_, p) => p.getAttribute('id')).get(),
      orgIds = paraIds.filter(d => colIds.indexOf(d) >= 0);

    $(`#merged .cell-${i} p[id]:visible`).each(function () {
      const id = this.getAttribute('id'), text = this.innerText,
        pid = id.replace(/\d[a-z]/, s => s[0]),
        moved = /moved/.test(this.className),
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
  $('#verify-errors').html(message.join(''));
}

function selectInPairsArea(id) {
  const area = document.getElementById('row-pairs-area'),
    start0 = area.value.search('[^\s|]' + id + '[|\s$*-]'),
    start = area.value.indexOf(id, start0);

  if (start >= 0) {
    setTimeout(() => {
      area.focus();
      area.selectionStart = start;
      area.selectionEnd = start + id.length;
    }, 50);
  }
}

$(document).on('click', '#merged [id]', function (e) {
  selectInPairsArea(e.target.getAttribute('id'));
});

$(document).on('click', '#verify-errors span[data-id]', function (e) {
  const id = e.target.closest('[data-id]').getAttribute('data-id'), $p = $('#' + id);

  selectInPairsArea(id);
  scrollToVisible($p[0]);
  $p.addClass('highlight');
  setTimeout(() => $p.removeClass('highlight'), 500);
});
