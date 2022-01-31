// reader.js
// Updated on 2022.1.21
/**
 * toggleLineNo, toggleXu, toggleParaBox
 * showLeftColumn, showRightColumn, showTwoColumns
 * enlargeFont, reduceFont, enlargeKePanFont, reduceKePanFont
 * setKePanWidth
 * movePairs
 * convertToSpanWithTag
 * showInlineKePan, showInlineWithoutKePan
 * highlightKePan, showKePanPath
 * getKePanId
 * insertNotes
 */

/**
 * 显隐行号
 */
function toggleLineNo() {
  $('#content [id^=p], #content [id^=g]').each((i, p) => {
    p.setAttribute('data-line-no', '[' + p.getAttribute('id').replace(/^g\d+-/, '') + ']');
  });
  $('#content,#merged').toggleClass('show-line-no');
  $('#show-line-no').closest('li').toggleClass('active');
}

/**
 * 显隐序言(.div-xu)
 */
function toggleXu() {
  if ($('.div-xu,.xu-more').length) {
    $('.div-xu').each(function () {
      if (!$('.xu-more', this).length && !/xu-more/.test(this.className)) {
        $(this).toggle();
      }
    });
    $('body').toggleClass('hide-div-xu');
    updateColumnStatus();
  }
}

/**
 * 显隐段落和span框，用于调试科判分布
 */
function toggleParaBox() {
  $('#content,#merged').toggleClass('show-box');
  $('#show-box').closest('li').toggleClass('active');
}

/**
 * 显示左边文(.row > .cell-0)
 */
function showLeftColumn() {
  const $left = $('.cell-0,.original#body0'), $right = $('.cell,.original');
  $right.hide();
  $left.show();
  updateColumnStatus();
}

/**
 * 显示右边文(.row > .cell-1)
 */
function showRightColumn() {
  const $left = $('.cell,.original'), $right = $('.cell-1,.original#body1');
  $left.hide();
  $right.show();
  updateColumnStatus();
}

/**
 * 显示左右对照文(.row > .cell-0.col-xs-6)
 */
function showTwoColumns() {
  const $col = $('.cell,.original'),
      count = $($col[0]).closest('.row').children('div').length;

  $col.show();
  $('body').attr('data-col-count', count > 1 ? count : null);
  updateColumnStatus();
}

/**
 * 得到可见栏的栏序
 */
function getVisibleColumns() {
  const $cols = $( $('.cell,.original')[0]).closest('.row').children('.cell:visible');
  return $cols.map(function () {
    const m = Array.from(this.className.matchAll(/cell-(\d+)/g))[0];
    return parseInt(m && m[1]);
  }).get().filter(v => !isNaN(v));
}

/**
 * 更新按钮和菜单状态
 */
function updateColumnStatus() {
  const liXu = $('.hide-xu').closest('li'), $showXu = $('.show-xu'),
      $xu = $('.div-xu'), $more = $('#content .xu-more');

  liXu.toggleClass('disabled', !$xu.length && !$more.length);
  liXu.toggleClass('active', $('body').hasClass('hide-div-xu'));
  $showXu.toggleClass('disabled', !$xu.length && !$more.length);
  $showXu.toggleClass('active', !$('body').hasClass('hide-div-xu'));

  const $left = $('.cell-0,.original#body0'),
      $right = $('.cell-1,.original#body-1'),
      $all = $('.cell,.original'),
      n = $all.filter((_, c) => $(c).is(':visible')).length;

  $('#show-left').closest('li').toggleClass('active', $left.is(':visible') && $right.is(':hidden'));
  $('#show-right').closest('li').toggleClass('active', $left.is(':hidden') && $right.is(':visible'));
  $('#show-both').closest('li').toggleClass('active', n === $all.length);
  $all.closest('#content,#merged').toggleClass('single-article', n === 1);

  $('.toggle-column > button').each(function () {
    const $btn = $(this), text = $btn.text(), idx = parseInt(text) - 1,
        $col = $(`.cell-${idx},.original#body${idx}`);

    if (text === '全') {
      $btn.toggleClass('active', n === $all.length);
    } else if (idx >= 0) {
      $btn.toggleClass('active', $col.is(':visible'));
      $btn.toggle($col.length > 0);
      $btn.attr('title', $col.find('[id][title]').attr('title'));
    }
  });

  $('#show-notes').closest('li').toggleClass('disabled', $('.note-tag').length < 1);
  $('#show-hide-txt').closest('li').toggleClass('disabled', $('.hide-txt').length < 1);
}

/**
 * 设置左右对照等下拉菜单的状态
 */
function initCbLiStatus() {
  const $left = $('.cell-0,.original#body0'), $right = $('.cell-1,.original#body1');

  if ($left.length || $right.length) {
    if ($left.length && $right.length) {
      showTwoColumns();
    } else if (!$right.length) {
      showLeftColumn();
    }
  }

  updateColumnStatus();
}

/**
 * 正文增大字号
 */
function enlargeFont() {
  let fontSize = parseInt($('#content').css('font-size'));
  if (fontSize < 36) {
    fontSize++;
    $('#content, #merged').css('font-size', fontSize + 'px');
  }
}

/**
 * 正文减小字号
 */
function reduceFont() {
  let fontSize = parseInt($('#content').css('font-size'));
  if (fontSize > 8) {
    fontSize--;
    $('#content, #merged').css('font-size', fontSize + 'px');
  }
}

/**
 * 增加科判树的字号
 */
function enlargeKePanFont() {
  let $j = $('#judgments'), fontSize = parseInt($j.css('font-size'));
  if (fontSize < 24) {
    fontSize += 2;
    $j.css('font-size', fontSize + 'px');
  }
}

/**
 * 减小科判树的字号
 */
function reduceKePanFont() {
  let $j = $('#judgments'), fontSize = parseInt($j.css('font-size'));
  if (fontSize > 10) {
    fontSize -= 2;
    $j.css('font-size', fontSize + 'px');
  }
}

/**
 * 设置科判导航栏的宽度比例
 * @param {string} ratio 宽度比例
 */
function setKePanWidth(ratio) {
  if (ratio === 'toggle') {
    ratio = $('body').hasClass('hide-left-bar') ? $('.left-nav').css('width') : '';
  }
  if (parseInt(ratio) > 0) {
    $('body').removeClass('hide-left-bar');
    $('.left-nav').css('width', ratio);
    $('#content').css('padding-left', ratio);
  } else {
    $('body').addClass('hide-left-bar');
    $('#content').css('padding-left', 0);
  }
}

/**
 * 将多个段落编号的串转换为选择器数组
 * @param {string} idsText 空格分隔的段落编号串
 * @returns {string[]} 每个元素为一个段落的选择器串
 * @private
 */
function _toPairSelectors(idsText) {
  return idsText.split(' ').filter(s => s).map(s => {
    if (s && !/[.#-]/.test(s[0])) {
      if (/^\d/.test(s)) {
        s = 'p' + s;
      }
      s = '#' + s;
    }
    return s;
  });
}

/**
 * 将一行编号（格式为“ id id... | id...”）的段落元素从 .original 移到 #merged 的左右对照元素内
 * @param {string} idsText 多行编号，每行用竖线符 | 隔开，编号之间用空格分隔，编号末尾有减号表示转为隐藏文本，有星号为移动原文
 * @return {string} 警告文本
 */
function movePairs(idsText) {
  const $articles = $('.original[id^="body"]'),
      divs = $articles.map((i, a) => `<div class="cell cell-${i}"/>`),
      $row = $(`<div class="row">${divs.get().join('')}</div>`),
      $divs = $row.children('div'),
      colIds = idsText.split('|').map(s => _toPairSelectors(s));
  let count = 0, ret = '';

  if (!$divs.length || !colIds.length) {
    return ret;
  }
  colIds.forEach((ids, col) => {
    let $lg;
    for (let id of ids) {
      let id2 = id.replace(/[*-]+$/, ''), // 编号末尾有减号表示转为隐藏文本
          $el = $(id2 || 'e', $articles[col]),
          parent = $el.parent(),
          xu = $el.closest('.div-xu');

      if ($el.length) {
        $el.remove();
        if (xu.length) {
          $el.addClass($el.text().length > 40 ? 'xu-more' : 'div-xu');
        }
        if (/\*/.test(id)) {
          $el.addClass('moved');
        }
        if (/-[*]?$/.test(id)) {
          $el.addClass('hide-txt');
        } else {
          count++;
        }
        if ($el.hasClass('lg-row')) {
          let parentId = parent.attr('id');
          for (let i = 1; i < 100 && $('#' + parentId, $divs[col]).length; i++) {
            parentId = parent.attr('id') + 'c' + i;
          }
          $lg = $lg || $(`<div id='${parentId}' class="lg" data-line-no="[${parentId}]"/>`).appendTo($divs[col]);
          $lg.append($el);
          if (!parent.childElementCount) {
            parent.hide();
          }
        } else {
          $lg = null;
          $el.appendTo($divs[col]);
        }
      } else if (id2) {
        ret += `${id2.replace(/^[#.]/, '')} 不在第 ${col + 1} 栏中: ${idsText}\n`;
      }
    }
  });
  if (count === 0) {
    $row.addClass('hide-txt');
  }
  $('#merged').append($row);

  console.assert(!ret, ret);
  return ret;
}

/**
 * 单击科判节点后将当前选中文本提取为一个span，并设置其科判编号
 * @param {string} tag 科判标记的属性名，一般为 'ke-pan'
 * @param {string} value 科判编号
 * @param {string} text 科判文本
 */
function convertToSpanWithTag(tag, value, text) {
  let sel = window.getSelection(),  // 选中范围，非IE
      node = sel.anchorNode,  // 选择区的起点对象，要与结束对象focusNode相同，且为P内不属于span的普通文字
      p = node && node.parentElement, // 段落元素，应为P
      selText = sel.toString(); // 选择的文字

  if (selText && selText.trim() && value && text && p && p.tagName === 'P' &&
    node === sel.focusNode && node.nodeName === '#text') {
    p.innerHTML = p.innerHTML.replace(selText, `<span ${tag}="${value}">${selText}</span>`);
  } else {
    console.log(value, text, p);
  }
}

/**
 * 切换显隐正文内的科判标记，段内各项分行显示
 */
function showInlineKePan() {
  const tree = $.jstree && $.jstree.reference('#judgments');

  $('body').toggleClass('show-inline-ke-pan').removeClass('hide-ke-pan-txt');
  $('[ke-pan]').each((i, s) => {
    let $s = $(s), $j = $s.find('.ke-pan-text');

    if ($j.length) {
      $j.remove();
    } else {
      const node = tree && tree.get_node($s.attr('ke-pan'));
      if (node) {
        $j = $('<span class="ke-pan-text">[' + node.text.replace(/^.+、|[(（].+$/g, '') + ']</span>');
        $s.append($j);
      }
    }
  });
}

/**
 * 段内有科判标记的各项分行显示，不显示科判标记
 */
function showInlineWithoutKePan() {
  showInlineKePan();
  $('body').addClass('hide-ke-pan-txt');
  $('#show-inline-no-ke-pan').closest('li').toggleClass('active');
}

/**
 * 高亮显示科判节点对应的正文span片段
 * @param {string|number} kePanId 科判编号
 * @param {boolean|string} scroll 是否自动滚动正文到可见区域，或调用来源，值有 click、nav、footer、false
 * @param {number} [level] 调用层级
 * @returns {jQuery} 对应的正文span片段
 */
function highlightKePan(kePanId, scroll, level) {
  const tree = $.jstree && $.jstree.reference('#judgments');
  let $s = $('[ke-pan="' + kePanId + '"], [ke-pan^="' + kePanId + 'p"]');

  if (!tree) {
    return $s;
  }
  $s.addClass('highlight');
  if ($s[0]) {
    setTimeout(() => {
      $s.removeClass('highlight');
    }, 1000); // flash
  }

  if (!level) {
    $('[ke-pan]').removeClass('active').removeClass('hover');
    if (scroll === 'click') { // 点击正文
      tree.close_all(); // 折叠其它节点
    }
  }
  if (scroll === 'click') { // 点击正文
    tree.open_node(kePanId); // 展开本节点及其子节点
  }
  $s.addClass('active');

  const nodes = tree.get_children_dom(kePanId);
  if (nodes) {
    for (let node of nodes.get()) {
      let r = highlightKePan(node.getAttribute('id'), false, (level || 0) + 1);
      $s = $s[0] ? $s : r;
    }
  }

  if (scroll && scroll !== 'click' && $s[0]) {
    scrollToVisible($s[0]);
  }
  if (scroll && scroll !== 'nav') {
    if (scroll !== 'footer') {
      showKePanPath(kePanId);
    }
    tree.deselect_all(true);
    tree.select_node(kePanId, true);
  }

  return $s;
}

/**
 * 让一个元素滚动到可见区域
 * @param {HTMLElement} element
 */
function scrollToVisible(element) {
  clearTimeout(_scrollTm);
  _scrollTm = setTimeout(() => {
    const r = element && element.getBoundingClientRect();
    if (r && r.height) {
      if (r.top < 50) {
        window.scrollBy(0, r.top - 50);
      }
      if (r.bottom > window.innerHeight - 50) {
        window.scrollBy(0, r.bottom - window.innerHeight + 50);
      }
    }
  }, 50);
}
let _scrollTm;

/**
 * 在状态栏显示科判路径
 * @param {string|number} kePanId 科判编号
 */
function showKePanPath(kePanId) {
  const tree = $.jstree && $.jstree.reference('#judgments');
  const node = tree && tree.get_node(kePanId);
  let texts = [];

  if (node) {
    for (let p of node.parents) {
      let t = tree.get_node(p).text;
      if (t) {
        texts.splice(0, 0, `<a onclick="highlightKePan(${p}, 'footer')">${t}</a>`);
      }
    }
    texts.push(`<a onclick="highlightKePan(${kePanId}, 'footer')">${node.text}</a>`);
  }

  const sel = '[ke-pan="' + kePanId + '"]',
    row = $(sel).closest('.row'),
    leftS = row.find('.cell-0').find(sel),
    rightS = row.find('.cell-1').find(sel);

  $('.ke-pan-path').html(texts.join(' / ') + (texts.length && window.designMode ?
    ' <small>(' + leftS.length + ', ' + rightS.length + ')</small>' : ''));
}

/**
 * 得到元素所在的科判编号
 * @param {HTMLElement} el 元素
 * @returns {number} 科判编号
 */
function getKePanId(el) {
  for (let i = 0; i < 3 && el; i++, el = el.parentElement) {
    if (el.getAttribute('ke-pan')) {
      return parseInt(el.getAttribute('ke-pan'));
    }
  }
}

/**
 * 根据注解锚点插入注解段落
 * @param {jQuery} $side 占一栏的正文，如果只有一栏就可为 null
 * @param {Array[]} notes 每个注解元素为一个数组，其元素个数为三的整数倍，依次为注解ID、原文、注解内容
 * @param {string} [desc] 注解来源
 */
function insertNotes($side, notes, desc) {
  $side = $side || $('#content');
  $side.find('.note-tag').each(function() {
    let $tag = $(this),
      id = parseInt($tag.attr('data-nid')),
      note = notes.filter(item => item[0] === id)[0],
      $judg = $tag.closest('[ke-pan],p,.lg'),
      title = [], rows = [];

    if (!note) {
      return;
    }
    console.assert(note && note.length % 3 === 0, id + ' mismatch');
    for (let i = 0; i + 2 < note.length; i += 3) {
      title.push(note[i + 1]);
      rows.push('<span class="note-item"><span class="org-text">' +
        (note[i + 1].length > 4 ? note[i + 1].substring(0, 3) +
          '<span class="more" data-more="' + note[i + 1].substring(3) + '">…</span>' : note[i + 1]) +
          '</span><span class="note-text">' + note[i + 2] + '</span> ' +
          (desc ? '<span class="note-from" title="双击注解块可隐藏">' + desc + ' ×</span>' : '') + '</span>');
    }
    if (rows.length > 1 && 0) {
      console.log(rows);
      $tag.text($tag.text() + rows.length);
      setTimeout(() => $tag.click() );
    }
    $tag.attr('title', title.join('\n'));

    const $exist = $(`.note-p[data-nid="${id}"]`);
    if ($exist.length && $exist.offset().top < $tag.offset().top) {
      $exist.remove();
      $exist.length = 0;
    }
    if (!$exist.length) {
      $(`<p class="note-p" data-nid="${id}">${rows.join('<br>')}</p>`)
          .insertAfter($judg.closest('.lg').length ? $judg.closest('.lg') : $judg);
    }
  });
}

// 在正文有科判标记的span上鼠标掠过
$(document).on('mouseover', '[ke-pan]', function (e) {
  let kePanId = getKePanId(e.target),
      tree = $.jstree && $.jstree.reference('#judgments'),
      node = tree && tree.get_node(kePanId),
      sel = 'span[ke-pan="' + kePanId + '"]',
      spans = $(sel),
      row = $(e.target).closest('.row');

  $('.hover').removeClass('hover');
  if (spans.length % 2 === 0 && node && tree.get_children_dom(node).length < 1) {
    let leftSpans = row.find('.cell-0').find(sel),
        rightSpans = row.find('.cell-1').find(sel);
    if (leftSpans.length === rightSpans.length) {
      let leftIndex = leftSpans.get().indexOf(e.target),
          rightIndex = rightSpans.get().indexOf(e.target);
      if (leftIndex >= 0) {
        $(rightSpans[leftIndex]).addClass('hover');
        $(leftSpans[leftIndex]).addClass('hover');
      }
      else if (rightIndex >= 0) {
        $(leftSpans[rightIndex]).addClass('hover');
        $(rightSpans[rightIndex]).addClass('hover');
      }
    }
  }
});

// 在正文有科判标记的span上鼠标滑入
$(document).on('mouseenter', '[ke-pan]', function (e) {
  showKePanPath(getKePanId(e.target));
});

// 在正文有科判标记的span上鼠标滑出
$(document).on('mouseleave', '[ke-pan]', function (e) {
  let kePanId = $('[ke-pan].active').attr('ke-pan');
  if (kePanId) {
    showKePanPath(kePanId);
  }
});

// 在正文有科判标记的span上点击
$(document).on('click', '[ke-pan]', function (e) {
  highlightKePan(getKePanId(e.target), 'click');
});

$('.ke-pan-ratio a').on('click', function () {
  setKePanWidth($(this).text());
});

$('#show-line-no').click(toggleLineNo);
$('.hide-xu').click(toggleXu);
$('#show-box').click(toggleParaBox);

$('#show-hide-txt').click(function() {
  $('body').toggleClass('show-hide-txt');
  $(this).closest('li').toggleClass('active');
});

$('.toggle-column > button').click(function () {
  const $btn = $(this), text = $btn.text(), idx = parseInt(text) - 1;

  if (text === '序') {
    return toggleXu();
  }

  if (idx >= 0) {
    $(`.cell-${idx},.original#body${idx}`).toggle(100);
  } else {
    const $all = $('.cell,.original'), n = $all.filter((_, c) => $(c).is(':visible')).length;
    $all.toggle(n !== $all.length);
  }
  setTimeout(() => updateColumnStatus(), 100);
});

$('#show-left').click(showLeftColumn);
$('#show-right').click(showRightColumn);
$('#show-both').click(showTwoColumns);

$('#enlarge-font').click(enlargeFont);
$('#reduce-font').click(reduceFont);
$('#enlarge-ke-pan-font').click(enlargeKePanFont);
$('#reduce-ke-pan-font').click(reduceKePanFont);
$('#show-inline-no-ke-pan').click(showInlineWithoutKePan);

// 单击注解锚点标记则展开注解段落
$(document).on('click', '.note-tag', function (e) {
  const $this = $(e.target),
      id = $this.attr('data-nid'),
      $p = $(`.note-p[data-nid=${id}]`),
      show = !$this.hasClass('note-expanded');

  $p.toggle(100, null, show);
  $(`.note-tag[data-nid=${id}]`).toggleClass('note-expanded', show);
  $(`note[data-nid=${id}]`).toggleClass('note-expanded', show);
  e.stopPropagation();
});

function toggleNoteP(e) {
  const $p = $(e.target).closest('.note-p'),
      id = $p.attr('data-nid'),
      $tag = $(`.note-tag[data-nid=${id}]`);

  $p.toggle(100);
  $tag.toggleClass('note-expanded');
  $(`note[data-nid=${id}]`).toggleClass('note-expanded', $tag.hasClass('note-expanded'));
  e.stopPropagation();
}

// 双击注解段落则收起隐藏
$(document).on('dblclick', '.note-p', toggleNoteP);
$(document).on('click', '.note-p .note-from', toggleNoteP);

// 单击 … 展开文字
$(document).on('click', '.more', function (e) {
  let $s = $(e.target);
  $s.text($s.text() === '…' ? $s.attr('data-more') : '…');
});

// 显隐全部注解
$('#show-notes').click(function() {
  const $tag = $('.note-tag'), expanded = $('.note-tag.note-expanded').length;
  if ($tag.length) {
    $('.note-p').toggle(!expanded);
    $tag.toggleClass('note-expanded', !expanded);
    $('.note-expanded').toggleClass('note-expanded', !expanded);
    $(this).closest('li').toggleClass('active', !expanded);
  }
});

$.fn.changeElementType = function(newType) {
  let newElements = [];
  $(this).each(function() {
    let attrs = {};
    $.each(this.attributes, function(idx, attr) {
      attrs[attr.nodeName] = attr.nodeValue;
    });
    let newElement = $("<" + newType + "/>", attrs).append($(this).contents());
    $(this).replaceWith(newElement);
    newElements.push(newElement);
  });
  return $(newElements);
};

// 转为多列表格以便复制到Word文档
$('#to-table').click(() => {
  if ($('#content table').length) {
    return;
  }
  $('#content').append($('<table><tbody></tbody></table>'));

  let $table = $('#content table'),
    $rows = $('#content > .row'),
    colCount = parseInt($('body').attr('data-col-count')) || 2,
    w = Math.floor(1000 / colCount) / 10;

  $rows.find('[ke-pan]').each((i, el) => {
    $(el).changeElementType('P');
  });
  $rows.each((i, el) => {
    const $tr = $('<tr/>');
    for (let i = 0; i < colCount; i++) {
      const $td = $(`<td class="cell cell-${i}" width="${w}%"/>`).appendTo($tr);
      $td.append($('.cell-' + i, el).html());
    }
    $table.append($tr);
    $(el).remove();
  });
});

initCbLiStatus();
